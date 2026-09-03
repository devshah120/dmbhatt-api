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
const { createRequestLogger, mask } = require('../utils/logger');
const { getPointsConfig, calculateRedemption, getSpendableBalance, debitPoints } = require('../utils/pointsService');

// Structured file logging for the Apple IAP flows.
// Writes to logs/apple-iap/<logType>_<YYYY-MM-DD>.log (path preserved for continuity).
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
        // Try to get config from database first, then fall back to environment variables
        let emailHost = process.env.SMTP_HOST;
        let emailPort = process.env.SMTP_PORT;
        let emailUser = process.env.SMTP_USER;
        let emailPassword = process.env.SMTP_PASS;
        let emailFromName = process.env.SMTP_FROM_NAME || 'Padhaku Desk';

        // Try to get from database if available
        try {
            const config = await NotificationConfig.findOne();
            if (config?.emailHost && config?.emailUser && config?.emailPassword) {
                emailHost = config.emailHost;
                emailPort = config.emailPort;
                emailUser = config.emailUser;
                emailPassword = config.emailPassword;
                emailFromName = config.emailFromName || emailFromName;
                console.log(`[${timestamp}] [INVOICE_EMAIL] Using SMTP config from database`);
            }
        } catch (dbError) {
            console.log(`[${timestamp}] [INVOICE_EMAIL] Database config not available, using environment variables`);
        }

        console.log(`[${timestamp}] [INVOICE_EMAIL] SMTP Config check:`);
        console.log(`[${timestamp}] [INVOICE_EMAIL]   - emailHost: ${emailHost ? 'SET (' + emailHost + ')' : 'MISSING'}`);
        console.log(`[${timestamp}] [INVOICE_EMAIL]   - emailUser: ${emailUser ? 'SET (' + emailUser + ')' : 'MISSING'}`);
        console.log(`[${timestamp}] [INVOICE_EMAIL]   - emailPassword: ${emailPassword ? 'SET (***MASKED***)' : 'MISSING'}`);
        console.log(`[${timestamp}] [INVOICE_EMAIL]   - emailPort: ${emailPort ? 'SET (' + emailPort + ')' : 'MISSING'}`);

        if (!emailHost || !emailUser || !emailPassword) {
            console.warn(`[${timestamp}] [INVOICE_EMAIL] ⚠️ SMTP not configured - invoice email will not be sent`);
            return false;
        }

        console.log(`[${timestamp}] [INVOICE_EMAIL] ✓ SMTP Config verified - Host: ${emailHost}, Port: ${emailPort}, User: ${emailUser}`);

        const transporter = nodemailer.createTransport({
            host: emailHost,
            port: parseInt(emailPort) || 587,
            secure: parseInt(emailPort) === 465,
            auth: {
                user: emailUser,
                pass: emailPassword
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
            from: `"${emailFromName}" <${emailUser}>`,
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

/**
 * GET /payment/product/:productId/quote
 * Tells the app what this product costs for this student right now: the price, their
 * points balance, the most they may redeem, and the resulting payable amount.
 * Read-only — it never debits points.
 */
exports.getProductQuote = async (req, res) => {
    try {
        const { productId } = req.params;
        const requestedPoints = req.query.points;

        const [product, balance] = await Promise.all([
            ExploreProduct.findById(productId),
            getSpendableBalance(req.user.id)
        ]);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        if (!balance.userExists) {
            return res.status(404).json({ message: 'User not found' });
        }

        const config = getPointsConfig();
        const quote = calculateRedemption(
            product.price,
            balance.total,
            requestedPoints !== undefined ? requestedPoints : 0,
            config
        );

        res.status(200).json(quote);
    } catch (error) {
        console.error('Error building product quote:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.createProductOrder = async (req, res) => {
    const log = createRequestLogger('payment', {
        endpoint: 'POST /payment/product/create-order',
        req,
        meta: {
            flow: 'razorpay-product-order',
            productId: req.body?.productId,
            pointsToUse: req.body?.pointsToUse,
            currency: req.body?.currency || 'INR'
        }
    });
    try {
        const { productId, pointsToUse = 0, currency = 'INR' } = req.body;

        if (!productId) {
            log.step('Validate required fields', { success: false, error: 'Missing productId' });
            log.finish('VALIDATION_FAILED');
            return res.status(400).json({ message: 'Product ID is required' });
        }
        log.step('Validate required fields', { success: true });

        // Price and discount are derived server-side from the product record and the
        // user's real balance. Any amount sent by the client is ignored.
        const [product, balance] = await Promise.all([
            ExploreProduct.findById(productId),
            getSpendableBalance(req.user.id)
        ]);

        if (!product) {
            log.step('Fetch product', { success: false, error: 'Product not found' });
            log.finish('PRODUCT_NOT_FOUND');
            return res.status(404).json({ message: 'Product not found' });
        }
        if (!balance.userExists) {
            log.step('Fetch user', { success: false, error: 'User not found' });
            log.finish('USER_NOT_FOUND');
            return res.status(404).json({ message: 'User not found' });
        }

        const config = getPointsConfig();
        const quote = calculateRedemption(product.price, balance.total, pointsToUse, config);
        log.step('Calculate redemption', {
            success: true,
            productPrice: quote.productPrice,
            pointsRequested: pointsToUse,
            pointsUsed: quote.pointsUsed,
            discount: quote.discount,
            payableAmount: quote.payableAmount
        });

        if (quote.payableAmount <= 0) {
            log.step('Validate payable amount', { success: false, error: 'Amount must be greater than zero' });
            log.finish('INVALID_AMOUNT');
            return res.status(400).json({
                message: 'Payable amount must be greater than zero. Please reduce the points applied.'
            });
        }

        const options = {
            amount: Math.round(quote.payableAmount * 100), // paise
            currency,
            receipt: `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            // Carried through so verification can reconstruct the exact same deal.
            notes: {
                productId: String(productId),
                userId: String(req.user.id),
                pointsUsed: String(quote.pointsUsed),
                discount: String(quote.discount)
            }
        };

        const razorpay = getRazorpayInstance();
        const order = await razorpay.orders.create(options);
        log.step('Razorpay order created', { success: true, orderId: order.id, receipt: options.receipt });
        log.finish('SUCCESS');
        res.json({ ...order, quote });
    } catch (error) {
        console.error('Error creating product order:', error);
        log.fail('EXCEPTION', error);
        res.status(500).json({ message: 'Error creating Razorpay order', error: error.message });
    }
};

exports.verifyProductPayment = async (req, res) => {
    const log = createRequestLogger('payment', {
        endpoint: 'POST /payment/product/verify',
        req,
        meta: {
            flow: 'razorpay-product-verify',
            productId: req.body?.productId,
            amount: req.body?.amount,
            razorpayOrderId: req.body?.razorpay_order_id,
            razorpayPaymentId: req.body?.razorpay_payment_id,
            razorpaySignature: mask(req.body?.razorpay_signature),
            referralCode: req.body?.referralCode || null,
            redeemCode: req.body?.redeemCode || null
        }
    });
    try {
        const {
            productId,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
        } = req.body;

        // Verify signature
        const config = getRazorpayConfig();
        const shasum = crypto.createHmac('sha256', config.razorpayKeySecret);
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const digest = shasum.digest('hex');

        if (digest !== razorpay_signature) {
            log.step('Verify signature', { success: false, error: 'Signature mismatch' });
            log.finish('SIGNATURE_MISMATCH');
            return res.status(400).json({ message: 'Transaction not legitimate!' });
        }
        log.step('Verify signature', { success: true });

        // The order we created is the source of truth for what was actually charged
        // and how many points were promised against it. The client's numbers are
        // never trusted here.
        const razorpayOrder = await getRazorpayInstance().orders.fetch(razorpay_order_id);
        const amount = (Number(razorpayOrder.amount_paid ?? razorpayOrder.amount) || 0) / 100;
        const orderNotes = razorpayOrder.notes || {};
        const pointsUsed = Math.max(0, Math.floor(Number(orderNotes.pointsUsed) || 0));
        const pointsDiscount = Math.max(0, Number(orderNotes.discount) || 0);

        // The order was created for a specific user; refuse to settle it for anyone else.
        if (orderNotes.userId && String(orderNotes.userId) !== String(req.user.id)) {
            log.step('Verify order ownership', { success: false, orderUserId: orderNotes.userId, requestUserId: req.user.id });
            log.finish('ORDER_USER_MISMATCH');
            return res.status(403).json({ message: 'This order does not belong to the current user' });
        }
        log.step('Fetch Razorpay order', { success: true, amount, pointsUsed, pointsDiscount });

        // Check whether this payment has already been recorded (idempotency)
        const existingPurchase = await ProductPurchase.findOne({ razorpayPaymentId: razorpay_payment_id });
        if (existingPurchase) {
            log.step('Check existing purchase', { success: true, alreadyRecorded: true, purchaseId: existingPurchase._id });
            log.finish('ALREADY_RECORDED');
            return res.status(200).json({
                message: 'Purchase already recorded',
                purchase: existingPurchase
            });
        }

        // Get user and product details
        const user = await User.findById(req.user.id);
        const product = await ExploreProduct.findById(productId);

        if (!user) {
            log.step('Fetch user', { success: false, error: 'User not found' });
            log.finish('USER_NOT_FOUND');
            return res.status(404).json({ message: 'User not found' });
        }
        log.step('Fetch user & product', { success: true, userEmail: user.email, productFound: !!product });

        // Save Payment record. The webhook may have already recorded this same
        // payment; razorpayPaymentId is unique, so a duplicate-key error here just
        // means it's already saved and we can safely proceed.
        try {
            const payment = new Payment({
                userId: req.user.id,
                razorpayOrderId: razorpay_order_id,
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature,
                amount: amount,
                status: 'captured'
            });
            await payment.save();
            log.step('Save Payment record', { success: true, paymentId: payment._id });
        } catch (err) {
            if (err.code !== 11000) throw err;
            log.step('Save Payment record', { success: true, note: 'already recorded (webhook)' });
        }

        // Save Product Purchase record (will link invoiceId after invoice creation)
        const purchase = new ProductPurchase({
            userId: req.user.id,
            productId: productId,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            amount: amount,
            pointsUsed: pointsUsed,
            pointsDiscount: pointsDiscount
        });
        try {
            await purchase.save();
        } catch (saveError) {
            if (saveError.code === 11000) {
                const racePurchase = await ProductPurchase.findOne({ razorpayPaymentId: razorpay_payment_id });
                log.step('Save ProductPurchase record', { success: true, alreadyRecorded: true, purchaseId: racePurchase?._id });
                log.finish('ALREADY_RECORDED');
                return res.status(200).json({
                    message: 'Purchase already recorded',
                    purchase: racePurchase
                });
            }
            throw saveError;
        }
        log.step('Save ProductPurchase record', { success: true, purchaseId: purchase._id });

        // Debit the redeemed points. The unique razorpayPaymentId on the purchase above
        // is the idempotency gate — reaching this line means this payment had not been
        // settled before, so the balance can only be reduced once per payment.
        // The balance guard makes a concurrent debit elsewhere fail closed rather than
        // pushing the student negative.
        if (pointsUsed > 0) {
            const debitResult = await debitPoints(req.user.id, pointsUsed);

            if (debitResult.success) {
                log.step('Debit redeemed points', {
                    success: true,
                    pointsUsed,
                    pointsDiscount,
                    spentFromBonus: debitResult.spentFromBonus,
                    spentFromRewards: debitResult.spentFromRewards
                });
            } else {
                // The purchase stands — the student paid and must get their material.
                // Flag it loudly so the shortfall can be reconciled manually.
                console.error(
                    `[POINTS_DEBIT_FAILED] userId=${req.user.id} purchaseId=${purchase._id} ` +
                    `pointsUsed=${pointsUsed} — balance was insufficient at settlement time`
                );
                log.step('Debit redeemed points', {
                    success: false,
                    pointsUsed,
                    error: 'Insufficient balance at settlement; purchase honoured, needs reconciliation'
                });
            }
        }

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

        log.step('Complete', {
            success: true,
            invoiceId: invoiceRecord?._id || null,
            invoiceNumber: invoiceRecord?.invoiceNumber || null,
            emailSent: invoiceRecord?.emailSent || false
        });
        log.finish('SUCCESS');

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
        log.fail('EXCEPTION', error);
        res.status(500).json({ message: 'Error verifying payment', error: error.message });
    }
};

exports.createUpgradeOrder = async (req, res) => {
    const log = createRequestLogger('payment', {
        endpoint: 'POST /payment/upgrade/create-order',
        req,
        meta: {
            flow: 'razorpay-subscription-order',
            amount: req.body?.amount,
            newStandard: req.body?.newStandard,
            medium: req.body?.medium,
            stream: req.body?.stream,
            referralCode: req.body?.referralCode || null,
            redeemCode: req.body?.redeemCode || null
        }
    });
    try {
        const { amount, newStandard, medium, stream } = req.body;

        if (!amount || !newStandard) {
            log.step('Validate required fields', { success: false, error: 'Missing amount or newStandard' });
            log.finish('VALIDATION_FAILED');
            return res.status(400).json({ message: 'Amount and New Standard are required' });
        }
        log.step('Validate required fields', { success: true });

        const options = {
            amount: Math.round(amount * 100), // paise
            currency: 'INR',
            receipt: `upg_${Date.now()}_${Math.floor(Math.random() * 1000)}`
        };

        const razorpay = getRazorpayInstance();
        const order = await razorpay.orders.create(options);
        log.step('Razorpay order created', { success: true, orderId: order.id, receipt: options.receipt });
        log.finish('SUCCESS');
        res.json(order);
    } catch (error) {
        console.error('Error creating upgrade order:', error);
        log.fail('EXCEPTION', error);
        res.status(500).json({ message: 'Error creating Razorpay order', error: error.message });
    }
};

exports.verifyUpgradePayment = async (req, res) => {
    const log = createRequestLogger('payment', {
        endpoint: 'POST /payment/upgrade/verify',
        req,
        meta: {
            flow: 'razorpay-subscription-verify',
            amount: req.body?.amount,
            newStandard: req.body?.newStandard,
            medium: req.body?.medium,
            stream: req.body?.stream,
            razorpayOrderId: req.body?.razorpay_order_id,
            razorpayPaymentId: req.body?.razorpay_payment_id,
            razorpaySignature: mask(req.body?.razorpay_signature),
            referralCode: req.body?.referralCode || null,
            redeemCode: req.body?.redeemCode || null
        }
    });
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

        // Get Razorpay secret from database (NotificationConfig) or environment
        let razorpaySecret = null;

        try {
            const config = await NotificationConfig.findOne();
            if (config && config.razorpayKeySecret) {
                razorpaySecret = config.razorpayKeySecret;
                console.log(`[PAYMENT_VERIFICATION] ✓ Using razorpayKeySecret from database`);
            } else {
                razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
                if (razorpaySecret) {
                    console.log(`[PAYMENT_VERIFICATION] ✓ Using razorpayKeySecret from environment`);
                }
            }
        } catch (err) {
            console.error(`[PAYMENT_VERIFICATION] Error fetching config:`, err.message);
            razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
        }

        if (!razorpaySecret) {
            console.error(`[PAYMENT_VERIFICATION] ✗ razorpayKeySecret not configured!`);
            return res.status(500).json({ message: 'Payment configuration error' });
        }

        // Verify signature
        const shasum = crypto.createHmac('sha256', razorpaySecret);
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const digest = shasum.digest('hex');

        if (digest !== razorpay_signature) {
            console.error(`[PAYMENT_VERIFICATION] ✗ Signature mismatch for upgrade payment`);
            console.error(`[PAYMENT_VERIFICATION] Expected: ${digest}`);
            console.error(`[PAYMENT_VERIFICATION] Received: ${razorpay_signature}`);
            log.step('Verify signature', { success: false, error: 'Signature mismatch' });
            log.finish('SIGNATURE_MISMATCH');
            return res.status(400).json({ message: 'Transaction not legitimate!' });
        }
        console.log(`[PAYMENT_VERIFICATION] ✓ Upgrade payment signature verified`);
        log.step('Verify signature', { success: true });

        // Check whether this payment has already been recorded (idempotency)
        const existingUpgrade = await PlanUpgrade.findOne({ razorpayPaymentId: razorpay_payment_id });
        if (existingUpgrade) {
            log.step('Check existing upgrade', { success: true, alreadyRecorded: true, upgradeId: existingUpgrade._id });
            log.finish('ALREADY_RECORDED');
            return res.status(200).json({
                message: 'Plan upgrade already recorded',
                upgrade: existingUpgrade
            });
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
        try {
            await upgrade.save();
        } catch (saveError) {
            if (saveError.code === 11000) {
                const raceUpgrade = await PlanUpgrade.findOne({ razorpayPaymentId: razorpay_payment_id });
                log.step('Save PlanUpgrade record', { success: true, alreadyRecorded: true, upgradeId: raceUpgrade?._id });
                log.finish('ALREADY_RECORDED');
                return res.status(200).json({
                    message: 'Plan upgrade already recorded',
                    upgrade: raceUpgrade
                });
            }
            throw saveError;
        }
        log.step('Save PlanUpgrade record', { success: true, upgradeId: upgrade._id, oldStandard, newStandard });

        // Mark Redeem Code as Used
        if (req.body.redeemCode) {
            const RedeemCode = require('../models/RedeemCode');
            const usedCode = await RedeemCode.findOne({ code: req.body.redeemCode.toUpperCase() });
            if (usedCode && !usedCode.isExhausted()) {
                usedCode.recordUsage(req.user.id);
                await usedCode.save();
                log.step('Apply redeem code', { success: true, code: req.body.redeemCode.toUpperCase(), discount: usedCode.discount, discountType: usedCode.discountType });
            } else {
                const failureReason = !usedCode
                    ? 'Code not found'
                    : usedCode.isRevoked() ? 'Code revoked' : 'Code exhausted';
                log.step('Apply redeem code', { success: false, code: req.body.redeemCode.toUpperCase(), error: failureReason });
            }
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
            const description = `Plan Upgrade: Standard ${oldStandard} to Standard ${newStandard}`;
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

        log.step('Complete', {
            success: true,
            invoiceId: invoiceRecord?._id || null,
            invoiceNumber: invoiceRecord?.invoiceNumber || null,
            emailSent: invoiceRecord?.emailSent || false
        });
        log.finish('SUCCESS');

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
        log.fail('EXCEPTION', error);
        res.status(500).json({ message: 'Error verifying payment', error: error.message });
    }
};

// ============================================================
// Apple In-App Purchase Verification
// ============================================================

const APPLE_VERIFY_RECEIPT_PRODUCTION = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_RECEIPT_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';
const APPLE_APP_SHARED_SECRET = process.env.APPLE_APP_SHARED_SECRET || '';
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.bondbyte.studentsapp';

/**
 * POST a receipt to one of Apple's verifyReceipt endpoints
 */
const postAppleReceipt = async (url, payload) => {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Apple API returned HTTP ${response.status}`);
    }

    return response.json();
};

/**
 * Verify Apple receipt with Apple servers.
 * Always hits production first; on status 21007 the receipt came from the test
 * environment, so it is retried against sandbox (Apple's documented flow, which
 * keeps TestFlight and sandbox testers working against the live endpoint).
 */
const verifyAppleReceipt = async (receiptData) => {
    const payload = {
        'receipt-data': receiptData
    };

    if (APPLE_APP_SHARED_SECRET) {
        payload['password'] = APPLE_APP_SHARED_SECRET;
    }

    try {
        const result = await postAppleReceipt(APPLE_VERIFY_RECEIPT_PRODUCTION, payload);

        if (result.status === 21007) {
            console.log('Apple receipt is from sandbox, retrying against sandbox endpoint');
            return postAppleReceipt(APPLE_VERIFY_RECEIPT_SANDBOX, payload);
        }

        return result;
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
            amount: req.body?.amount,
            receipt: req.body?.receipt ? `[RECEIPT_${req.body.receipt.substring(0, 20)}...]` : null
        },
        steps: []
    };

    try {
        const { receipt, productId, apple_transaction_id, standard, medium, stream, amount } = req.body;

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
        logEntry.steps.push({ step: 'Calling Apple API', success: true, appleUrl: APPLE_VERIFY_RECEIPT_PRODUCTION });
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
                21007: 'Receipt from test environment (sandbox retry failed)',
                21008: 'Receipt from production environment (sent to production endpoint)'
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

        // Validate that the receipt belongs to our app
        if (bundleId !== APPLE_BUNDLE_ID) {
            logEntry.steps.push({
                step: 'Validate bundle ID',
                success: false,
                error: `Bundle ID (${bundleId}) does not match expected app bundle ID (${APPLE_BUNDLE_ID})`
            });
            console.log('[APPLE_VERIFY_MEMBERSHIP_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-membership', logEntry);
            return res.status(400).json({ message: 'Receipt is not from this app' });
        }

        logEntry.steps.push({ step: 'Validate bundle ID', success: true });

        // Validate that the requested product is actually present in the receipt
        const purchasedProductIds = [
            ...(receiptInfo.in_app || []),
            ...(appleResult.latest_receipt_info || [])
        ].map(p => p.product_id);

        if (!purchasedProductIds.includes(productId)) {
            logEntry.steps.push({
                step: 'Validate productId match',
                success: false,
                error: `Requested productId (${productId}) not found in receipt products [${purchasedProductIds.join(', ')}]`
            });
            console.log('[APPLE_VERIFY_MEMBERSHIP_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-membership', logEntry);
            return res.status(400).json({ message: 'Product ID mismatch - receipt does not match requested product' });
        }

        logEntry.steps.push({ step: 'Validate productId match', success: true });

        // Check whether this specific Apple transaction has already been processed (idempotency)
        // Use both transaction_id and original_transaction_id to identify unique purchases
        const existingPayment = await Payment.findOne({
            'appleReceiptData.transactionId': apple_transaction_id,
            'appleReceiptData.originalTransactionId': receiptInfo.original_transaction_id
        });

        if (existingPayment && existingPayment.userId.toString() !== req.user.id.toString()) {
            // Same transaction redeemed by a different account
            logEntry.steps.push({
                step: 'Check existing payment',
                success: false,
                error: `Apple transaction already redeemed by another user (${existingPayment.userId})`
            });
            console.log('[APPLE_VERIFY_MEMBERSHIP_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-membership', logEntry);
            return res.status(409).json({ message: 'This Apple purchase has already been redeemed by another account' });
        }

        let savedPayment;
        if (existingPayment) {
            // Already processed for this user — reuse the record and continue (idempotent)
            savedPayment = existingPayment;
            logEntry.steps.push({
                step: 'Reuse existing payment',
                success: true,
                paymentId: savedPayment._id
            });
        } else {
            // Save Payment record with complete verification details
            logEntry.steps.push({ step: 'Creating Payment record', success: true });
            const appleOrderId = `apple_${apple_transaction_id}_${Date.now()}`;
            const payment = new Payment({
                userId: req.user.id,
                razorpayOrderId: appleOrderId,
                razorpayPaymentId: apple_transaction_id,
                razorpaySignature: 'apple_iap',
                amount: amount || 0,
                status: 'captured',
                appleReceiptData: {
                    bundleId,
                    purchaseDate,
                    expiresDate,
                    transactionId: apple_transaction_id,
                    originalTransactionId: receiptInfo.original_transaction_id
                }
            });
            savedPayment = await payment.save();

            logEntry.steps.push({
                step: 'Save Payment record',
                success: true,
                paymentId: savedPayment._id
            });
        }

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
                21007: 'Receipt from test environment (sandbox retry failed)',
                21008: 'Receipt from production environment (sent to production endpoint)'
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

        // Validate that the receipt belongs to our app
        if (bundleId !== APPLE_BUNDLE_ID) {
            logEntry.steps.push({
                step: 'Validate bundle ID',
                success: false,
                error: `Bundle ID (${bundleId}) does not match expected app bundle ID (${APPLE_BUNDLE_ID})`
            });
            console.log('[APPLE_VERIFY_UPGRADE_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-upgrade', logEntry);
            return res.status(400).json({ message: 'Receipt is not from this app' });
        }

        logEntry.steps.push({ step: 'Validate bundle ID', success: true });

        // Validate that the requested product is actually present in the receipt
        const purchasedProductIds = [
            ...(receiptInfo.in_app || []),
            ...(appleResult.latest_receipt_info || [])
        ].map(p => p.product_id);

        if (!purchasedProductIds.includes(productId)) {
            logEntry.steps.push({
                step: 'Validate productId match',
                success: false,
                error: `Requested productId (${productId}) not found in receipt products [${purchasedProductIds.join(', ')}]`
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

        // Check whether this specific Apple transaction has already been processed (idempotency)
        // Use both transaction_id and original_transaction_id to identify unique purchases
        const existingUpgrade = await PlanUpgrade.findOne({
            'appleReceiptData.transactionId': apple_transaction_id,
            'appleReceiptData.originalTransactionId': receiptInfo.original_transaction_id
        });

        if (existingUpgrade && existingUpgrade.userId.toString() !== req.user.id.toString()) {
            logEntry.steps.push({
                step: 'Check existing upgrade',
                success: false,
                error: `Apple transaction already redeemed by another user (${existingUpgrade.userId})`
            });
            console.log('[APPLE_VERIFY_UPGRADE_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-upgrade', logEntry);
            return res.status(409).json({ message: 'This Apple purchase has already been redeemed by another account' });
        }

        let savedUpgrade;
        if (existingUpgrade) {
            savedUpgrade = existingUpgrade;
            logEntry.steps.push({
                step: 'Reuse existing PlanUpgrade record',
                success: true,
                upgradeId: savedUpgrade._id
            });
        } else {
            // Save Upgrade record with complete verification details
            logEntry.steps.push({ step: 'Creating PlanUpgrade record', success: true });
            const upgrade = new PlanUpgrade({
                userId: req.user.id,
                oldStandard,
                newStandard,
                medium,
                stream,
                amount: amount || 0,
                paymentMethod: 'apple',
                appleReceiptData: {
                    bundleId,
                    purchaseDate,
                    expiresDate,
                    transactionId: apple_transaction_id,
                    originalTransactionId: receiptInfo.original_transaction_id
                }
            });
            savedUpgrade = await upgrade.save();

            logEntry.steps.push({
                step: 'Save PlanUpgrade record',
                success: true,
                upgradeId: savedUpgrade._id
            });
        }

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
                21007: 'Receipt from test environment (sandbox retry failed)',
                21008: 'Receipt from production environment (sent to production endpoint)'
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

        // Validate that the receipt belongs to our app
        if (bundleId !== APPLE_BUNDLE_ID) {
            logEntry.steps.push({
                step: 'Validate bundle ID',
                success: false,
                error: `Bundle ID (${bundleId}) does not match expected app bundle ID (${APPLE_BUNDLE_ID})`
            });
            console.log('[APPLE_VERIFY_PRODUCT_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-product', logEntry);
            return res.status(400).json({ message: 'Receipt is not from this app' });
        }

        logEntry.steps.push({ step: 'Validate bundle ID', success: true });

        // Validate that the purchased material product is actually present in the receipt
        const purchasedProductIds = [
            ...(receiptInfo.in_app || []),
            ...(appleResult.latest_receipt_info || [])
        ].map(p => p.product_id);

        if (!purchasedProductIds.includes(materialProductId)) {
            logEntry.steps.push({
                step: 'Validate productId match',
                success: false,
                error: `Requested materialProductId (${materialProductId}) not found in receipt products [${purchasedProductIds.join(', ')}]`
            });
            console.log('[APPLE_VERIFY_PRODUCT_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-product', logEntry);
            return res.status(400).json({ message: 'Product ID mismatch - receipt does not match requested product' });
        }

        logEntry.steps.push({ step: 'Validate productId match', success: true });

        // Check whether this specific Apple transaction has already been processed (idempotency)
        // Use both transaction_id and original_transaction_id to identify unique purchases
        const existingPayment = await Payment.findOne({
            'appleReceiptData.transactionId': apple_transaction_id,
            'appleReceiptData.originalTransactionId': receiptInfo.original_transaction_id
        });

        if (existingPayment && existingPayment.userId.toString() !== req.user.id.toString()) {
            logEntry.steps.push({
                step: 'Check existing payment',
                success: false,
                error: `Apple transaction already redeemed by another user (${existingPayment.userId})`
            });
            console.log('[APPLE_VERIFY_PRODUCT_LOG]', JSON.stringify(logEntry, null, 2));
            writeLog('apple-product', logEntry);
            return res.status(409).json({ message: 'This Apple purchase has already been redeemed by another account' });
        }

        let savedPayment;
        if (existingPayment) {
            savedPayment = existingPayment;
            logEntry.steps.push({
                step: 'Reuse existing payment',
                success: true,
                paymentId: savedPayment._id
            });
        } else {
            // Save Payment record with complete verification details
            logEntry.steps.push({ step: 'Creating Payment record', success: true });
            const appleOrderId = `apple_${apple_transaction_id}_${Date.now()}`;
            const payment = new Payment({
                userId: req.user.id,
                razorpayOrderId: appleOrderId,
                razorpayPaymentId: apple_transaction_id,
                razorpaySignature: 'apple_iap',
                amount: amount || 0,
                status: 'captured',
                appleReceiptData: {
                    bundleId,
                    purchaseDate,
                    expiresDate,
                    transactionId: apple_transaction_id,
                    originalTransactionId: receiptInfo.original_transaction_id
                }
            });
            savedPayment = await payment.save();

            logEntry.steps.push({
                step: 'Save Payment record',
                success: true,
                paymentId: savedPayment._id
            });
        }

        // Save Product Purchase record (idempotent — reuse if it already exists)
        let savedPurchase = await ProductPurchase.findOne({
            userId: req.user.id,
            'appleReceiptData.transactionId': apple_transaction_id,
            'appleReceiptData.originalTransactionId': receiptInfo.original_transaction_id
        });
        if (savedPurchase) {
            logEntry.steps.push({
                step: 'Reuse existing ProductPurchase record',
                success: true,
                purchaseId: savedPurchase._id
            });
        } else {
            logEntry.steps.push({ step: 'Creating ProductPurchase record', success: true });
            const purchase = new ProductPurchase({
                userId: req.user.id,
                productId: materialProductId,
                razorpayOrderId: `apple_${apple_transaction_id}_${Date.now()}`,
                razorpayPaymentId: apple_transaction_id,
                amount: amount || 0,
                appleReceiptData: {
                    bundleId,
                    purchaseDate,
                    transactionId: apple_transaction_id,
                    originalTransactionId: receiptInfo.original_transaction_id
                }
            });
            savedPurchase = await purchase.save();

            logEntry.steps.push({
                step: 'Save ProductPurchase record',
                success: true,
                purchaseId: savedPurchase._id
            });
        }

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

