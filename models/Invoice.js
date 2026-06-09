const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        unique: true,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    paymentType: {
        type: String,
        enum: ['product', 'subscription', 'upgrade'],
        required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExploreProduct'
    },
    description: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    razorpayPaymentId: {
        type: String,
        required: true
    },
    razorpayOrderId: {
        type: String
    },
    filePath: {
        type: String,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    emailSent: {
        type: Boolean,
        default: false
    },
    emailSentAt: {
        type: Date
    },
    emailError: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-increment invoice number
invoiceSchema.pre('save', async function (next) {
    if (this.isNew && !this.invoiceNumber) {
        try {
            const count = await mongoose.model('Invoice').countDocuments();
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            this.invoiceNumber = `INV-${year}-${month}-${String(count + 1).padStart(4, '0')}`;
        } catch (error) {
            next(error);
        }
    }
    next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
