/**
 * One-time cleanup: remove records left behind by students who were deleted before
 * the delete-student endpoints cascaded (see utils/studentCleanup.js).
 *
 * These orphans are why the admin "Plan Purchases" / "Product Purchases" screens show
 * rows with a "?" avatar and an em-dash name: the purchase still exists, but the User
 * it points at is gone.
 *
 * A record counts as orphaned when its userId/studentId does not match any existing
 * User (or, for MatchFollowingExamResult, any existing StudentProfile).
 *
 * Usage:
 *   node scripts/cleanupOrphanedStudentData.js            # dry run - reports only, deletes nothing
 *   node scripts/cleanupOrphanedStudentData.js --apply    # actually delete the orphans
 */
require('dotenv').config();
const mongoose = require('mongoose');

const {
    STUDENT_OWNED_COLLECTIONS,
    PROFILE_OWNED_COLLECTIONS
} = require('../utils/studentCleanup');

const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const RedeemCode = require('../models/RedeemCode');

const APPLY = process.argv.includes('--apply');

/**
 * Return the ids of documents in `Model` whose `field` does not resolve to a live
 * document in `refCollection`. Uses $lookup so the whole check runs inside MongoDB.
 */
const findOrphanIds = async (Model, field, refCollection) => {
    const rows = await Model.aggregate([
        { $match: { [field]: { $ne: null } } },
        {
            $lookup: {
                from: refCollection,
                localField: field,
                foreignField: '_id',
                as: 'ref'
            }
        },
        { $match: { ref: { $size: 0 } } },
        { $project: { _id: 1, [field]: 1 } }
    ]);
    return rows;
};

const run = async () => {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not set in the environment');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Connected to MongoDB (db: ${mongoose.connection.name})`);
    console.log(APPLY
        ? '\n*** APPLY MODE - orphaned records WILL be deleted ***\n'
        : '\n*** DRY RUN - nothing will be deleted. Re-run with --apply to delete. ***\n');

    const targets = [
        ...STUDENT_OWNED_COLLECTIONS.map((c) => ({ ...c, refCollection: 'users' })),
        ...PROFILE_OWNED_COLLECTIONS.map((c) => ({ ...c, refCollection: 'studentprofiles' }))
    ];

    let grandTotal = 0;
    const orphanedUserIds = new Set();

    for (const { model, field, refCollection } of targets) {
        const Model = require(`../models/${model}`);
        const orphans = await findOrphanIds(Model, field, refCollection);

        if (orphans.length === 0) {
            console.log(`  ${model.padEnd(24)} clean`);
            continue;
        }

        grandTotal += orphans.length;
        orphans.forEach((o) => {
            if (refCollection === 'users' && o[field]) orphanedUserIds.add(String(o[field]));
        });

        console.log(`  ${model.padEnd(24)} ${orphans.length} orphaned (dangling ${field})`);

        if (APPLY) {
            const res = await Model.deleteMany({ _id: { $in: orphans.map((o) => o._id) } });
            console.log(`  ${''.padEnd(24)} -> deleted ${res.deletedCount}`);
        }
    }

    // Redeem codes are admin-owned assets: keep the code, just strip usage entries that
    // point at users who no longer exist.
    const staleRedeem = await RedeemCode.find({
        $or: [
            { usedBy: { $ne: null } },
            { 'usageHistory.usedBy': { $ne: null } }
        ]
    }).select('_id code usedBy usageHistory').lean();

    const liveUserIds = new Set(
        (await User.find({}).select('_id').lean()).map((u) => String(u._id))
    );

    let redeemTouched = 0;
    for (const rc of staleRedeem) {
        const deadUsedBy = rc.usedBy && !liveUserIds.has(String(rc.usedBy));
        const deadHistory = (rc.usageHistory || []).filter(
            (h) => h.usedBy && !liveUserIds.has(String(h.usedBy))
        );
        if (!deadUsedBy && deadHistory.length === 0) continue;

        redeemTouched += 1;
        if (APPLY) {
            const update = {};
            if (deadUsedBy) update.$unset = { usedBy: '' };
            if (deadHistory.length) {
                // Pull exactly the entries whose user is gone, leaving live ones intact.
                update.$pull = {
                    usageHistory: { usedBy: { $in: deadHistory.map((h) => h.usedBy) } }
                };
            }
            await RedeemCode.updateOne({ _id: rc._id }, update);
        }
    }
    console.log(`  ${'RedeemCode (detach only)'.padEnd(24)} ${redeemTouched} with dangling usage refs`
        + (APPLY && redeemTouched ? ' -> detached' : ''));

    // Referral back-references on surviving users.
    const danglingReferredBy = await findOrphanIds(User, 'referredBy', 'users');
    console.log(`  ${'User.referredBy'.padEnd(24)} ${danglingReferredBy.length} dangling`);
    if (APPLY && danglingReferredBy.length) {
        await User.updateMany(
            { _id: { $in: danglingReferredBy.map((u) => u._id) } },
            { $unset: { referredBy: '' } }
        );
        console.log(`  ${''.padEnd(24)} -> cleared`);
    }

    // Orphaned StudentProfiles may exist independently; also flag users with no profile
    // is NOT an error (admins have no StudentProfile), so we only report the reverse.

    console.log('\n' + '-'.repeat(60));
    console.log(`Orphaned records found: ${grandTotal}`);
    console.log(`Distinct deleted-user ids referenced: ${orphanedUserIds.size}`);
    if (orphanedUserIds.size) {
        console.log('Deleted user ids still referenced:');
        [...orphanedUserIds].forEach((id) => console.log(`   ${id}`));
    }
    console.log(APPLY
        ? '\nDone. Orphaned records deleted.'
        : '\nDry run complete. Re-run with --apply to delete these records.');

    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error('Cleanup failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
