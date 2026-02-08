const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const { protect } = require('../middleware/authMiddleware');

// GET /api/referral/data - Get user's referral data (code, points, invited friends)
router.get('/data', protect, referralController.getReferralData);

// POST /api/referral/apply - Apply a referral code
router.post('/apply', protect, referralController.applyReferralCode);

module.exports = router;
