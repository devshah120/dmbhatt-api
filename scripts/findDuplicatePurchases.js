/**
 * Read-only report: finds PlanUpgrade / ProductPurchase records that share the same
 * razorpayPaymentId (duplicates caused by the missing idempotency check, now fixed
 * in paymentController.js).
 *
 * Usage:
 *   node scripts/findDuplicatePurchases.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PlanUpgrade = require('../models/PlanUpgrade');
const ProductPurchase = require('../models/ProductPurchase');

(async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not set in the environment');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✓ Connected to MongoDB\n');

        for (const [label, Model] of [['PlanUpgrade', PlanUpgrade], ['ProductPurchase', ProductPurchase]]) {
            console.log(`=== Duplicate ${label} records (same razorpayPaymentId) ===`);
            const dupes = await Model.aggregate([
                { $match: { razorpayPaymentId: { $exists: true, $ne: null, $ne: '' } } },
                {
                    $group: {
                        _id: '$razorpayPaymentId',
                        count: { $sum: 1 },
                        ids: { $push: '$_id' },
                        userIds: { $push: '$userId' },
                        amounts: { $push: '$amount' },
                        createdAts: { $push: '$createdAt' }
                    }
                },
                { $match: { count: { $gt: 1 } } },
                { $sort: { count: -1 } }
            ]);

            if (dupes.length === 0) {
                console.log('  None found.\n');
                continue;
            }

            for (const d of dupes) {
                console.log(`  razorpayPaymentId=${d._id}  count=${d.count}`);
                console.log(`    docIds:     ${d.ids.join(', ')}`);
                console.log(`    userIds:    ${d.userIds.join(', ')}`);
                console.log(`    amounts:    ${d.amounts.join(', ')}`);
                console.log(`    createdAts: ${d.createdAts.map(x => new Date(x).toISOString()).join(', ')}`);
            }
            console.log(`  Total duplicate groups: ${dupes.length}\n`);
        }

        console.log('Done. This script made no changes.');
    } catch (err) {
        console.error('✗ Script failed:', err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.connection.close();
    }
})();
