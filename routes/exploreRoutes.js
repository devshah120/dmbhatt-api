const express = require('express');
const router = express.Router();
const exploreController = require('../controllers/exploreController');
const multer = require('multer');
const { cloudinary } = require('../config/uploadConfig');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

// Configure storage for Explore Products
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'explore_products',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        public_id: (req, file) => Date.now() + '-' + path.parse(file.originalname).name
    }
});

const uploadExplore = multer({ storage: storage }).fields([{ name: 'image', maxCount: 1 }]);

router.post('/add', uploadExplore, exploreController.createProduct);
router.get('/all', exploreController.getAllProducts);

module.exports = router;
