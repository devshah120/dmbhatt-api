const express = require('express');
const router = express.Router();
const boardCrackerController = require('../controllers/boardCrackerController');
const multer = require('multer');

const { protect, optionalProtect } = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-pdf', upload.single('file'), boardCrackerController.uploadBoardCrackerPdf);
router.post('/create', boardCrackerController.createExam);
router.get('/all', boardCrackerController.getAllExams);
router.get('/next-order-index', boardCrackerController.getNextOrderIndex);
router.get('/my-results', protect, boardCrackerController.getMyResults);
router.post('/submit', protect, boardCrackerController.submitResult);
router.get('/:id', optionalProtect, boardCrackerController.getExamById);
router.put('/update/:id', boardCrackerController.updateExam);
router.delete('/delete/:id', boardCrackerController.deleteExam);

module.exports = router;
