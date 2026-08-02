/**
 * Fixes: "E11000 duplicate key error collection: test.users index: phoneNum_1
 *         dup key: { phoneNum: null }" on student/guest registration.
 *
 * Cause: the live `phoneNum_1` index is a PLAIN unique index. The schema says
 * `sparse: true`, but Mongoose never alters an index that already exists, so
 * the original non-sparse index survived. A plain unique index treats every
 * phone-less user as the same key (null), so only ONE user without a phone
 * number can ever exist.
 *
 * Fix: drop the index and rebuild it as a PARTIAL unique index. Partial is used
 * rather than sparse because sparse only skips documents where the field is
 * ABSENT — it still indexes an explicit `null` or `''`. The partial filter below
 * ignores null, '' and absent alike, so any legacy rows written before
 * normalizePhone() existed can no longer collide.
 *
 * The same defect applies to `email` and `referralCode`, which are also
 * optional-but-unique, so they are repaired in the same pass.
 *
 * Safe to re-run: each step is skipped when already in the desired state.
 *
 * Usage (must run from an IP whitelisted in MongoDB Atlas):
 *   node scripts/fixPhoneNumIndex.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

// Unique only among documents where the field is a non-empty string.
const PARTIAL_FILTER = { $type: 'string', $gt: '' };

const TARGETS = [
    { field: 'phoneNum', indexName: 'phoneNum_1' },
    { field: 'email', indexName: 'email_1' },
    { field: 'referralCode', indexName: 'referralCode_1' }
];

const isAlreadyCorrect = (ix) => {
    const pf = ix.partialFilterExpression;
    return !!ix.unique && !!pf && JSON.stringify(pf) === JSON.stringify({ [Object.keys(ix.key)[0]]: PARTIAL_FILTER });
};

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const coll = mongoose.connection.collection('users');
    console.log(`Connected to DB: ${mongoose.connection.name}\n`);

    for (const { field, indexName } of TARGETS) {
        const indexes = await coll.indexes();
        const existing = indexes.find((ix) => ix.name === indexName);

        if (existing && isAlreadyCorrect(existing)) {
            console.log(`[${field}] already a partial unique index — skipping.`);
            continue;
        }

        // Normalise the data BEFORE rebuilding, otherwise duplicate ''/null rows
        // would make createIndex fail.
        const cleared = await coll.updateMany(
            { $or: [{ [field]: null }, { [field]: '' }] },
            { $unset: { [field]: '' } }
        );
        console.log(`[${field}] unset null/empty on ${cleared.modifiedCount} document(s).`);

        if (existing) {
            await coll.dropIndex(indexName);
            console.log(`[${field}] dropped old index ${indexName} (unique=${!!existing.unique}, sparse=${!!existing.sparse}).`);
        }

        // Report any genuine duplicates rather than failing with a bare E11000.
        const dupes = await coll.aggregate([
            { $match: { [field]: { $type: 'string', $gt: '' } } },
            { $group: { _id: `$${field}`, count: { $sum: 1 }, ids: { $push: '$_id' } } },
            { $match: { count: { $gt: 1 } } }
        ]).toArray();

        if (dupes.length) {
            console.error(`\n[${field}] ABORTING: ${dupes.length} real duplicate value(s) found.`);
            console.error('Resolve these manually, then re-run this script:');
            dupes.forEach((d) => console.error(`  ${field}=${d._id} -> ${d.ids.join(', ')}`));
            console.error(`\nNOTE: ${field} is now UNINDEXED. Re-run after cleanup.\n`);
            continue;
        }

        await coll.createIndex(
            { [field]: 1 },
            { unique: true, partialFilterExpression: { [field]: PARTIAL_FILTER }, name: indexName }
        );
        console.log(`[${field}] recreated ${indexName} as a partial unique index.\n`);
    }

    console.log('Final indexes:');
    for (const ix of await coll.indexes()) {
        console.log(`  ${ix.name} unique=${!!ix.unique} sparse=${!!ix.sparse} partial=${JSON.stringify(ix.partialFilterExpression || null)}`);
    }

    await mongoose.disconnect();
    console.log('\nDone.');
})().catch((e) => { console.error(e); process.exit(1); });
