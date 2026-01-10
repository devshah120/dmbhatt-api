const mongoose = require('mongoose');
const User = require('../models/User');
const AdminProfile = require('../models/AdminProfile');
const AssistantProfile = require('../models/AssistantProfile');
const StudentProfile = require('../models/StudentProfile');
const GuestProfile = require('../models/GuestProfile');
const { hashLoginCode, compareLoginCode, generateToken, parseAddress } = require('../utils/helpers');

/**
 * Universal Registration Handler
 * Handles registration for all roles: admin, assistant, student, guest
 */
const register = async (req, res) => {
    const { role } = req.body;
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        // Role-specific registration logic
        switch (role) {
            case 'admin':
                await registerAdmin(req, session);
                break;
            case 'assistant':
                await registerAssistant(req, session);
                break;
            case 'student':
                await registerStudent(req, session);
                break;
            case 'guest':
                await registerGuest(req, session);
                break;
            default:
                await session.abortTransaction();
                return res.status(400).json({ message: 'Invalid role specified' });
        }

        await session.commitTransaction();
        res.status(201).json({ message: 'User registered successfully' });

    } catch (err) {
        await session.abortTransaction();
        console.error('Registration Error:', err);
        res.status(500).json({
            message: 'Registration failed',
            error: err.message
        });
    } finally {
        session.endSession();
    }
};

/**
 * Admin Registration
 * Required: name, email, phoneNum, loginCode
 */
const registerAdmin = async (req, session) => {
    const { name, email, phoneNum, loginCode } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({
        $or: [{ email }, { phoneNum }]
    }).session(session);

    if (existingUser) {
        throw new Error('User with this email or phone number already exists');
    }

    // Hash login code
    const loginCodeHash = await hashLoginCode(loginCode);

    // Create user
    const user = new User({
        role: 'admin',
        firstName: name,
        email,
        phoneNum,
        loginCodeHash
    });

    const savedUser = await user.save({ session });

    // Create admin profile
    const adminProfile = new AdminProfile({
        userId: savedUser._id,
        name
    });

    await adminProfile.save({ session });
};

/**
 * Assistant Registration
 * Required: name, email, phoneNum, aadharNum, aadharFile, address, loginCode
 */
const registerAssistant = async (req, session) => {
    const { name, email, phoneNum, aadharNum, address, loginCode } = req.body;

    // Check if aadhar file was uploaded
    if (!req.file) {
        throw new Error('Aadhar card file is required');
    }

    // Check if user exists
    const existingUser = await User.findOne({
        $or: [{ email }, { phoneNum }]
    }).session(session);

    if (existingUser) {
        throw new Error('User with this email or phone number already exists');
    }

    // Hash login code
    const loginCodeHash = await hashLoginCode(loginCode);

    // Parse address
    const addressObj = parseAddress(address);

    // Create user
    const user = new User({
        role: 'assistant',
        firstName: name,
        email,
        phoneNum,
        loginCodeHash,
        address: addressObj
    });

    const savedUser = await user.save({ session });

    // Create assistant profile
    const assistantProfile = new AssistantProfile({
        userId: savedUser._id,
        aadharNum,
        aadharFilePath: req.file.path
    });

    await assistantProfile.save({ session });
};

/**
 * Student Registration
 * Required: firstName, middleName, lastName, phoneNum, std, medium, school, photo, loginCode
 */
const registerStudent = async (req, session) => {
    const { firstName, middleName, lastName, phoneNum, std, medium, school, loginCode } = req.body;

    // Check if photo was uploaded
    if (!req.file) {
        throw new Error('Photo is required for student registration');
    }

    // Check if user exists
    const existingUser = await User.findOne({ phoneNum }).session(session);

    if (existingUser) {
        throw new Error('User with this phone number already exists');
    }

    // Hash login code
    const loginCodeHash = await hashLoginCode(loginCode);

    // Create user
    const user = new User({
        role: 'student',
        firstName,
        middleName,
        lastName,
        phoneNum,
        loginCodeHash,
        photoPath: req.file.path
    });

    const savedUser = await user.save({ session });

    // Create student profile
    const studentProfile = new StudentProfile({
        userId: savedUser._id,
        std,
        medium,
        school
    });

    await studentProfile.save({ session });
};

/**
 * Guest Registration
 * Required: firstName, middleName, lastName, phoneNum, photo, loginCode
 */
const registerGuest = async (req, session) => {
    const { firstName, middleName, lastName, phoneNum, loginCode, schoolName } = req.body;

    // Check if photo was uploaded
    if (!req.file) {
        throw new Error('Photo is required for guest registration');
    }

    // Check if user exists
    const existingUser = await User.findOne({ phoneNum }).session(session);

    if (existingUser) {
        throw new Error('User with this phone number already exists');
    }

    // Hash login code
    const loginCodeHash = await hashLoginCode(loginCode);

    // Create user
    const user = new User({
        role: 'guest',
        firstName,
        middleName,
        lastName,
        phoneNum,
        loginCodeHash,
        photoPath: req.file.path
    });

    const savedUser = await user.save({ session });

    // Create guest profile
    const guestProfile = new GuestProfile({
        userId: savedUser._id,
        schoolName: schoolName || 'Not specified'
    });

    await guestProfile.save({ session });
};

/**
 * Universal Login Handler
 * Handles login for all roles: admin, assistant, student, guest
 */
const login = async (req, res) => {
    const { role, loginCode, schoolName } = req.body;

    try {
        let user;

        // Role-specific login logic
        switch (role) {
            case 'admin':
                user = await loginAdmin(loginCode);
                break;
            case 'assistant':
                user = await loginAssistant(loginCode);
                break;
            case 'student':
                user = await loginStudent(loginCode, schoolName, req.file);
                break;
            case 'guest':
                user = await loginGuest(loginCode, schoolName, req.file);
                break;
            default:
                return res.status(400).json({ message: 'Invalid role specified' });
        }

        // Generate JWT token
        const token = generateToken(user._id, user.role);

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                role: user.role,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phoneNum: user.phoneNum
            }
        });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(401).json({
            message: 'Login failed',
            error: err.message
        });
    }
};

/**
 * Admin Login
 * Required: loginCode
 */
const loginAdmin = async (loginCode) => {
    const user = await User.findOne({ role: 'admin' });

    if (!user) {
        throw new Error('Admin user not found');
    }

    const isMatch = await compareLoginCode(loginCode, user.loginCodeHash);

    if (!isMatch) {
        throw new Error('Invalid login code');
    }

    return user;
};

/**
 * Assistant Login
 * Required: loginCode
 */
const loginAssistant = async (loginCode) => {
    // For assistant, we need to find by login code since there can be multiple assistants
    // We'll need phone number or email for proper identification
    throw new Error('Assistant login requires phone number or email for identification');
};

/**
 * Student Login
 * Required: schoolName, loginCode, photo
 */
const loginStudent = async (loginCode, schoolName, photoFile) => {
    if (!schoolName) {
        throw new Error('School name is required for student login');
    }

    if (!photoFile) {
        throw new Error('Photo is required for student login verification');
    }

    // Find student by school name
    const studentProfile = await StudentProfile.findOne({ school: schoolName });

    if (!studentProfile) {
        throw new Error('Student not found for this school');
    }

    const user = await User.findById(studentProfile.userId);

    if (!user) {
        throw new Error('User not found');
    }

    const isMatch = await compareLoginCode(loginCode, user.loginCodeHash);

    if (!isMatch) {
        throw new Error('Invalid login code');
    }

    // TODO: Implement photo verification logic here
    // For now, just accepting the photo upload

    return user;
};

/**
 * Guest Login
 * Required: schoolName, loginCode, photo
 */
const loginGuest = async (loginCode, schoolName, photoFile) => {
    if (!schoolName) {
        throw new Error('School name is required for guest login');
    }

    if (!photoFile) {
        throw new Error('Photo is required for guest login verification');
    }

    // Find guest by school name
    const guestProfile = await GuestProfile.findOne({ schoolName });

    if (!guestProfile) {
        throw new Error('Guest not found for this school');
    }

    const user = await User.findById(guestProfile.userId);

    if (!user) {
        throw new Error('User not found');
    }

    const isMatch = await compareLoginCode(loginCode, user.loginCodeHash);

    if (!isMatch) {
        throw new Error('Invalid login code');
    }

    // TODO: Implement photo verification logic here
    // For now, just accepting the photo upload

    return user;
};

module.exports = {
    register,
    login
};
