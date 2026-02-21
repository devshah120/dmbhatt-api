const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, getPurchasedProducts, getUpgradeHistory } = require('../controllers/profileController');
const { protect } = require('../middleware/authMiddleware');
const { uploadUniversal } = require('../config/uploadConfig');

router.get('/', protect, getProfile);
router.put('/', protect, uploadUniversal, updateProfile);
router.get('/purchased-products', protect, getPurchasedProducts);
router.get('/upgrade-history', protect, getUpgradeHistory);

module.exports = router;
