/**
 * One-time migration: drop the stale UNIQUE indexes on the `payments` collection.
 *
 * Background:
 *   The Payment schema originally declared `razorpayOrderId` and `razorpayPaymentId`
 *   as `unique: true`. For Apple IAP this breaks legitimate repeat purchases because
 *   Apple's SANDBOX reuses the same transaction_id across test buys, causing
 *   "E11000 duplicate key error ... razorpayPaymentId_1".
 *
 *   We removed `unique: true` from the schema, but Mongoose never drops an index that
 *   already exists in the database. This script removes the old unique indexes so the
 *   non-unique ones (recreated automatically on next app start) take effect.
 *
 * Usage:
 *   node scripts/dropPaymentUniqueIndexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const UNIQUE_INDEXES_TO_DROP = ['razorpayOrderId_1', 'razorpayPaymentId_1'];

(async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not set in the environment');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✓ Connected to MongoDB');

        const collection = mongoose.connection.db.collection('payments');
        const indexes = await collection.indexes();
        console.log('Current indexes on payments:', indexes.map(i => i.name).join(', '));

        for (const indexName of UNIQUE_INDEXES_TO_DROP) {
            const existing = indexes.find(i => i.name === indexName);
            if (!existing) {
                console.log(`- ${indexName}: not found, skipping`);
                continue;
            }
            if (!existing.unique) {
                console.log(`- ${indexName}: already non-unique, skipping`);
                continue;
            }
            await collection.dropIndex(indexName);
            console.log(`✓ Dropped unique index: ${indexName}`);
        }

        console.log('\nDone. Restart the API so Mongoose recreates the non-unique indexes.');
    } catch (err) {
        console.error('✗ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.connection.close();
    }
})();
