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
        type: String
    },
    razorpayPaymentId: {
        type: String,
        unique: true,
        sparse: true
    },
    appleTransactionId: {
        type: String
    },
    amount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['razorpay', 'apple'],
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'refunded'],
        default: 'active'
    },
    redeemCode: {
        type: String
    },
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
    },
    appleReceiptData: {
        bundleId: { type: String },
        purchaseDate: { type: Date },
        expiresDate: { type: Date },
        transactionId: { type: String },
        originalTransactionId: { type: String }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('PlanUpgrade', PlanUpgradeSchema);
