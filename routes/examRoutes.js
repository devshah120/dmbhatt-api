const express = require('express');
const router = express.Router();
const { submitExamResult } = require('../controllers/examController');
const { protect } = require('../middleware/authMiddleware');

router.post('/submit', protect, submitExamResult);

module.exports = router;
