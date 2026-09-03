/**
 * One-off backfill: Zainab's iOS membership purchase was recorded with amount:0
 * because verifyAppleMembership hardcoded amount:0 (fixed in paymentController.js).
 * RevenueCat confirms the actual charge was INR 149 for the "10th Standard" plan
 * on 2026-08-31. This finds her Payment row(s) with amount 0 / apple_iap and
 * updates them to the real amount.
 *
 * Dry run (default):  node scripts/fixZainabApplePayment.js
 * Apply:              node scripts/fixZainabApplePayment.js --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');

const APPLY = process.argv.includes('--apply');
const CORRECT_AMOUNT = 149;

(async () => {
    console.log(`\n=== Zainab Apple payment backfill — ${APPLY ? 'APPLY' : 'DRY RUN'} ===\n`);
    await mongoose.connect(process.env.MONGODB_URI);

    const phone = '9574826050';
    const users = await User.find({ phoneNum: phone });
    if (!users.length) {
        console.log(`No user found with phone ${phone}`);
        await mongoose.disconnect();
        return;
    }

    for (const user of users) {
        console.log(`User: ${user.email || '-'} / ${user.phoneNum} (${user._id})`);

        const payments = await Payment.find({
            userId: user._id,
            razorpaySignature: 'apple_iap',
            amount: 0
        });

        if (!payments.length) {
            console.log('  No zero-amount Apple payments found.');
            continue;
        }

        for (const p of payments) {
            console.log(`  Payment ${p._id}: amount ${p.amount} -> ${CORRECT_AMOUNT}, createdAt ${p.createdAt.toISOString()}`);
            if (APPLY) {
                p.amount = CORRECT_AMOUNT;
                await p.save();
                console.log('    ✓ updated');
            }
        }
    }

    await mongoose.disconnect();
    console.log(`\nDone. ${APPLY ? 'Changes applied.' : 'Dry run only — rerun with --apply to write changes.'}\n`);
})();
