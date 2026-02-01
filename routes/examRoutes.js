const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const multer = require('multer');

// Memory storage for PDF processing
const upload = multer({ storage: multer.memoryStorage() });

// Upload PDF for parsing (returns JSON)
router.post('/upload-pdf', upload.single('file'), examController.uploadExamPdf);

// Save verified exam
router.post('/create', examController.saveExam);

module.exports = router;
