const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { registrationValidation, loginValidation } = require('../middleware/validator');
const { uploadUniversal } = require('../config/uploadConfig');

// Registration route - single endpoint with role in body
router.post('/register', uploadUniversal, registrationValidation, authController.register);

// Login route - single endpoint with role in body
router.post('/login', uploadUniversal, loginValidation, authController.login);

module.exports = router;
