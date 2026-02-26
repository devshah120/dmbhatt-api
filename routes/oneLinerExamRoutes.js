const express = require('express');
const router = express.Router();
const oneLinerExamController = require('../controllers/oneLinerExamController');

router.post('/add', oneLinerExamController.createExam);
router.get('/all', oneLinerExamController.getAllExams);
router.get('/:id', oneLinerExamController.getExamById);
router.delete('/:id', oneLinerExamController.deleteExam);
router.put('/:id', oneLinerExamController.updateExam);

module.exports = router;
