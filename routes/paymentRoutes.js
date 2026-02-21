const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

const razorpay = new Razorpay({
    key_id: 'rzp_test_RlEXP3KcdFxaDU',
    key_secret: 'IHUC5CwHWJwCgVIuvG7ZAti6'
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

module.exports = router;
