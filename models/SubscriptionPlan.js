const mongoose = require('mongoose');

const SubscriptionPlanSchema = new mongoose.Schema({
    standard: {
        type: String,
        required: true,
        enum: ['6', '7', '8', '9', '10', '11', '12'],
        unique: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    description: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
SubscriptionPlanSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
