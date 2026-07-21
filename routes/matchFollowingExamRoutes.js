const express = require('express');
const router = express.Router();
const matchFollowingExamController = require('../controllers/matchFollowingExamController');
const { protect, optionalProtect } = require('../middleware/authMiddleware');

router.post('/create', matchFollowingExamController.createExam);
router.get('/all', optionalProtect, matchFollowingExamController.getAllExams);
router.get('/:id', optionalProtect, matchFollowingExamController.getExamById);
router.put('/update/:id', matchFollowingExamController.updateExam);
router.delete('/delete/:id', matchFollowingExamController.deleteExam);
router.post('/submit', protect, matchFollowingExamController.submitResult);

module.exports = router;
