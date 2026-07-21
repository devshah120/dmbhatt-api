const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const paymentController = require('../controllers/paymentController');
const razorpayWebhookController = require('../controllers/razorpayWebhookController');
const { protect } = require('../middleware/authMiddleware');
const NotificationConfig = require('../models/NotificationConfig');

// --- Razorpay Webhook ---
// Unauthenticated by design: Razorpay calls this directly and authenticates via
// the x-razorpay-signature HMAC, not a user token. express.raw is required
// because that signature is computed over the exact bytes sent — the global
// express.json() would reparse the body and invalidate it.
router.post(
    '/webhook/razorpay',
    express.raw({ type: 'application/json' }),
    razorpayWebhookController.handleRazorpayWebhook
);

const getRazorpayConfig = async () => {
    try {
        // Try to get from database first (NotificationConfig)
        const config = await NotificationConfig.findOne();
        if (config && config.razorpayKeyId && config.razorpayKeySecret) {
            console.log('[RAZORPAY_CONFIG] ✓ Config loaded from database (NotificationConfig)');
            return {
                razorpayKeyId: config.razorpayKeyId,
                razorpayKeySecret: config.razorpayKeySecret
            };
        }
    } catch (err) {
        console.error('[RAZORPAY_CONFIG] Error reading from database:', err.message);
    }

    // Fallback to environment variables
    console.log('[RAZORPAY_CONFIG] ✓ Using environment variables as fallback');
    return {
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
        razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || ''
    };
};

const getRazorpayInstance = async () => {
    const config = await getRazorpayConfig();
    return new Razorpay({
        key_id: config.razorpayKeyId,
        key_secret: config.razorpayKeySecret
    });
};

// Get Payment Config endpoint (for app to fetch Razorpay Key ID)
router.get('/config/payment', async (req, res) => {
    try {
        const config = await getRazorpayConfig();
        // Only return the Key ID, not the secret
        res.json({
            razorpayKeyId: config.razorpayKeyId
        });
    } catch (error) {
        console.error('Error fetching payment config:', error);
        res.status(500).json({ message: 'Error fetching payment config', error: error.message });
    }
});

router.post('/create-order', async (req, res) => {
    // ... existing generic order logic
    try {
        const { amount, currency = 'INR', receipt } = req.body;

        if (!amount) {
            return res.status(400).json({ message: 'Amount is required' });
        }

        const options = {
            amount: amount * 100, // amount in smallest currency unit (paise)
            currency,
            receipt
        };

        const razorpay = await getRazorpayInstance();
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
});

// --- Product Purchase Routes ---
router.get('/product/:productId/quote', protect, paymentController.getProductQuote);
router.post('/product/create-order', protect, paymentController.createProductOrder);
router.post('/product/verify', protect, paymentController.verifyProductPayment);

// --- Plan Upgrade Routes ---
router.post('/upgrade/create-order', protect, paymentController.createUpgradeOrder);
router.post('/upgrade/verify', protect, paymentController.verifyUpgradePayment);

// --- Apple In-App Purchase Routes ---
router.post('/apple/verify-membership', protect, paymentController.verifyAppleMembership);
router.post('/apple/verify-upgrade', protect, paymentController.verifyAppleUpgrade);
router.post('/apple/verify-product', protect, paymentController.verifyAppleProductPurchase);

module.exports = router;
