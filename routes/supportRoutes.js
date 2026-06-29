const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const { createDiskStorage } = require('../config/uploadConfig');

const storage = createDiskStorage('support');
const uploadSupport = multer({ storage: storage }).single('screenshot');

router.post('/submit', protect, uploadSupport, supportController.createSupportTicket);
router.get('/my-tickets', protect, supportController.getSupportTickets);

module.exports = router;
