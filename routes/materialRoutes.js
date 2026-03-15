const express = require('express');
const router = express.Router();
const materialController = require('../controllers/materialController');
const multer = require('multer');
const { createDiskStorage } = require('../config/uploadConfig');
const path = require('path');

// Configure storage for Materials
const storage = createDiskStorage('materials');

const uploadMaterial = multer({ storage: storage }).fields([{ name: 'file', maxCount: 1 }]);

router.post('/upload-board-paper', uploadMaterial, materialController.uploadBoardPaper);
router.post('/upload-school-paper', uploadMaterial, materialController.uploadSchoolPaper);
router.post('/upload-image-material', uploadMaterial, materialController.uploadImageMaterial);
router.post('/upload-notes', uploadMaterial, materialController.uploadNotes);
router.get('/all', materialController.getAllMaterials);
router.delete('/delete/:id', materialController.deleteMaterial);
router.put('/update/:id', uploadMaterial, materialController.updateMaterial);

module.exports = router;
