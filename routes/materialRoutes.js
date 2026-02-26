const express = require('express');
const router = express.Router();
const materialController = require('../controllers/materialController');
const multer = require('multer');
const { cloudinary } = require('../config/uploadConfig');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

// Configure storage for Materials
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'materials',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'pdf'],
        public_id: (req, file) => Date.now() + '-' + path.parse(file.originalname).name
    }
});

const uploadMaterial = multer({ storage: storage }).fields([{ name: 'file', maxCount: 1 }]);

router.post('/upload-board-paper', uploadMaterial, materialController.uploadBoardPaper);
router.post('/upload-school-paper', uploadMaterial, materialController.uploadSchoolPaper);
router.post('/upload-image-material', uploadMaterial, materialController.uploadImageMaterial);
router.get('/all', materialController.getAllMaterials);
router.delete('/delete/:id', materialController.deleteMaterial);

module.exports = router;
