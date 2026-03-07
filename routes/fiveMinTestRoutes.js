const express = require('express');
const router = express.Router();
const fiveMinTestController = require('../controllers/fiveMinTestController');
const multer = require('multer');

const { protect } = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-pdf', upload.single('file'), fiveMinTestController.uploadFiveMinTestPdf);
router.post('/create', fiveMinTestController.createTest);
router.get('/all', fiveMinTestController.getAllTests);
router.get('/:id', fiveMinTestController.getTestById);
router.put('/update/:id', fiveMinTestController.updateTest);
router.delete('/delete/:id', fiveMinTestController.deleteTest);
router.post('/submit', protect, fiveMinTestController.submitResult);

module.exports = router;
