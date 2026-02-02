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

// Get All Exams
router.get('/all', examController.getAllExams);

// Get Single Exam
router.get('/:id', examController.getExamById);

// Update Exam
router.put('/update/:id', examController.updateExam);

// Delete Exam
router.delete('/delete/:id', examController.deleteExam);

module.exports = router;
