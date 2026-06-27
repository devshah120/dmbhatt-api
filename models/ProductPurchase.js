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
