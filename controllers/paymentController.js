const Razorpay = require('razorpay');
const crypto = require('crypto');
const ProductPurchase = require('../models/ProductPurchase');
const ExploreProduct = require('../models/ExploreProduct');
const Payment = require('../models/Payment');
const PlanUpgrade = require('../models/PlanUpgrade');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
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
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET
    };
};

const getRazorpayInstance = () => {
    const config = getRazorpayConfig();
    return new Razorpay({
        key_id: config.razorpayKeyId,
        key_secret: config.razorpayKeySecret
    });
};

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

        const razorpay = getRazorpayInstance();
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
        const config = getRazorpayConfig();
        const shasum = crypto.createHmac('sha256', config.razorpayKeySecret);
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

        const razorpay = getRazorpayInstance();
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
            amount: amount,
            redeemCode: req.body.redeemCode
        });
        await upgrade.save();

        // Mark Redeem Code as Used
        if (req.body.redeemCode) {
            const RedeemCode = require('../models/RedeemCode');
            await RedeemCode.findOneAndUpdate(
                { code: req.body.redeemCode.toUpperCase() },
                { 
                    used: true, 
                    usedBy: req.user.id, 
                    usedAt: new Date() 
                }
            );
        }

        // Update Student Profile
        if (profile) {
            profile.std = newStandard;
            profile.medium = medium;
            if (stream) profile.stream = stream;
            await profile.save();
        }

        // Update User isPaid status
        await User.findByIdAndUpdate(req.user.id, { isPaid: true });

        res.status(200).json({ message: 'Plan upgraded successfully', upgrade });
    } catch (error) {
        console.error('Error verifying upgrade payment:', error);
        res.status(500).json({ message: 'Error verifying payment', error: error.message });
    }
};

// ============================================================
// Apple In-App Purchase Verification
// ============================================================

const APPLE_VERIFY_RECEIPT_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_RECEIPT_PRODUCTION = 'https://buy.itunes.apple.com/verifyReceipt';

/**
 * Verify Apple receipt with Apple servers
 * Auto-retries with sandbox if production returns status 21007
 */
const verifyAppleReceipt = async (receiptData) => {
    const https = require('https');
    const fetch = require('node-fetch') || global.fetch;

    const verifyWithUrl = async (url) => {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                'receipt-data': receiptData,
                // Add password here if you have an App-Specific Shared Secret
                // 'password': 'YOUR_SHARED_SECRET'
            })
        });
        return response.json();
    };

    // Try production first
    let result = await verifyWithUrl(APPLE_VERIFY_RECEIPT_PRODUCTION);

    // If status 21007 — receipt is from sandbox, retry with sandbox URL
    if (result.status === 21007) {
        result = await verifyWithUrl(APPLE_VERIFY_RECEIPT_SANDBOX);
    }

    return result;
};

/**
 * Apple IAP: Verify Membership Purchase (Registration)
 */
exports.verifyAppleMembership = async (req, res) => {
    try {
        const { receipt, productId, transactionId, standard, medium, stream } = req.body;

        if (!receipt || !productId || !transactionId) {
            return res.status(400).json({ message: 'Receipt, productId, and transactionId are required' });
        }

        // Verify with Apple
        const appleResult = await verifyAppleReceipt(receipt);

        if (appleResult.status !== 0) {
            console.error('Apple receipt verification failed. Status:', appleResult.status);
            return res.status(400).json({ message: 'Apple receipt verification failed', status: appleResult.status });
        }

        // Save Payment record
        const payment = new Payment({
            userId: req.user.id,
            razorpayOrderId: `apple_${transactionId}`,
            razorpayPaymentId: transactionId,
            razorpaySignature: 'apple_iap',
            amount: 0, // Apple handles pricing
            status: 'captured'
        });
        await payment.save();

        // Mark user as paid
        await User.findByIdAndUpdate(req.user.id, { isPaid: true });

        res.status(200).json({ message: 'Apple membership verified successfully' });
    } catch (error) {
        console.error('Error verifying Apple membership:', error);
        res.status(500).json({ message: 'Error verifying Apple purchase', error: error.message });
    }
};

/**
 * Apple IAP: Verify Upgrade Purchase
 */
exports.verifyAppleUpgrade = async (req, res) => {
    try {
        const { receipt, productId, transactionId, newStandard, medium, stream, amount } = req.body;

        if (!receipt || !productId || !transactionId || !newStandard) {
            return res.status(400).json({ message: 'Receipt, productId, transactionId, and newStandard are required' });
        }

        // Verify with Apple
        const appleResult = await verifyAppleReceipt(receipt);

        if (appleResult.status !== 0) {
            console.error('Apple receipt verification failed. Status:', appleResult.status);
            return res.status(400).json({ message: 'Apple receipt verification failed', status: appleResult.status });
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
            razorpayOrderId: `apple_${transactionId}`,
            razorpayPaymentId: transactionId,
            amount: amount || 0
        });
        await upgrade.save();

        // Update Student Profile
        if (profile) {
            profile.std = newStandard;
            profile.medium = medium;
            if (stream) profile.stream = stream;
            await profile.save();
        }

        // Update User isPaid status
        await User.findByIdAndUpdate(req.user.id, { isPaid: true });

        res.status(200).json({ message: 'Plan upgraded successfully via Apple IAP', upgrade });
    } catch (error) {
        console.error('Error verifying Apple upgrade:', error);
        res.status(500).json({ message: 'Error verifying Apple purchase', error: error.message });
    }
};

/**
 * Apple IAP: Verify Product/Material Purchase
 */
exports.verifyAppleProductPurchase = async (req, res) => {
    try {
        const { receipt, productId, transactionId, materialProductId, amount } = req.body;

        if (!receipt || !productId || !transactionId || !materialProductId) {
            return res.status(400).json({ message: 'Receipt, productId, transactionId, and materialProductId are required' });
        }

        // Verify with Apple
        const appleResult = await verifyAppleReceipt(receipt);

        if (appleResult.status !== 0) {
            console.error('Apple receipt verification failed. Status:', appleResult.status);
            return res.status(400).json({ message: 'Apple receipt verification failed', status: appleResult.status });
        }

        // Save Payment record
        const payment = new Payment({
            userId: req.user.id,
            razorpayOrderId: `apple_${transactionId}`,
            razorpayPaymentId: transactionId,
            razorpaySignature: 'apple_iap',
            amount: amount || 0,
            status: 'captured'
        });
        await payment.save();

        // Save Product Purchase record
        const purchase = new ProductPurchase({
            userId: req.user.id,
            productId: materialProductId,
            razorpayOrderId: `apple_${transactionId}`,
            razorpayPaymentId: transactionId,
            amount: amount || 0
        });
        await purchase.save();

        res.status(200).json({ message: 'Apple product purchase verified successfully', purchase });
    } catch (error) {
        console.error('Error verifying Apple product purchase:', error);
        res.status(500).json({ message: 'Error verifying Apple purchase', error: error.message });
    }
};

