const express = require('express');
const router = express.Router();
const objectivesTestSeriesController = require('../controllers/objectivesTestSeriesController');
const multer = require('multer');

const { protect, optionalProtect } = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-pdf', upload.single('file'), objectivesTestSeriesController.uploadObjectivesTestSeriesPdf);
router.post('/create', objectivesTestSeriesController.createExam);
router.get('/all', objectivesTestSeriesController.getAllExams);
router.get('/next-order-index', objectivesTestSeriesController.getNextOrderIndex);
router.get('/my-results', protect, objectivesTestSeriesController.getMyResults);
router.get('/my-results/:resultId', protect, objectivesTestSeriesController.getMyResultDetail);
router.post('/submit', protect, objectivesTestSeriesController.submitResult);
router.get('/leaderboard/combined', protect, objectivesTestSeriesController.getCombinedLeaderboard);
router.get('/:id/leaderboard', protect, objectivesTestSeriesController.getLeaderboard);
router.get('/:id', optionalProtect, objectivesTestSeriesController.getExamById);
router.put('/update/:id', objectivesTestSeriesController.updateExam);
router.delete('/delete/:id', objectivesTestSeriesController.deleteExam);

module.exports = router;
