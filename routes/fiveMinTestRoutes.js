const express = require('express');
const router = express.Router();
const fiveMinTestController = require('../controllers/fiveMinTestController');

router.post('/create', fiveMinTestController.createTest);
router.get('/all', fiveMinTestController.getAllTests);
router.put('/update/:id', fiveMinTestController.updateTest);
router.delete('/delete/:id', fiveMinTestController.deleteTest);

module.exports = router;
