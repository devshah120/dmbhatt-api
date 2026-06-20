const express = require('express');
const router = express.Router();
const trueFalseExamController = require('../controllers/trueFalseExamController');
const multer = require('multer');

const { protect } = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-pdf', upload.single('file'), trueFalseExamController.uploadTrueFalseExamPdf);
router.post('/create', trueFalseExamController.createExam);
router.get('/all', trueFalseExamController.getAllExams);
router.get('/:id', trueFalseExamController.getExamById);
router.put('/update/:id', trueFalseExamController.updateExam);
router.delete('/delete/:id', trueFalseExamController.deleteExam);
router.post('/submit', protect, trueFalseExamController.submitResult);

module.exports = router;
