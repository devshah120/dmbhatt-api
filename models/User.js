const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    role: {
        type: String,
        required: true,
        enum: ['admin', 'student', 'guest', 'super admin']
    },
    // Common fields
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    // Uniqueness for phoneNum/email is declared as a partial index below rather
    // than with `unique + sparse` here. Sparse only skips documents where the
    // field is ABSENT, so an explicit null or '' still gets indexed and a second
    // phone-less user collides with E11000 dup key { phoneNum: null }.
    phoneNum: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        lowercase: true,
        trim: true
    },
    loginCodeHash: {
        type: String,
        required: true
    },
    // Optional fields
    photoPath: {
        type: String // For student and guest
    },
    dob: {
        type: Date
    },
    address: {
        street: String,
        city: String,
        state: String,
        pincode: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Referral fields
    referralCode: {
        type: String
    },
    bonusPoints: {
        type: Number,
        default: 0
    },
    invitedFriends: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        name: String,
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isPaid: {
        type: Boolean,
        default: false
    },
    resetPasswordOTP: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    },
    deletedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

userSchema.index({ role: 1 });

// Optional-but-unique identifiers. The partial filter restricts the index to
// documents holding a non-empty string, so any number of users may have no
// phone number, no email, or no referral code without colliding.
// NOTE: Mongoose will NOT modify an index that already exists under the same
// name — run `node scripts/fixPhoneNumIndex.js` once against an existing
// database to replace the legacy non-partial indexes.
const optionalUnique = (field) => userSchema.index(
    { [field]: 1 },
    { unique: true, partialFilterExpression: { [field]: { $type: 'string', $gt: '' } } }
);

optionalUnique('phoneNum');
optionalUnique('email');
optionalUnique('referralCode');

module.exports = mongoose.model('User', userSchema);
