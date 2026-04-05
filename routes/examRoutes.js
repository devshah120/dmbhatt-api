const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const multer = require('multer');

// Memory storage for PDF processing
const upload = multer({ storage: multer.memoryStorage() });

// Upload PDF for parsing (returns JSON)
router.post('/upload-pdf', upload.single('file'), examController.uploadExamPdf);

// Submit exam result (Student)
const { protect } = require('../middleware/authMiddleware');
router.post('/submit', protect, examController.submitExam);
router.post('/violation', protect, examController.updateViolation);

// Admin Actions (Protected)
router.post('/create', protect, examController.saveExam);
router.put('/update/:id', protect, examController.updateExam);
router.delete('/delete/:id', protect, examController.deleteExam);

// Public/Open Get Routes
router.get('/all', examController.getAllExams);
router.get('/:id', examController.getExamById);

module.exports = router;
