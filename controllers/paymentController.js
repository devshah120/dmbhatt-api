const Razorpay = require('razorpay');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const ProductPurchase = require('../models/ProductPurchase');
const ExploreProduct = require('../models/ExploreProduct');
const Payment = require('../models/Payment');
const PlanUpgrade = require('../models/PlanUpgrade');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const { generateInvoice } = require('../utils/invoiceGenerator');
const NotificationConfig = require('../models/NotificationConfig');
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

// Helper function to send invoice email
const sendInvoiceEmail = async (user, invoiceData) => {
    try {
        const config = await NotificationConfig.findOne();

        if (!config?.emailHost || !config?.emailUser || !config?.emailPassword) {
            console.warn('⚠️ SMTP not configured - invoice email will not be sent');
            return false;
        }

        const transporter = nodemailer.createTransport({
            host: config.emailHost,
            port: parseInt(config.emailPort) || 587,
            secure: parseInt(config.emailPort) === 465,
            auth: {
                user: config.emailUser,
                pass: config.emailPassword
            }
        });

        const mailOptions = {
            from: `"${config.emailFromName || 'Padhaku'}" <${config.emailUser}>`,
            to: user.email,
            subject: `Invoice #${invoiceData.invoiceNumber} - Padhaku Desk`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Invoice Confirmation</h2>
                    <p>Dear ${user.firstName},</p>
                    <p>Thank you for your purchase! Your invoice has been generated and is attached to this email.</p>
                    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Invoice Details:</strong></p>
                        <p>Invoice #: ${invoiceData.invoiceNumber}</p>
                        <p>Description: ${invoiceData.description}</p>
                        <p>Amount: ₹${invoiceData.amount.toFixed(2)}</p>
                        <p>Payment ID: ${invoiceData.razorpayPaymentId}</p>
                        <p>Date: ${new Date().toLocaleDateString('en-IN')}</p>
                    </div>
                    <p>If you have any questions, please contact our support team.</p>
                    <p>Best regards,<br><strong>Padhaku Desk</strong></p>
                </div>
            `,
            attachments: [
                {
                    filename: invoiceData.fileName,
                    path: invoiceData.filePath
                }
            ]
        };

        await transporter.sendMail(mailOptions);
        console.log(`✓ Invoice email sent to ${user.email}`);
        return true;
    } catch (error) {
        console.error(`✗ Failed to send invoice email:`, error.message);
        return false;
    }
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

        // Get user and product details
        const user = await User.findById(req.user.id);
        const product = await ExploreProduct.findById(productId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Save Payment record
        const payment = new Payment({
            userId: req.user.id,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            amount: amount,
            status: 'captured'
        });
        await payment.save();

        // Save Product Purchase record (will link invoiceId after invoice creation)
        const purchase = new ProductPurchase({
            userId: req.user.id,
            productId: productId,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            amount: amount
        });
        await purchase.save();

        // Generate Invoice
        let invoiceRecord = null;
        try {
            const invoiceData = await generateInvoice({
                invoiceNumber: `${Date.now()}`, // Temporary, will be replaced by model
                date: new Date(),
                studentName: user.firstName,
                studentEmail: user.email,
                studentPhone: user.phoneNum,
                description: product ? product.name : 'Product Purchase',
                amount: amount,
                paymentId: razorpay_payment_id
            });

            // Save invoice record to database
            invoiceRecord = new Invoice({
                userId: req.user.id,
                paymentType: 'product',
                productId: productId,
                description: product ? product.name : 'Product Purchase',
                amount: amount,
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id,
                filePath: invoiceData.filepath,
                fileName: invoiceData.filename
            });
            await invoiceRecord.save();

            // Link invoice to product purchase
            purchase.invoiceId = invoiceRecord._id;
            await purchase.save();

            console.log(`✓ Invoice generated: ${invoiceRecord.invoiceNumber}`);

            // Send invoice email
            if (user.email) {
                const emailSent = await sendInvoiceEmail(user, {
                    invoiceNumber: invoiceRecord.invoiceNumber,
                    description: invoiceRecord.description,
                    amount: invoiceRecord.amount,
                    razorpayPaymentId: razorpay_payment_id,
                    fileName: invoiceData.filename,
                    filePath: invoiceData.filepath
                });

                if (emailSent) {
                    invoiceRecord.emailSent = true;
                    invoiceRecord.emailSentAt = new Date();
                    await invoiceRecord.save();
                } else {
                    invoiceRecord.emailSent = false;
                    invoiceRecord.emailError = 'SMTP not configured';
                    await invoiceRecord.save();
                }
            }
        } catch (invoiceError) {
            console.error('Invoice generation failed:', invoiceError.message);
            // Continue with payment success even if invoice fails
        }

        res.status(200).json({
            message: 'Payment verified and purchase recorded successfully',
            purchase,
            invoice: invoiceRecord ? {
                invoiceId: invoiceRecord._id,
                invoiceNumber: invoiceRecord.invoiceNumber,
                emailSent: invoiceRecord.emailSent
            } : null
        });
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

        // Get user and find current standard
        const user = await User.findById(req.user.id);
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
            paymentMethod: 'razorpay',
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

        // Generate Invoice for subscription upgrade
        let invoiceRecord = null;
        try {
            const description = `Plan Upgrade: ${oldStandard} → ${newStandard}`;
            const invoiceData = await generateInvoice({
                invoiceNumber: `${Date.now()}`,
                date: new Date(),
                studentName: user.firstName,
                studentEmail: user.email,
                studentPhone: user.phoneNum,
                description: description,
                amount: amount,
                paymentId: razorpay_payment_id
            });

            invoiceRecord = new Invoice({
                userId: req.user.id,
                paymentType: 'subscription',
                description: description,
                amount: amount,
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id,
                filePath: invoiceData.filepath,
                fileName: invoiceData.filename
            });
            await invoiceRecord.save();

            // Link invoice to upgrade record
            upgrade.invoiceId = invoiceRecord._id;
            await upgrade.save();

            console.log(`✓ Invoice generated: ${invoiceRecord.invoiceNumber}`);

            // Send invoice email
            if (user.email) {
                const emailSent = await sendInvoiceEmail(user, {
                    invoiceNumber: invoiceRecord.invoiceNumber,
                    description: invoiceRecord.description,
                    amount: invoiceRecord.amount,
                    razorpayPaymentId: razorpay_payment_id,
                    fileName: invoiceData.filename,
                    filePath: invoiceData.filepath
                });

                if (emailSent) {
                    invoiceRecord.emailSent = true;
                    invoiceRecord.emailSentAt = new Date();
                    await invoiceRecord.save();
                }
            }
        } catch (invoiceError) {
            console.error('Invoice generation failed:', invoiceError.message);
        }

        res.status(200).json({
            message: 'Plan upgraded successfully',
            upgrade,
            invoice: invoiceRecord ? {
                invoiceId: invoiceRecord._id,
                invoiceNumber: invoiceRecord.invoiceNumber,
                emailSent: invoiceRecord.emailSent
            } : null
        });
    } catch (error) {
        console.error('Error verifying upgrade payment:', error);
        res.status(500).json({ message: 'Error verifying payment', error: error.message });
    }
};

// ============================================================
// Apple In-App Purchase Verification
// ============================================================

const APPLE_VERIFY_RECEIPT_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';
const APPLE_APP_SHARED_SECRET = process.env.APPLE_APP_SHARED_SECRET || '';

/**
 * Verify Apple receipt with Apple servers (Sandbox only)
 */
const verifyAppleReceipt = async (receiptData) => {
    const payload = {
        'receipt-data': receiptData
    };

    if (APPLE_APP_SHARED_SECRET) {
        payload['password'] = APPLE_APP_SHARED_SECRET;
    }

    try {
        const response = await fetch(APPLE_VERIFY_RECEIPT_SANDBOX, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Apple API returned HTTP ${response.status}`);
        }

        return response.json();
    } catch (error) {
        console.error('Apple receipt verification error:', error.message);
        throw error;
    }
};

/**
 * Apple IAP: Verify Membership Purchase (Registration)
 */
exports.verifyAppleMembership = async (req, res) => {
    try {
        const { receipt, productId, apple_transaction_id, standard, medium, stream } = req.body;

        if (!receipt || !productId || !apple_transaction_id) {
            return res.status(400).json({ message: 'Receipt, productId, and apple_transaction_id are required' });
        }

        // Verify with Apple
        const appleResult = await verifyAppleReceipt(receipt);

        if (appleResult.status !== 0) {
            console.error('Apple receipt verification failed. Status:', appleResult.status, 'Response:', appleResult);
            const statusMessages = {
                21000: 'Invalid receipt',
                21002: 'Receipt data malformed',
                21003: 'Receipt cannot be authenticated',
                21004: 'Shared secret does not match',
                21005: 'Receipt server unavailable',
                21007: 'Receipt from test environment (should auto-retry with sandbox)',
                21008: 'Receipt from production environment'
            };
            const message = statusMessages[appleResult.status] || `Apple verification failed with status ${appleResult.status}`;
            return res.status(400).json({ message, status: appleResult.status });
        }

        // Extract receipt data from Apple response
        const receiptInfo = appleResult.receipt || {};
        const bundleId = receiptInfo.bundle_id;
        const purchaseDate = receiptInfo.purchase_date_ms ? new Date(parseInt(receiptInfo.purchase_date_ms)) : new Date();
        const expiresDate = receiptInfo.expires_date_ms ? new Date(parseInt(receiptInfo.expires_date_ms)) : null;

        // Validate that the productId matches what was requested
        if (bundleId !== productId) {
            return res.status(400).json({ message: 'Product ID mismatch - receipt does not match requested product' });
        }

        // Save Payment record with complete verification details
        const payment = new Payment({
            userId: req.user.id,
            razorpayOrderId: `apple_${apple_transaction_id}`,
            razorpayPaymentId: apple_transaction_id,
            razorpaySignature: 'apple_iap',
            amount: 0, // Apple handles pricing
            status: 'captured',
            appleReceiptData: {
                bundleId,
                purchaseDate,
                expiresDate,
                originalTransactionId: receiptInfo.original_transaction_id
            }
        });
        const savedPayment = await payment.save();

        // Update Student Profile with new standard if provided
        if (standard) {
            const profile = await StudentProfile.findOne({ userId: req.user.id });
            if (profile) {
                profile.std = standard;
                if (medium) profile.medium = medium;
                if (stream) profile.stream = stream;
                await profile.save();
            }
        }

        // Mark user as paid
        const updatedUser = await User.findByIdAndUpdate(req.user.id, { isPaid: true }, { new: true });

        // Verify that user was actually updated
        if (!updatedUser || !updatedUser.isPaid) {
            return res.status(500).json({ message: 'Apple purchase completed, but verification details are missing. Please try again.' });
        }

        res.status(200).json({
            message: 'Apple membership verified successfully',
            payment: {
                paymentId: savedPayment._id,
                status: savedPayment.status,
                verifiedAt: new Date()
            }
        });
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
        const { receipt, productId, apple_transaction_id, newStandard, medium, stream, amount } = req.body;

        if (!receipt || !productId || !apple_transaction_id || !newStandard) {
            return res.status(400).json({ message: 'Receipt, productId, apple_transaction_id, and newStandard are required' });
        }

        // Verify with Apple
        const appleResult = await verifyAppleReceipt(receipt);

        if (appleResult.status !== 0) {
            console.error('Apple receipt verification failed. Status:', appleResult.status, 'Response:', appleResult);
            const statusMessages = {
                21000: 'Invalid receipt',
                21002: 'Receipt data malformed',
                21003: 'Receipt cannot be authenticated',
                21004: 'Shared secret does not match',
                21005: 'Receipt server unavailable',
                21007: 'Receipt from test environment (should auto-retry with sandbox)',
                21008: 'Receipt from production environment'
            };
            const message = statusMessages[appleResult.status] || `Apple verification failed with status ${appleResult.status}`;
            return res.status(400).json({ message, status: appleResult.status });
        }

        // Extract receipt data from Apple response
        const receiptInfo = appleResult.receipt || {};
        const bundleId = receiptInfo.bundle_id;
        const purchaseDate = receiptInfo.purchase_date_ms ? new Date(parseInt(receiptInfo.purchase_date_ms)) : new Date();
        const expiresDate = receiptInfo.expires_date_ms ? new Date(parseInt(receiptInfo.expires_date_ms)) : null;

        // Validate that the productId matches what was requested
        if (bundleId !== productId) {
            return res.status(400).json({ message: 'Product ID mismatch - receipt does not match requested product' });
        }

        // Find current standard
        const profile = await StudentProfile.findOne({ userId: req.user.id });
        const oldStandard = profile ? profile.std : 'Unknown';

        // Save Upgrade record with complete verification details
        const upgrade = new PlanUpgrade({
            userId: req.user.id,
            oldStandard,
            newStandard,
            medium,
            stream,
            appleTransactionId: apple_transaction_id,
            amount: amount || 0,
            paymentMethod: 'apple',
            appleReceiptData: {
                bundleId,
                purchaseDate,
                expiresDate,
                originalTransactionId: receiptInfo.original_transaction_id
            }
        });
        const savedUpgrade = await upgrade.save();

        // Update Student Profile
        if (profile) {
            profile.std = newStandard;
            profile.medium = medium;
            if (stream) profile.stream = stream;
            await profile.save();
        }

        // Update User isPaid status
        const updatedUser = await User.findByIdAndUpdate(req.user.id, { isPaid: true }, { new: true });

        // Verify that user was actually updated
        if (!updatedUser || !updatedUser.isPaid) {
            return res.status(500).json({ message: 'Apple purchase completed, but verification details are missing. Please try again.' });
        }

        res.status(200).json({
            message: 'Plan upgraded successfully via Apple IAP',
            upgrade: {
                upgradeId: savedUpgrade._id,
                oldStandard,
                newStandard,
                paymentMethod: 'apple',
                verifiedAt: new Date()
            }
        });
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
        const { receipt, productId, apple_transaction_id, materialProductId, amount } = req.body;

        if (!receipt || !productId || !apple_transaction_id || !materialProductId) {
            return res.status(400).json({ message: 'Receipt, productId, apple_transaction_id, and materialProductId are required' });
        }

        // Verify with Apple
        const appleResult = await verifyAppleReceipt(receipt);

        if (appleResult.status !== 0) {
            console.error('Apple receipt verification failed. Status:', appleResult.status, 'Response:', appleResult);
            const statusMessages = {
                21000: 'Invalid receipt',
                21002: 'Receipt data malformed',
                21003: 'Receipt cannot be authenticated',
                21004: 'Shared secret does not match',
                21005: 'Receipt server unavailable',
                21007: 'Receipt from test environment (should auto-retry with sandbox)',
                21008: 'Receipt from production environment'
            };
            const message = statusMessages[appleResult.status] || `Apple verification failed with status ${appleResult.status}`;
            return res.status(400).json({ message, status: appleResult.status });
        }

        // Extract receipt data from Apple response
        const receiptInfo = appleResult.receipt || {};
        const bundleId = receiptInfo.bundle_id;
        const purchaseDate = receiptInfo.purchase_date_ms ? new Date(parseInt(receiptInfo.purchase_date_ms)) : new Date();
        const expiresDate = receiptInfo.expires_date_ms ? new Date(parseInt(receiptInfo.expires_date_ms)) : null;

        // Validate that the productId matches what was requested
        if (bundleId !== productId) {
            return res.status(400).json({ message: 'Product ID mismatch - receipt does not match requested product' });
        }

        // Save Payment record with complete verification details
        const payment = new Payment({
            userId: req.user.id,
            razorpayOrderId: `apple_${apple_transaction_id}`,
            razorpayPaymentId: apple_transaction_id,
            razorpaySignature: 'apple_iap',
            amount: amount || 0,
            status: 'captured',
            appleReceiptData: {
                bundleId,
                purchaseDate,
                expiresDate,
                originalTransactionId: receiptInfo.original_transaction_id
            }
        });
        const savedPayment = await payment.save();

        // Save Product Purchase record with complete verification details
        const purchase = new ProductPurchase({
            userId: req.user.id,
            productId: materialProductId,
            razorpayOrderId: `apple_${apple_transaction_id}`,
            razorpayPaymentId: apple_transaction_id,
            amount: amount || 0,
            appleReceiptData: {
                bundleId,
                purchaseDate,
                originalTransactionId: receiptInfo.original_transaction_id
            }
        });
        const savedPurchase = await purchase.save();

        // Verify that purchase was actually saved
        if (!savedPurchase || !savedPurchase._id) {
            return res.status(500).json({ message: 'Apple purchase completed, but verification details are missing. Please try again.' });
        }

        res.status(200).json({
            message: 'Apple product purchase verified successfully',
            purchase: {
                purchaseId: savedPurchase._id,
                productId: materialProductId,
                status: 'completed',
                verifiedAt: new Date()
            }
        });
    } catch (error) {
        console.error('Error verifying Apple product purchase:', error);
        res.status(500).json({ message: 'Error verifying Apple purchase', error: error.message });
    }
};

