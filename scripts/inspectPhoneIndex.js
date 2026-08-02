/**
 * Read-only diagnostic: prints the users collection indexes and how many
 * documents carry a null/empty/absent phoneNum.
 *
 * Usage: node scripts/inspectPhoneIndex.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const coll = mongoose.connection.collection('users');
    console.log('DB:', mongoose.connection.name);
    const indexes = await coll.indexes();
    for (const ix of indexes) {
        console.log(JSON.stringify({
            name: ix.name,
            key: ix.key,
            unique: !!ix.unique,
            sparse: !!ix.sparse,
            partial: ix.partialFilterExpression
        }));
    }
    console.log('phoneNum null:', await coll.countDocuments({ phoneNum: null }));
    console.log('phoneNum empty string:', await coll.countDocuments({ phoneNum: '' }));
    console.log('phoneNum absent:', await coll.countDocuments({ phoneNum: { $exists: false } }));
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
