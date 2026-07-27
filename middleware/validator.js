const { body, validationResult } = require('express-validator');

/**
 * Dynamic registration validation based on role
 */
const registrationValidation = [
    body('role')
        .notEmpty().withMessage('Role is required')
        .isIn(['admin', 'student', 'guest', 'super admin']).withMessage('Invalid role'),

    body('loginCode')
        .notEmpty().withMessage('Login code is required')
        .isLength({ min: 4 }).withMessage('Login code must be at least 4 characters'),

    // Phone number is optional. Only validate the format when a value is
    // actually supplied — an empty string is treated as "not provided".
    body('phoneNum')
        .trim()
        .optional({ checkFalsy: true })
        .isMobilePhone('any').withMessage('Invalid phone number'),

    body('dob')
        .optional()
        .isISO8601().withMessage('Date of Birth must be a valid ISO 8601 date'),

    // Admin-specific validation
    body('name').if(body('role').isIn(['admin', 'super admin']))
        .notEmpty().withMessage('Name is required for admin'),

    body('email').if(body('role').isIn(['admin', 'super admin']))
        .notEmpty().withMessage('Email is required for admin')
        .isEmail().withMessage('Invalid email address'),



    // Student-specific validation
    body('firstName').if(body('role').equals('student'))
        .notEmpty().withMessage('First name is required for student'),

    // body('middleName').if(body('role').equals('student'))
    //     .notEmpty().withMessage('Middle name is required for student'),



    body('std').if(body('role').equals('student'))
        .notEmpty().withMessage('STD is required for student'),

    body('medium').if(body('role').equals('student'))
        .notEmpty().withMessage('Medium is required for student'),

    // body('school').if(body('role').equals('student'))
    //     .notEmpty().withMessage('School is required for student'),

    // Guest-specific validation
    body('firstName').if(body('role').equals('guest'))
        .notEmpty().withMessage('First name is required for guest'),

    // body('middleName').if(body('role').equals('guest'))
    //     .notEmpty().withMessage('Middle name is required for guest'),



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
        .optional()
        .isIn(['admin', 'student', 'guest', 'super admin']).withMessage('Invalid role'),

    body('loginCode')
        .notEmpty().withMessage('Login code is required'),



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
