const express = require('express');
const router = express.Router();
const exploreController = require('../controllers/exploreController');
const multer = require('multer');
const { createDiskStorage } = require('../config/uploadConfig');
const path = require('path');

// Configure storage for Explore Products
const storage = createDiskStorage('explore_products');

const uploadExplore = multer({ storage: storage }).fields([{ name: 'image', maxCount: 1 }]);

router.post('/add', uploadExplore, exploreController.createProduct);
router.get('/all', exploreController.getAllProducts);
router.put('/edit/:id', uploadExplore, exploreController.updateProduct);
router.delete('/delete/:id', exploreController.deleteProduct);

module.exports = router;
