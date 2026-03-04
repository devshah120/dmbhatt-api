const express = require('express');
const router = express.Router();
const fiveMinTestController = require('../controllers/fiveMinTestController');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-pdf', upload.single('file'), fiveMinTestController.uploadFiveMinTestPdf);
router.post('/create', fiveMinTestController.createTest);
router.get('/all', fiveMinTestController.getAllTests);
router.put('/update/:id', fiveMinTestController.updateTest);
router.delete('/delete/:id', fiveMinTestController.deleteTest);

module.exports = router;
