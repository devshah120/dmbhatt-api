const express = require('express');
const router = express.Router();
const materialController = require('../controllers/materialController');
const multer = require('multer');
const { createDiskStorage } = require('../config/uploadConfig');
const path = require('path');

// Configure storage for Materials
const storage = createDiskStorage('materials');

const uploadMaterial = multer({ storage: storage }).fields([{ name: 'file', maxCount: 1 }]);

const { protect } = require('../middleware/authMiddleware');

router.post('/upload-board-paper', protect, uploadMaterial, materialController.uploadBoardPaper);
router.post('/upload-school-paper', protect, uploadMaterial, materialController.uploadSchoolPaper);
router.post('/upload-image-material', protect, uploadMaterial, materialController.uploadImageMaterial);
router.post('/upload-notes', protect, uploadMaterial, materialController.uploadNotes);
router.get('/all', materialController.getAllMaterials);
router.delete('/delete/:id', protect, materialController.deleteMaterial);
router.put('/update/:id', protect, uploadMaterial, materialController.updateMaterial);

module.exports = router;
