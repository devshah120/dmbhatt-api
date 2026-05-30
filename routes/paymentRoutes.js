const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

const fs = require('fs');
const path = require('path');

const getRazorpayConfig = () => {
    try {
        const configPath = path.join(__dirname, '../config/payment.json');
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
    } catch (err) {
        console.error('Error reading Razorpay config:', err);
    }
    return {
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
        razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || ''
    };
};

const getRazorpayInstance = () => {
    const config = getRazorpayConfig();
    return new Razorpay({
        key_id: config.razorpayKeyId,
        key_secret: config.razorpayKeySecret
    });
};

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

        const razorpay = getRazorpayInstance();
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
});

// --- Product Purchase Routes ---
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
