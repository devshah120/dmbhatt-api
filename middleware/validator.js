const { body, validationResult } = require('express-validator');

/**
 * Dynamic registration validation based on role
 */
const registrationValidation = [
    body('role')
        .notEmpty().withMessage('Role is required')
        .isIn(['admin', 'assistant', 'student', 'guest']).withMessage('Invalid role'),

    body('loginCode')
        .notEmpty().withMessage('Login code is required')
        .isLength({ min: 4 }).withMessage('Login code must be at least 4 characters'),

    body('phoneNum')
        .notEmpty().withMessage('Phone number is required')
        .isMobilePhone().withMessage('Invalid phone number'),

    // Admin-specific validation
    body('name').if(body('role').equals('admin'))
        .notEmpty().withMessage('Name is required for admin'),

    body('email').if(body('role').equals('admin'))
        .notEmpty().withMessage('Email is required for admin')
        .isEmail().withMessage('Invalid email address'),

    // Assistant-specific validation
    body('name').if(body('role').equals('assistant'))
        .notEmpty().withMessage('Name is required for assistant'),

    body('email').if(body('role').equals('assistant'))
        .notEmpty().withMessage('Email is required for assistant')
        .isEmail().withMessage('Invalid email address'),

    body('aadharNum').if(body('role').equals('assistant'))
        .notEmpty().withMessage('Aadhar number is required for assistant')
        .isLength({ min: 12, max: 12 }).withMessage('Aadhar number must be 12 digits'),

    body('address').if(body('role').equals('assistant'))
        .notEmpty().withMessage('Address is required for assistant'),

    // Student-specific validation
    body('firstName').if(body('role').equals('student'))
        .notEmpty().withMessage('First name is required for student'),

    // body('middleName').if(body('role').equals('student'))
    //     .notEmpty().withMessage('Middle name is required for student'),

    // body('lastName').if(body('role').equals('student'))
    //     .notEmpty().withMessage('Last name is required for student'),

    body('std').if(body('role').equals('student'))
        .notEmpty().withMessage('STD is required for student'),

    body('medium').if(body('role').equals('student'))
        .notEmpty().withMessage('Medium is required for student'),

    body('school').if(body('role').equals('student'))
        .notEmpty().withMessage('School is required for student'),

    // Guest-specific validation
    body('firstName').if(body('role').equals('guest'))
        .notEmpty().withMessage('First name is required for guest'),

    // body('middleName').if(body('role').equals('guest'))
    //     .notEmpty().withMessage('Middle name is required for guest'),

    // body('lastName').if(body('role').equals('guest'))
    //     .notEmpty().withMessage('Last name is required for guest'),

    // Validation result handler
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

/**
 * Login validation
 */
const loginValidation = [
    body('role')
        .notEmpty().withMessage('Role is required')
        .isIn(['admin', 'assistant', 'student', 'guest']).withMessage('Invalid role'),

    body('loginCode')
        .notEmpty().withMessage('Login code is required'),

    // School name required for student and guest
    body('schoolName').if(body('role').isIn(['student', 'guest']))
        .notEmpty().withMessage('School name is required for student/guest login'),

    // Validation result handler
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

module.exports = {
    registrationValidation,
    loginValidation
};
