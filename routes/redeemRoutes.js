const express = require('express');
const router = express.Router();
const redeemController = require('../controllers/redeemController');
const { protect } = require('../middleware/authMiddleware');

router.post('/validate', protect, redeemController.validateRedeemCode);

module.exports = router;
