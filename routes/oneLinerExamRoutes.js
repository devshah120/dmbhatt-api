const express = require('express');
const router = express.Router();
const oneLinerExamController = require('../controllers/oneLinerExamController');

const { protect, optionalProtect } = require('../middleware/authMiddleware');

router.post('/add', oneLinerExamController.createExam);
router.get('/all', oneLinerExamController.getAllExams);
router.post('/submit', protect, oneLinerExamController.submitResult);
router.get('/:id', optionalProtect, oneLinerExamController.getExamById);
router.delete('/:id', oneLinerExamController.deleteExam);
router.put('/:id', oneLinerExamController.updateExam);

module.exports = router;
