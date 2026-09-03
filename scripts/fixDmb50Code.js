/**
 * One-time fix for the DMB50 redeem code:
 *   - un-revoke it (so it can be redeemed again)
 *   - switch it from 50% off to a flat Rs.100 off
 *
 * Usage:
 *   node scripts/fixDmb50Code.js            # dry run - reports only, changes nothing
 *   node scripts/fixDmb50Code.js --apply    # actually apply the change
 */
require('dotenv').config();
const mongoose = require('mongoose');
const RedeemCode = require('../models/RedeemCode');

const APPLY = process.argv.includes('--apply');
const TARGET_CODE = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]) || 'DMB50';

const run = async () => {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not set in the environment');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Connected to MongoDB (db: ${mongoose.connection.name})`);
    console.log(APPLY
        ? '\n*** APPLY MODE - the code WILL be updated ***\n'
        : '\n*** DRY RUN - nothing will be changed. Re-run with --apply to update. ***\n');

    const code = await RedeemCode.findOne({ code: TARGET_CODE.toUpperCase() });
    if (!code) {
        console.log(`No redeem code found for "${TARGET_CODE}"`);
        await mongoose.connection.close();
        return;
    }

    console.log('Current state:', {
        code: code.code,
        discount: code.discount,
        discountType: code.discountType,
        revoked: code.revoked,
        usedCount: code.usedCount,
        maxUses: code.maxUses
    });

    if (!APPLY) {
        console.log('\nWould set: discount=100, discountType=flat, revoked=false, revokedAt=null, revokedBy=null');
        await mongoose.connection.close();
        return;
    }

    code.discount = 100;
    code.discountType = 'flat';
    code.revoked = false;
    code.revokedAt = null;
    code.revokedBy = null;
    await code.save();

    console.log('\nUpdated state:', {
        code: code.code,
        discount: code.discount,
        discountType: code.discountType,
        revoked: code.revoked
    });

    await mongoose.connection.close();
};

run().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
