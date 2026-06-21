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
const emailTemplates = require('../utils/emailTemplates');
const fs = require('fs');
const path = require('path');

// Logging utility
const LOGS_DIR = path.join(__dirname, '../logs/apple-iap');
const ensureLogsDirectory = () => {
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
};

const writeLog = (logType, logData) => {
    try {
        ensureLogsDirectory();
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0];
        const timestamp = date.toISOString();
        const logFileName = `${logType}_${dateStr}.log`;
        const logFilePath = path.join(LOGS_DIR, logFileName);

        const logEntry = `[${timestamp}] ${JSON.stringify(logData)}\n`;
        fs.appendFileSync(logFilePath, logEntry, 'utf8');

        console.log(`✓ Log saved to: ${logFilePath}`);
    } catch (error) {
        console.error('Failed to write log file:', error.message);
    }
};

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
const sendInvoiceEmail = async (user, invoiceData, emailType = 'general', additionalData = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INVOICE_EMAIL] Starting invoice email send to: ${user.email} (Type: ${emailType})`);

    try {
        const config = await NotificationConfig.findOne();

        if (!config?.emailHost || !config?.emailUser || !config?.emailPassword) {
            console.warn(`[${timestamp}] [INVOICE_EMAIL] ⚠️ SMTP not configured - invoice email will not be sent`);
            console.warn(`[${timestamp}] [INVOICE_EMAIL] Config check - emailHost: ${config?.emailHost ? 'SET' : 'MISSING'}, emailUser: ${config?.emailUser ? 'SET' : 'MISSING'}, emailPassword: ${config?.emailPassword ? 'SET' : 'MISSING'}`);
            return false;
        }

        console.log(`[${timestamp}] [INVOICE_EMAIL] SMTP Config found - Host: ${config.emailHost}, Port: ${config.emailPort}, User: ${config.emailUser}`);

        const transporter = nodemailer.createTransport({
            host: config.emailHost,
            port: parseInt(config.emailPort) || 587,
            secure: parseInt(config.emailPort) === 465,
            auth: {
                user: config.emailUser,
                pass: config.emailPassword
            }
        });

        // Select email template based on type
        let emailTemplate;
        if (emailType === 'upgrade') {
            emailTemplate = emailTemplates.planUpgradeConfirmation(user, additionalData.upgrade, invoiceData);
        } else if (emailType === 'product') {
            emailTemplate = emailTemplates.materialPurchaseConfirmation(user, additionalData.product, invoiceData);
        } else {
            emailTemplate = emailTemplates.invoiceConfirmation(user, invoiceData);
        }

        const mailOptions = {
            from: `"${config.emailFromName || 'Padhaku Desk'}" <${config.emailUser}>`,
            to: user.email,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            attachments: [
                {
                    filename: invoiceData.fileName,
                    path: invoiceData.filePath
                }
            ]
        };

        console.log(`[${timestamp}] [INVOICE_EMAIL] Mail options prepared - From: ${mailOptions.from}, Subject: ${mailOptions.subject}, Attachments: ${mailOptions.attachments.length}`);
        await transporter.sendMail(mailOptions);
        console.log(`[${timestamp}] [INVOICE_EMAIL] ✓ Invoice email sent successfully to ${user.email} (type: ${emailType})`);
        return true;
    } catch (error) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [INVOICE_EMAIL] ✗ Failed to send invoice email to ${user?.email}`);
        console.error(`[${timestamp}] [INVOICE_EMAIL] Error Message: ${error.message}`);
        console.error(`[${timestamp}] [INVOICE_EMAIL] Error Code: ${error.code}`);
        console.error(`[${timestamp}] [INVOICE_EMAIL] Full Error:`, {
            message: error.message,
            code: error.code,
            command: error.command,
            response: error.response,
            stack: error.stack
        });
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
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [PRODUCT_INVOICE] Starting invoice generation for product purchase...`);

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

            console.log(`[${timestamp}] [PRODUCT_INVOICE] ✓ PDF invoice generated: ${invoiceData.filename}`);

            // Save invoice record to database
            console.log(`[${timestamp}] [PRODUCT_INVOICE] Creating invoice database record...`);
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

            console.log(`[${timestamp}] [PRODUCT_INVOICE] Saving invoice record to database...`);
            await invoiceRecord.save();
            console.log(`[${timestamp}] [PRODUCT_INVOICE] ✓ Invoice saved with ID: ${invoiceRecord._id}, Number: ${invoiceRecord.invoiceNumber}`);

            // Link invoice to product purchase
            purchase.invoiceId = invoiceRecord._id;
            await purchase.save();

            console.log(`✓ Invoice generated: ${invoiceRecord.invoiceNumber}`);

            // Send invoice email
            if (user.email) {
                console.log(`[PAYMENT_VERIFICATION] Attempting to send product purchase invoice email to: ${user.email}`);
                const emailSent = await sendInvoiceEmail(user, {
                    invoiceNumber: invoiceRecord.invoiceNumber,
                    description: invoiceRecord.description,
                    amount: invoiceRecord.amount,
                    razorpayPaymentId: razorpay_payment_id,
                    fileName: invoiceData.filename,
                    filePath: invoiceData.filepath,
                    createdAt: invoiceRecord.createdAt
                }, 'product', { product });

                if (emailSent) {
                    invoiceRecord.emailSent = true;
                    invoiceRecord.emailSentAt = new Date();
                    await invoiceRecord.save();
                    console.log(`[PAYMENT_VERIFICATION] ✓ Invoice email sent and saved for product purchase`);
                } else {
                    invoiceRecord.emailSent = false;
                    invoiceRecord.emailError = 'SMTP not configured';
                    await invoiceRecord.save();
                    console.log(`[PAYMENT_VERIFICATION] ⚠️ Invoice email failed for product purchase`);
                }
            }
        } catch (invoiceError) {
            const timestamp = new Date().toISOString();
            console.error(`[${timestamp}] [PRODUCT_INVOICE] ✗ Invoice generation/email failed`);
            console.error(`[${timestamp}] [PRODUCT_INVOICE] Error Message: ${invoiceError.message}`);
            console.error(`[${timestamp}] [PRODUCT_INVOICE] Full Error:`, {
                message: invoiceError.message,
                stack: invoiceError.stack
            });
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
            const timestamp = new Date().toISOString();
            const description = `Plan Upgrade: ${oldStandard} → ${newStandard}`;
            console.log(`[${timestamp}] [UPGRADE_INVOICE] Starting invoice generation for subscription upgrade...`);

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

            console.log(`[${timestamp}] [UPGRADE_INVOICE] ✓ PDF invoice generated: ${invoiceData.filename}`);

            // Save invoice record to database
            console.log(`[${timestamp}] [UPGRADE_INVOICE] Creating invoice database record...`);
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

            console.log(`[${timestamp}] [UPGRADE_INVOICE] Saving invoice record to database...`);
            await invoiceRecord.save();
            console.log(`[${timestamp}] [UPGRADE_INVOICE] ✓ Invoice saved with ID: ${invoiceRecord._id}, Number: ${invoiceRecord.invoiceNumber}`);

            // Link invoice to upgrade record
            upgrade.invoiceId = invoiceRecord._id;
            await upgrade.save();

            // Send invoice email
            if (user.email) {
                console.log(`[PAYMENT_VERIFICATION] Attempting to send subscription upgrade invoice email to: ${user.email}`);
                const emailSent = await sendInvoiceEmail(user, {
                    invoiceNumber: invoiceRecord.invoiceNumber,
                    description: invoiceRecord.description,
                    amount: invoiceRecord.amount,
                    razorpayPaymentId: razorpay_payment_id,
                    fileName: invoiceData.filename,
                    filePath: invoiceData.filepath,
                    createdAt: invoiceRecord.createdAt
                }, 'upgrade', { upgrade: { oldStandard, newStandard, medium, stream, amount } });

                if (emailSent) {
                    invoiceRecord.emailSent = true;
                    invoiceRecord.emailSentAt = new Date();
                    await invoiceRecord.save();
                    console.log(`[PAYMENT_VERIFICATION] ✓ Invoice email sent and saved for subscription upgrade`);
                } else {
                    invoiceRecord.emailSent = false;
                    invoiceRecord.emailError = 'SMTP not configured';
                    await invoiceRecord.save();
                    console.log(`[PAYMENT_VERIFICATION] ⚠️ Invoice email failed for subscription upgrade`);
                }
            } else {
                console.log(`[PAYMENT_VERIFICATION] ⚠️ No email provided for subscription upgrade - invoice email skipped`);
            }
        } catch (invoiceError) {
            const timestamp = new Date().toISOString();
            console.error(`[${timestamp}] [UPGRADE_INVOICE] ✗ Invoice generation/email failed`);
            console.error(`[${timestamp}] [UPGRADE_INVOICE] Error Message: ${invoiceError.message}`);
            console.error(`[${timestamp}] [UPGRADE_INVOICE] Full Error:`, {
                message: invoiceError.message,
                stack: invoiceError.stack
            });
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
    const logEntry = {
        timestamp: new Date().toISOString(),
        endpoint: 'POST /payment/apple/verify-membership',
        userId: req.user?.id,
        requestBody: {
            productId: req.body?.productId,
            apple_transaction_id: req.body?.apple_transaction_id,
            standard: req.body?.standard,
            medium: req.body?.medium,
            stream: req.body?.stream,
            receipt: req.body?.receipt ? `[RECEIPT_${req.body.receipt.substring(0, 20)}...]` : null
        },
        steps: []
    };

    try {
        const { receipt, productId, apple_transaction_id, standard, medium, stream } = req.body;

        logEntry.steps.push({ step: 'Parse request body', success: true });

        if (!receipt || !productId || !apple_transaction_id) {
            logEntry.steps.push({
                step: 'Validate required fields',
                success: false,
                error: 'Missing receipt, productId, or apple_transaction_id'
            });
            console.log('[APPLE_VERIFY_MEMBERSHIP_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-membership', logEntry);
            return res.status(400).json({ message: 'Receipt, productId, and apple_transaction_id are required' });
        }

        logEntry.steps.push({ step: 'Validate required fields', success: true });

        // Verify with Apple
        logEntry.steps.push({ step: 'Calling Apple API', success: true, appleUrl: 'https://sandbox.itunes.apple.com/verifyReceipt' });
        const appleResult = await verifyAppleReceipt(receipt);

        logEntry.steps.push({
            step: 'Apple API response',
            success: true,
            appleStatus: appleResult.status,
            receiptExists: !!appleResult.receipt
        });

        if (appleResult.status !== 0) {
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
            logEntry.steps.push({
                step: 'Apple verification',
                success: false,
                error: message,
                appleStatus: appleResult.status
            });
            console.log('[APPLE_VERIFY_MEMBERSHIP_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-membership', logEntry);
            return res.status(400).json({ message, status: appleResult.status });
        }

        logEntry.steps.push({ step: 'Apple verification', success: true });

        // Extract receipt data from Apple response
        const receiptInfo = appleResult.receipt || {};
        const bundleId = receiptInfo.bundle_id;
        const purchaseDate = receiptInfo.purchase_date_ms ? new Date(parseInt(receiptInfo.purchase_date_ms)) : new Date();
        const expiresDate = receiptInfo.expires_date_ms ? new Date(parseInt(receiptInfo.expires_date_ms)) : null;

        logEntry.steps.push({
            step: 'Extract receipt data',
            success: true,
            bundleId,
            purchaseDate,
            expiresDate
        });

        // Validate that the productId matches what was requested
        if (bundleId !== productId) {
            logEntry.steps.push({
                step: 'Validate productId match',
                success: false,
                error: `Bundle ID (${bundleId}) does not match requested productId (${productId})`
            });
            console.log('[APPLE_VERIFY_MEMBERSHIP_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-membership', logEntry);
            return res.status(400).json({ message: 'Product ID mismatch - receipt does not match requested product' });
        }

        logEntry.steps.push({ step: 'Validate productId match', success: true });

        // Save Payment record with complete verification details
        logEntry.steps.push({ step: 'Creating Payment record', success: true });
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

        logEntry.steps.push({
            step: 'Save Payment record',
            success: true,
            paymentId: savedPayment._id
        });

        // Update Student Profile with new standard if provided
        if (standard) {
            const profile = await StudentProfile.findOne({ userId: req.user.id });
            logEntry.steps.push({
                step: 'Update StudentProfile',
                success: !!profile,
                profileFound: !!profile
            });

            if (profile) {
                profile.std = standard;
                if (medium) profile.medium = medium;
                if (stream) profile.stream = stream;
                await profile.save();
                logEntry.steps.push({
                    step: 'Save StudentProfile',
                    success: true,
                    std: standard,
                    medium,
                    stream
                });
            }
        }

        // Mark user as paid
        logEntry.steps.push({ step: 'Updating User isPaid status', success: true });
        const updatedUser = await User.findByIdAndUpdate(req.user.id, { isPaid: true }, { new: true });

        logEntry.steps.push({
            step: 'Fetch updated User',
            success: !!updatedUser,
            userFound: !!updatedUser,
            isPaidStatus: updatedUser?.isPaid
        });

        // Verify that user was actually updated
        if (!updatedUser || !updatedUser.isPaid) {
            logEntry.steps.push({
                step: 'Verify user update',
                success: false,
                error: 'User not found or isPaid not set',
                updatedUser: !!updatedUser,
                isPaid: updatedUser?.isPaid
            });
            logEntry.status = 'FAILED - User verification missing';
            console.log('[APPLE_VERIFY_MEMBERSHIP_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-membership', logEntry);
            return res.status(500).json({ message: 'Apple purchase completed, but verification details are missing. Please try again.' });
        }

        logEntry.steps.push({ step: 'Verify user update', success: true });
        logEntry.status = 'SUCCESS';
        console.log('[APPLE_VERIFY_MEMBERSHIP_LOG]', JSON.stringify(logEntry, null, 2));
        writeLog('apple-membership', logEntry);

        res.status(200).json({
            message: 'Apple membership verified successfully',
            payment: {
                paymentId: savedPayment._id,
                status: savedPayment.status,
                verifiedAt: new Date()
            }
        });
    } catch (error) {
        logEntry.status = 'EXCEPTION';
        logEntry.error = {
            message: error.message,
            stack: error.stack
        };
        console.log('[APPLE_VERIFY_MEMBERSHIP_LOG]', JSON.stringify(logEntry, null, 2));
        writeLog('apple-membership', logEntry);
        console.error('Error verifying Apple membership:', error);
        res.status(500).json({ message: 'Error verifying Apple purchase', error: error.message });
    }
};

/**
 * Apple IAP: Verify Upgrade Purchase
 */
exports.verifyAppleUpgrade = async (req, res) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        endpoint: 'POST /payment/apple/verify-upgrade',
        userId: req.user?.id,
        requestBody: {
            productId: req.body?.productId,
            apple_transaction_id: req.body?.apple_transaction_id,
            newStandard: req.body?.newStandard,
            medium: req.body?.medium,
            stream: req.body?.stream,
            amount: req.body?.amount,
            receipt: req.body?.receipt ? `[RECEIPT_${req.body.receipt.substring(0, 20)}...]` : null
        },
        steps: []
    };

    try {
        const { receipt, productId, apple_transaction_id, newStandard, medium, stream, amount } = req.body;

        logEntry.steps.push({ step: 'Parse request body', success: true });

        if (!receipt || !productId || !apple_transaction_id || !newStandard) {
            logEntry.steps.push({
                step: 'Validate required fields',
                success: false,
                error: 'Missing receipt, productId, apple_transaction_id, or newStandard'
            });
            console.log('[APPLE_VERIFY_UPGRADE_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-upgrade', logEntry);
            return res.status(400).json({ message: 'Receipt, productId, apple_transaction_id, and newStandard are required' });
        }

        logEntry.steps.push({ step: 'Validate required fields', success: true });

        // Verify with Apple
        logEntry.steps.push({ step: 'Calling Apple API', success: true });
        const appleResult = await verifyAppleReceipt(receipt);

        logEntry.steps.push({
            step: 'Apple API response',
            success: true,
            appleStatus: appleResult.status,
            receiptExists: !!appleResult.receipt
        });

        if (appleResult.status !== 0) {
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
            logEntry.steps.push({
                step: 'Apple verification',
                success: false,
                error: message,
                appleStatus: appleResult.status
            });
            console.log('[APPLE_VERIFY_UPGRADE_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-upgrade', logEntry);
            return res.status(400).json({ message, status: appleResult.status });
        }

        logEntry.steps.push({ step: 'Apple verification', success: true });

        // Extract receipt data from Apple response
        const receiptInfo = appleResult.receipt || {};
        const bundleId = receiptInfo.bundle_id;
        const purchaseDate = receiptInfo.purchase_date_ms ? new Date(parseInt(receiptInfo.purchase_date_ms)) : new Date();
        const expiresDate = receiptInfo.expires_date_ms ? new Date(parseInt(receiptInfo.expires_date_ms)) : null;

        logEntry.steps.push({
            step: 'Extract receipt data',
            success: true,
            bundleId,
            purchaseDate,
            expiresDate
        });

        // Validate that the productId matches what was requested
        if (bundleId !== productId) {
            logEntry.steps.push({
                step: 'Validate productId match',
                success: false,
                error: `Bundle ID (${bundleId}) does not match requested productId (${productId})`
            });
            console.log('[APPLE_VERIFY_UPGRADE_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-upgrade', logEntry);
            return res.status(400).json({ message: 'Product ID mismatch - receipt does not match requested product' });
        }

        logEntry.steps.push({ step: 'Validate productId match', success: true });

        // Find current standard
        const profile = await StudentProfile.findOne({ userId: req.user.id });
        const oldStandard = profile ? profile.std : 'Unknown';

        logEntry.steps.push({
            step: 'Fetch StudentProfile',
            success: !!profile,
            profileFound: !!profile,
            oldStandard
        });

        // Save Upgrade record with complete verification details
        logEntry.steps.push({ step: 'Creating PlanUpgrade record', success: true });
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

        logEntry.steps.push({
            step: 'Save PlanUpgrade record',
            success: true,
            upgradeId: savedUpgrade._id
        });

        // Update Student Profile
        if (profile) {
            profile.std = newStandard;
            profile.medium = medium;
            if (stream) profile.stream = stream;
            await profile.save();
            logEntry.steps.push({
                step: 'Update StudentProfile',
                success: true,
                newStandard,
                medium,
                stream
            });
        } else {
            logEntry.steps.push({
                step: 'Update StudentProfile',
                success: false,
                error: 'Profile not found'
            });
        }

        // Update User isPaid status
        logEntry.steps.push({ step: 'Updating User isPaid status', success: true });
        const updatedUser = await User.findByIdAndUpdate(req.user.id, { isPaid: true }, { new: true });

        logEntry.steps.push({
            step: 'Fetch updated User',
            success: !!updatedUser,
            userFound: !!updatedUser,
            isPaidStatus: updatedUser?.isPaid
        });

        // Verify that user was actually updated
        if (!updatedUser || !updatedUser.isPaid) {
            logEntry.steps.push({
                step: 'Verify user update',
                success: false,
                error: 'User not found or isPaid not set',
                updatedUser: !!updatedUser,
                isPaid: updatedUser?.isPaid
            });
            logEntry.status = 'FAILED - User verification missing';
            console.log('[APPLE_VERIFY_UPGRADE_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-upgrade', logEntry);
            return res.status(500).json({ message: 'Apple purchase completed, but verification details are missing. Please try again.' });
        }

        logEntry.steps.push({ step: 'Verify user update', success: true });
        logEntry.status = 'SUCCESS';
        console.log('[APPLE_VERIFY_UPGRADE_LOG]', JSON.stringify(logEntry, null, 2));
        writeLog('apple-upgrade', logEntry);
        writeLog('apple-upgrade', logEntry);

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
        logEntry.status = 'EXCEPTION';
        logEntry.error = {
            message: error.message,
            stack: error.stack
        };
        console.log('[APPLE_VERIFY_UPGRADE_LOG]', JSON.stringify(logEntry, null, 2));
        writeLog('apple-upgrade', logEntry);
        console.error('Error verifying Apple upgrade:', error);
        res.status(500).json({ message: 'Error verifying Apple purchase', error: error.message });
    }
};

/**
 * Apple IAP: Verify Product/Material Purchase
 */
exports.verifyAppleProductPurchase = async (req, res) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        endpoint: 'POST /payment/apple/verify-product',
        userId: req.user?.id,
        requestBody: {
            productId: req.body?.productId,
            apple_transaction_id: req.body?.apple_transaction_id,
            materialProductId: req.body?.materialProductId,
            amount: req.body?.amount,
            receipt: req.body?.receipt ? `[RECEIPT_${req.body.receipt.substring(0, 20)}...]` : null
        },
        steps: []
    };

    try {
        const { receipt, productId, apple_transaction_id, materialProductId, amount } = req.body;

        logEntry.steps.push({ step: 'Parse request body', success: true });

        if (!receipt || !productId || !apple_transaction_id || !materialProductId) {
            logEntry.steps.push({
                step: 'Validate required fields',
                success: false,
                error: 'Missing receipt, productId, apple_transaction_id, or materialProductId'
            });
            console.log('[APPLE_VERIFY_PRODUCT_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-product', logEntry);
            return res.status(400).json({ message: 'Receipt, productId, apple_transaction_id, and materialProductId are required' });
        }

        logEntry.steps.push({ step: 'Validate required fields', success: true });

        // Verify with Apple
        logEntry.steps.push({ step: 'Calling Apple API', success: true });
        const appleResult = await verifyAppleReceipt(receipt);

        logEntry.steps.push({
            step: 'Apple API response',
            success: true,
            appleStatus: appleResult.status,
            receiptExists: !!appleResult.receipt
        });

        if (appleResult.status !== 0) {
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
            logEntry.steps.push({
                step: 'Apple verification',
                success: false,
                error: message,
                appleStatus: appleResult.status
            });
            console.log('[APPLE_VERIFY_PRODUCT_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-product', logEntry);
            return res.status(400).json({ message, status: appleResult.status });
        }

        logEntry.steps.push({ step: 'Apple verification', success: true });

        // Extract receipt data from Apple response
        const receiptInfo = appleResult.receipt || {};
        const bundleId = receiptInfo.bundle_id;
        const purchaseDate = receiptInfo.purchase_date_ms ? new Date(parseInt(receiptInfo.purchase_date_ms)) : new Date();
        const expiresDate = receiptInfo.expires_date_ms ? new Date(parseInt(receiptInfo.expires_date_ms)) : null;

        logEntry.steps.push({
            step: 'Extract receipt data',
            success: true,
            bundleId,
            purchaseDate,
            expiresDate
        });

        // Validate that the productId matches what was requested
        if (bundleId !== productId) {
            logEntry.steps.push({
                step: 'Validate productId match',
                success: false,
                error: `Bundle ID (${bundleId}) does not match requested productId (${productId})`
            });
            console.log('[APPLE_VERIFY_PRODUCT_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-product', logEntry);
            return res.status(400).json({ message: 'Product ID mismatch - receipt does not match requested product' });
        }

        logEntry.steps.push({ step: 'Validate productId match', success: true });

        // Save Payment record with complete verification details
        logEntry.steps.push({ step: 'Creating Payment record', success: true });
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

        logEntry.steps.push({
            step: 'Save Payment record',
            success: true,
            paymentId: savedPayment._id
        });

        // Save Product Purchase record with complete verification details
        logEntry.steps.push({ step: 'Creating ProductPurchase record', success: true });
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

        logEntry.steps.push({
            step: 'Save ProductPurchase record',
            success: true,
            purchaseId: savedPurchase._id
        });

        // Verify that purchase was actually saved
        if (!savedPurchase || !savedPurchase._id) {
            logEntry.steps.push({
                step: 'Verify purchase save',
                success: false,
                error: 'Purchase not saved or missing ID',
                savedPurchase: !!savedPurchase,
                hasId: savedPurchase?._id ? true : false
            });
            logEntry.status = 'FAILED - Purchase verification missing';
            console.log('[APPLE_VERIFY_PRODUCT_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-product', logEntry);
            return res.status(500).json({ message: 'Apple purchase completed, but verification details are missing. Please try again.' });
        }

        logEntry.steps.push({ step: 'Verify purchase save', success: true });
        logEntry.status = 'SUCCESS';
        console.log('[APPLE_VERIFY_PRODUCT_LOG]', JSON.stringify(logEntry, null, 2));
        writeLog('apple-product', logEntry);
        writeLog('apple-product', logEntry);

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
        logEntry.status = 'EXCEPTION';
        logEntry.error = {
            message: error.message,
            stack: error.stack
        };
        console.log('[APPLE_VERIFY_PRODUCT_LOG]', JSON.stringify(logEntry, null, 2));
        writeLog('apple-product', logEntry);
        console.error('Error verifying Apple product purchase:', error);
        res.status(500).json({ message: 'Error verifying Apple purchase', error: error.message });
    }
};

