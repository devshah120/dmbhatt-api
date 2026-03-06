const express = require('express');
const router = express.Router();
const oneLinerExamController = require('../controllers/oneLinerExamController');

const auth = require('../middleware/auth');

router.post('/add', oneLinerExamController.createExam);
router.get('/all', oneLinerExamController.getAllExams);
router.post('/submit', auth, oneLinerExamController.submitResult);
router.get('/:id', oneLinerExamController.getExamById);
router.delete('/:id', oneLinerExamController.deleteExam);
router.put('/:id', oneLinerExamController.updateExam);

module.exports = router;
