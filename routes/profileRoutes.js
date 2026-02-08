const express = require('express');
const router = express.Router();
const { getProfile, updateProfile } = require('../controllers/profileController');
const { protect } = require('../middleware/authMiddleware');
const { uploadUniversal } = require('../config/uploadConfig');

router.get('/', protect, getProfile);
router.put('/', protect, uploadUniversal, updateProfile);

module.exports = router;
