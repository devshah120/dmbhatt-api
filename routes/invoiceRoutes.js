const express = require('express');
const router = express.Router();
const invoiceCtrl = require('../controllers/invoiceController');
const { protect } = require('../middleware/authMiddleware');

// Student routes
router.get('/my-invoices', protect, invoiceCtrl.getUserInvoices);
router.get('/download/:invoiceId', protect, invoiceCtrl.downloadInvoice);

// Admin routes
router.get('/all', protect, invoiceCtrl.getAllInvoices);
router.post('/resend/:invoiceId', protect, invoiceCtrl.resendInvoiceEmail);

module.exports = router;
