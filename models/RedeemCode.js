const mongoose = require('mongoose');

const redeemCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    discount: {
        type: Number,
        required: true,
        min: 1,
        validate: {
            validator: function (value) {
                if (this.discountType === 'percentage') return value <= 70;
                return true;
            },
            message: 'Percentage discount cannot exceed 70%'
        }
    },
    discountType: {
        type: String,
        enum: ['flat', 'percentage'],
        default: 'percentage'
    },
    board: String,
    std: String,
    medium: String,
    stream: String,
    createdBy: {
        type: String,
        required: true
    },
    // maxUses: 1 = single-use, >1 = capped multi-use, null/0 = unlimited multi-use
    maxUses: {
        type: Number,
        default: 1
    },
    // null/undefined = never expires
    expiresAt: {
        type: Date,
        default: null
    },
    usedCount: {
        type: Number,
        default: 0
    },
    // Legacy single-use fields, kept for backward compatibility with existing records/queries
    used: {
        type: Boolean,
        default: false
    },
    usedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    usedAt: {
        type: Date
    },
    // Full usage history for multi-use codes
    usageHistory: [{
        usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

redeemCodeSchema.methods.isExhausted = function () {
    if (!this.maxUses || this.maxUses <= 0) return false; // unlimited
    return this.usedCount >= this.maxUses;
};

redeemCodeSchema.methods.isExpired = function () {
    if (!this.expiresAt) return false; // never expires
    return new Date() > this.expiresAt;
};

redeemCodeSchema.methods.recordUsage = function (userId) {
    this.usedCount += 1;
    this.usageHistory.push({ usedBy: userId, usedAt: new Date() });
    // Keep legacy fields in sync for any code still reading them directly
    this.usedBy = userId;
    this.usedAt = new Date();
    if (this.isExhausted()) {
        this.used = true;
    }
};

module.exports = mongoose.model('RedeemCode', redeemCodeSchema);
