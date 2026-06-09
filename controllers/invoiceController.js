const Invoice = require('../models/Invoice');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

// Get all invoices for logged-in user
exports.getUserInvoices = async (req, res) => {
    try {
        const invoices = await Invoice.find({ userId: req.user.id })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: invoices.length,
            invoices
        });
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ message: 'Failed to fetch invoices', error: error.message });
    }
};

// Download invoice PDF
exports.downloadInvoice = async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await Invoice.findById(invoiceId);

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // Verify user ownership
        if (invoice.userId.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Check if file exists
        if (!fs.existsSync(invoice.filePath)) {
            return res.status(404).json({ message: 'Invoice file not found' });
        }

        // Send file
        res.download(invoice.filePath, invoice.fileName);
    } catch (error) {
        console.error('Error downloading invoice:', error);
        res.status(500).json({ message: 'Failed to download invoice', error: error.message });
    }
};

// Admin: Get all invoices
exports.getAllInvoices = async (req, res) => {
    try {
        const { skip = 0, limit = 25, paymentType, userId } = req.query;

        const query = {};
        if (paymentType) query.paymentType = paymentType;
        if (userId) query.userId = userId;

        const invoices = await Invoice.find(query)
            .populate('userId', 'firstName email phoneNum')
            .sort({ createdAt: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit));

        const total = await Invoice.countDocuments(query);

        res.status(200).json({
            success: true,
            total,
            count: invoices.length,
            invoices
        });
    } catch (error) {
        console.error('Error fetching all invoices:', error);
        res.status(500).json({ message: 'Failed to fetch invoices', error: error.message });
    }
};

// Admin: Resend invoice email
exports.resendInvoiceEmail = async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await Invoice.findById(invoiceId);
        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const user = await User.findById(invoice.userId);
        if (!user || !user.email) {
            return res.status(400).json({ message: 'User or email not found' });
        }

        const nodemailer = require('nodemailer');
        const NotificationConfig = require('../models/NotificationConfig');

        const config = await NotificationConfig.findOne();
        if (!config?.emailHost || !config?.emailUser || !config?.emailPassword) {
            return res.status(400).json({ message: 'SMTP not configured' });
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
            subject: `Invoice #${invoice.invoiceNumber} - Padhaku Desk`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Invoice</h2>
                    <p>Dear ${user.firstName},</p>
                    <p>Please find your invoice attached.</p>
                    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Invoice Details:</strong></p>
                        <p>Invoice #: ${invoice.invoiceNumber}</p>
                        <p>Description: ${invoice.description}</p>
                        <p>Amount: ₹${invoice.amount.toFixed(2)}</p>
                        <p>Payment ID: ${invoice.razorpayPaymentId}</p>
                        <p>Date: ${new Date(invoice.createdAt).toLocaleDateString('en-IN')}</p>
                    </div>
                    <p>Best regards,<br><strong>Padhaku Desk</strong></p>
                </div>
            `,
            attachments: [
                {
                    filename: invoice.fileName,
                    path: invoice.filePath
                }
            ]
        };

        await transporter.sendMail(mailOptions);

        invoice.emailSent = true;
        invoice.emailSentAt = new Date();
        invoice.emailError = null;
        await invoice.save();

        console.log(`✓ Invoice email resent to ${user.email}`);
        res.status(200).json({
            message: 'Invoice email sent successfully',
            invoice
        });
    } catch (error) {
        console.error('Error resending invoice:', error);
        res.status(500).json({ message: 'Failed to resend invoice', error: error.message });
    }
};
