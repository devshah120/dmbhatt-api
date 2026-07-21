const mongoose = require('mongoose');

const ProductPurchaseSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExploreProduct',
        required: true
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
    // Points redeemed against this purchase, and the rupee discount they bought.
    // amount above is what was actually charged, i.e. price - pointsDiscount.
    pointsUsed: {
        type: Number,
        default: 0
    },
    pointsDiscount: {
        type: Number,
        default: 0
    },
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
    },
    appleReceiptData: {
        bundleId: { type: String },
        purchaseDate: { type: Date },
        transactionId: { type: String },
        originalTransactionId: { type: String }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ProductPurchase', ProductPurchaseSchema);
