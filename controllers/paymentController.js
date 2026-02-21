const Razorpay = require('razorpay');
const crypto = require('crypto');
const ProductPurchase = require('../models/ProductPurchase');
const ExploreProduct = require('../models/ExploreProduct');
const Payment = require('../models/Payment');
const PlanUpgrade = require('../models/PlanUpgrade');
const StudentProfile = require('../models/StudentProfile');

const razorpay = new Razorpay({
    key_id: 'rzp_test_RlEXP3KcdFxaDU',
    key_secret: 'IHUC5CwHWJwCgVIuvG7ZAti6'
});

exports.createProductOrder = async (req, res) => {
    try {
        const { productId, amount, currency = 'INR' } = req.body;

        if (!productId || !amount) {
            return res.status(400).json({ message: 'Product ID and Amount are required' });
        }

        const options = {
            amount: amount * 100, // paise
            currency,
            receipt: `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`
        };

        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error('Error creating product order:', error);
        res.status(500).json({ message: 'Error creating Razorpay order', error: error.message });
    }
};

exports.verifyProductPayment = async (req, res) => {
    try {
        const {
            productId,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            amount
        } = req.body;

        // Verify signature
        const shasum = crypto.createHmac('sha256', 'IHUC5CwHWJwCgVIuvG7ZAti6');
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const digest = shasum.digest('hex');

        if (digest !== razorpay_signature) {
            return res.status(400).json({ message: 'Transaction not legitimate!' });
        }

        // Save Payment record (optional but good for tracking)
        const payment = new Payment({
            userId: req.user.id,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            amount: amount,
            status: 'captured'
        });
        await payment.save();

        // Save Product Purchase record
        const purchase = new ProductPurchase({
            userId: req.user.id,
            productId: productId,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            amount: amount
        });
        await purchase.save();

        res.status(200).json({ message: 'Payment verified and purchase recorded successfully', purchase });
    } catch (error) {
        console.error('Error verifying product payment:', error);
        res.status(500).json({ message: 'Error verifying payment', error: error.message });
    }
};

exports.createUpgradeOrder = async (req, res) => {
    try {
        const { amount, newStandard, medium, stream } = req.body;

        if (!amount || !newStandard) {
            return res.status(400).json({ message: 'Amount and New Standard are required' });
        }

        const options = {
            amount: Math.round(amount * 100), // paise
            currency: 'INR',
            receipt: `upg_${Date.now()}_${Math.floor(Math.random() * 1000)}`
        };

        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error('Error creating upgrade order:', error);
        res.status(500).json({ message: 'Error creating Razorpay order', error: error.message });
    }
};

exports.verifyUpgradePayment = async (req, res) => {
    try {
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            amount,
            newStandard,
            medium,
            stream
        } = req.body;

        // Verify signature
        const shasum = crypto.createHmac('sha256', 'IHUC5CwHWJwCgVIuvG7ZAti6');
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const digest = shasum.digest('hex');

        if (digest !== razorpay_signature) {
            return res.status(400).json({ message: 'Transaction not legitimate!' });
        }

        // Find current standard
        const profile = await StudentProfile.findOne({ userId: req.user.id });
        const oldStandard = profile ? profile.std : 'Unknown';

        // Save Upgrade record
        const upgrade = new PlanUpgrade({
            userId: req.user.id,
            oldStandard,
            newStandard,
            medium,
            stream,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            amount: amount
        });
        await upgrade.save();

        // Update Student Profile
        if (profile) {
            profile.std = newStandard;
            profile.medium = medium;
            if (stream) profile.stream = stream;
            await profile.save();
        }

        res.status(200).json({ message: 'Plan upgraded successfully', upgrade });
    } catch (error) {
        console.error('Error verifying upgrade payment:', error);
        res.status(500).json({ message: 'Error verifying payment', error: error.message });
    }
};
