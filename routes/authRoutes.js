const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { registrationValidation, loginValidation } = require('../middleware/validator');
const { uploadUniversal } = require('../config/uploadConfig');

// Registration route - single endpoint with role in body
router.post('/register', uploadUniversal, registrationValidation, authController.register);

// Login route - single endpoint with role in body
router.post('/login', uploadUniversal, loginValidation, authController.login);

// Forgot Password Flow
router.post('/forget-password', authController.forgetPassword);
router.post('/verify-otp', authController.verifyOtp);
router.post('/reset-password', authController.resetPassword);

// Protected routes
const { protect } = require('../middleware/authMiddleware');
router.post('/update-password', protect, authController.updatePassword);

module.exports = router;
