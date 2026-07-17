/**
 * Remove duplicate Payment rows that share a razorpayPaymentId, then add a
 * unique index so the database refuses to create them again.
 *
 * Duplicates arose because both the client verify call and the Razorpay webhook
 * record the same payment; with no unique index, a near-simultaneous pair each
 * passed the "already exists?" check before either inserted (a race).
 *
 * When both rows exist we keep the one with a real Razorpay HMAC signature and
 * drop the 'verified_via_webhook' copy — same payment, so no money is affected.
 *
 * Dry run (default):  node scripts/dedupePayments.js
 * Apply:              node scripts/dedupePayments.js --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Payment = require('../models/Payment');

const APPLY = process.argv.includes('--apply');

const pickKeeper = (rows) => {
    // Prefer a real client HMAC over the webhook/reconciled markers, then oldest.
    const marker = (s) => s === 'verified_via_webhook' || s === 'reconciled_from_razorpay_dashboard';
    const real = rows.filter(r => !marker(r.razorpaySignature));
    const pool = real.length ? real : rows;
    return pool.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
};

(async () => {
    console.log(`\n=== Payment de-duplication — ${APPLY ? 'APPLY' : 'DRY RUN'} ===\n`);
    await mongoose.connect(process.env.MONGODB_URI);

    const groups = await Payment.aggregate([
        { $match: { razorpayPaymentId: { $ne: null } } },
        { $group: { _id: '$razorpayPaymentId', n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } }
    ]);

    let removed = 0;
    for (const g of groups) {
        const rows = await Payment.find({ razorpayPaymentId: g._id });
        const keeper = pickKeeper(rows);
        const drop = rows.filter(r => String(r._id) !== String(keeper._id));

        console.log(`  ${g._id}: keep ${keeper._id} (${keeper.razorpaySignature.slice(0, 22)}), drop ${drop.length}`);
        for (const d of drop) {
            console.log(`      - ${d._id} (${String(d.razorpaySignature).slice(0, 22)})`);
            if (APPLY) await Payment.deleteOne({ _id: d._id });
            removed++;
        }
    }

    console.log(`\n  Duplicate groups: ${groups.length} | rows ${APPLY ? 'removed' : 'to remove'}: ${removed}`);

    // Add the guardrail so this can't recur.
    if (APPLY) {
        try {
            await Payment.collection.createIndex({ razorpayPaymentId: 1 }, { unique: true });
            console.log('  ✓ Unique index on razorpayPaymentId created.');
        } catch (e) {
            console.error('  ✗ Index creation failed (resolve remaining dupes first):', e.message);
        }
    } else {
        console.log('  (apply mode will also add a unique index on razorpayPaymentId)');
    }

    console.log(APPLY ? '\n✓ Done.\n' : '\n  Dry run — nothing changed. Re-run with --apply.\n');
    await mongoose.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
