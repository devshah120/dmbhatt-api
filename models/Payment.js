const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    razorpayOrderId: {
        type: String,
        required: true,
        index: true
    },
    razorpayPaymentId: {
        type: String,
        required: true,
        index: true
    },
    razorpaySignature: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    status: {
        type: String,
        enum: ['captured', 'failed', 'refunded'],
        default: 'captured'
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

module.exports = mongoose.model('Payment', paymentSchema);
