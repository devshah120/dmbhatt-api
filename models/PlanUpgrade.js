const mongoose = require('mongoose');

const PlanUpgradeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    oldStandard: {
        type: String,
        required: true
    },
    newStandard: {
        type: String,
        required: true
    },
    medium: {
        type: String,
        required: true
    },
    stream: {
        type: String
    },
    razorpayOrderId: {
        type: String,
        required: true
    },
    razorpayPaymentId: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('PlanUpgrade', PlanUpgradeSchema);
