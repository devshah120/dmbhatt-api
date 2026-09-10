// One-off: reset a user's login password (stored as loginCodeHash).
// Reuses the app's own model + hashing helper so the result matches real login.
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');
const { hashLoginCode, compareLoginCode } = require('../utils/helpers');

const EMAIL = 'devmistrypro490@gmail.com';
const NEW_PASSWORD = 'Dev@1234';

(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const user = await User.findOne({ email: EMAIL.toLowerCase().trim() });
        if (!user) {
            console.error(`No user found with email: ${EMAIL}`);
            process.exitCode = 1;
            return;
        }

        console.log('User found:');
        console.log('  _id      :', user._id.toString());
        console.log('  firstName:', user.firstName);
        console.log('  role     :', user.role);
        console.log('  email    :', user.email);
        console.log('  phoneNum :', user.phoneNum);

        user.loginCodeHash = await hashLoginCode(NEW_PASSWORD);
        await user.save();

        // Verify the new password actually validates against the stored hash.
        const fresh = await User.findById(user._id).select('+loginCodeHash');
        const ok = await compareLoginCode(NEW_PASSWORD, fresh.loginCodeHash);
        console.log(ok
            ? `\n✅ Password updated and verified for ${EMAIL} -> "${NEW_PASSWORD}"`
            : '\n❌ Update saved but verification FAILED — investigate.');
        if (!ok) process.exitCode = 1;
    } catch (err) {
        console.error('Error:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
})();
