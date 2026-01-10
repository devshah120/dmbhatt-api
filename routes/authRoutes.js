const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { registrationValidation, loginValidation } = require('../middleware/validator');
const { uploadPhoto, uploadAssistantFiles } = require('../config/uploadConfig');

/**
 * Middleware to handle file uploads based on role
 */
const handleFileUpload = (req, res, next) => {
    const { role } = req.body;

    if (role === 'assistant') {
        // Assistant needs aadhar file
        uploadAssistantFiles(req, res, (err) => {
            if (err) {
                return res.status(400).json({ message: err.message });
            }
            next();
        });
    } else if (role === 'student' || role === 'guest') {
        // Student and guest need photo
        uploadPhoto(req, res, (err) => {
            if (err) {
                return res.status(400).json({ message: err.message });
            }
            next();
        });
    } else {
        // Admin doesn't need file upload
        next();
    }
};

/**
 * Middleware to handle file uploads for login (student/guest photo verification)
 */
const handleLoginFileUpload = (req, res, next) => {
    const { role } = req.body;

    if (role === 'student' || role === 'guest') {
        uploadPhoto(req, res, (err) => {
            if (err) {
                return res.status(400).json({ message: err.message });
            }
            next();
        });
    } else {
        next();
    }
};

// Registration route - single endpoint with role in body
router.post('/register', handleFileUpload, registrationValidation, authController.register);

// Login route - single endpoint with role in body
router.post('/login', handleLoginFileUpload, loginValidation, authController.login);

module.exports = router;
