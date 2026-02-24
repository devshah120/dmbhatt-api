const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const multer = require('multer');
const { storage } = require('../config/uploadConfig');

// Configure Multer for Cloudinary
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * @route   POST /api/media/upload-image
 * @desc    Upload an image to Cloudinary
 * @access  Private (or public depending on requirements, usually protected)
 */
// The field name should be 'image' as expected by the frontend
router.post('/upload-image', upload.single('image'), mediaController.uploadImage);

module.exports = router;
