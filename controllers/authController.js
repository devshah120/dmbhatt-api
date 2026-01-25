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

    if (!role) {
        return res.status(400).json({ message: 'Role is required' });
    }

    // Validate role-based file requirements
    if (role === 'assistant') {
        if (!req.files?.aadharFile?.length) {
            return res.status(400).json({ message: 'Aadhar file required for assistant registration' });
        }
    }

    // if (role === 'student' || role === 'guest') {
    //     if (!req.files?.photo?.length) {
    //         return res.status(400).json({ message: 'Photo required for student/guest registration' });
    //     }
    // }

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
    const aadharFiles = req.files?.aadharFile;
    if (!aadharFiles || aadharFiles.length === 0) {
        throw new Error('Aadhar card file is required');
    }

    // Validate file count and types
    if (aadharFiles.length === 1) {
        // Allow PDF or Image
        // Multer filter already checks for allowed types, so we just proceed
    } else if (aadharFiles.length === 2) {
        // Allow only Images if 2 files are uploaded
        const isAllImages = aadharFiles.every(file => ['image/jpeg', 'image/png', 'image/jpg'].includes(file.mimetype));
        if (!isAllImages) {
            throw new Error('If uploading 2 files, both must be images (Front and Back)');
        }
    } else {
        throw new Error('Maximum 2 files allowed for Aadhar card');
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
        aadharFilePath: aadharFiles.map(file => file.path)
    });

    await assistantProfile.save({ session });
};

/**
 * Student Registration
 * Required: firstName, middleName, lastName, phoneNum, std, medium, school, photo, loginCode
 */
const registerStudent = async (req, session) => {
    const { firstName, phoneNum, std, medium, school, loginCode, rollNo } = req.body;

    // Check if photo was uploaded (Optional now)i 
    // const photoFile = req.files?.photo?.[0];
    // if (!photoFile) {
    //     throw new Error('Photo is required for student registration');
    // }

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
        lastName,
        phoneNum,
        loginCodeHash,
        photoPath: req.files?.photo?.[0]?.path || ''
    });

    const savedUser = await user.save({ session });

    // Create student profile
    const studentProfile = new StudentProfile({
        userId: savedUser._id,
        std,
        medium,
        school,
        rollNo
    });

    await studentProfile.save({ session });
};

/**
 * Guest Registration
 * Required: firstName, middleName, lastName, phoneNum, photo, loginCode
 */
const registerGuest = async (req, session) => {
    const { firstName, phoneNum, loginCode, schoolName } = req.body;

    // Check if photo was uploaded
    const photoFile = req.files?.photo?.[0];
    if (!photoFile) {
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
        phoneNum,
        loginCodeHash,
        loginCodeHash,
        photoPath: req.files?.photo?.[0]?.path || ''
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
    const { role, loginCode, phoneNum } = req.body;

    try {
        let user;

        // Common login logic: Find user by role and identifier (phoneNum or loginCode for admin)
        if (role === 'admin') {
            user = await loginAdmin(loginCode);
        } else {
            // For assistant, student, guest - use phoneNum
            if (!phoneNum) {
                return res.status(400).json({ message: 'Phone number is required' });
            }
            user = await loginUserByPhone(role, phoneNum, loginCode);
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
 * Generic Login by Phone (Student, Guest, Assistant)
 */
const loginUserByPhone = async (role, phoneNum, loginCode) => {
    const user = await User.findOne({ role, phoneNum });

    if (!user) {
        throw new Error('User not found');
    }

    const isMatch = await compareLoginCode(loginCode, user.loginCodeHash);

    if (!isMatch) {
        throw new Error('Invalid password/PIN');
    }

    return user;
};

module.exports = {
    register,
    login
};
