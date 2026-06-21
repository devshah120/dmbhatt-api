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

// Auto-increment invoice number - Run BEFORE validation
invoiceSchema.pre('validate', async function (next) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INVOICE_HOOK] Pre-validate hook triggered - isNew: ${this.isNew}, invoiceNumber: ${this.invoiceNumber}`);

    if (this.isNew && !this.invoiceNumber) {
        try {
            console.log(`[${timestamp}] [INVOICE_HOOK] Generating new invoice number...`);
            const count = await mongoose.model('Invoice').countDocuments();
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            this.invoiceNumber = `INV-${year}-${month}-${String(count + 1).padStart(4, '0')}`;
            console.log(`[${timestamp}] [INVOICE_HOOK] ✓ Invoice number generated: ${this.invoiceNumber}`);
        } catch (error) {
            console.error(`[${timestamp}] [INVOICE_HOOK] ✗ Failed to generate invoice number`);
            console.error(`[${timestamp}] [INVOICE_HOOK] Error:`, error.message);
            return next(error);
        }
    } else if (this.isNew) {
        console.log(`[${timestamp}] [INVOICE_HOOK] Invoice number already provided: ${this.invoiceNumber}`);
    }
    next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
