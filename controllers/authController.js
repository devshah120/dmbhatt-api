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
 * Required: firstName, middleName, phoneNum, std, medium, school, photo, loginCode
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
 * Required: firstName, middleName, phoneNum, photo, loginCode
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

        // Unified login logic: Require phoneNum for all roles
        if (!phoneNum) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        // Find user by phone number ONLY (ignores role sent by client for lookup)
        user = await loginUserByPhone(role, phoneNum, loginCode);

        // Generate JWT token
        const token = generateToken(user._id, user.role);

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                role: user.role,
                firstName: user.firstName,
                // lastName: user.lastName, // Removed as per request
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
 * Forgot Password - Send OTP
 */
const forgetPassword = async (req, res) => {
    const { phoneNum } = req.body;

    try {
        const user = await User.findOne({ phoneNum });
        if (!user) {
            return res.status(404).json({ message: 'User not found with this phone number' });
        }

        // In a real app, generate and send OTP here.
        // For now, we imply static OTP '1111' will be used.
        res.status(200).json({ message: 'OTP sent successfully to your phone number' });

    } catch (err) {
        console.error('Forget Password Error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

/**
 * Verify OTP
 */
const verifyOtp = async (req, res) => {
    const { phoneNum, otp } = req.body;

    try {
        // Validate static OTP
        if (otp === '1111') {
            return res.status(200).json({ message: 'OTP verified successfully' });
        } else {
            return res.status(400).json({ message: 'Invalid OTP' });
        }
    } catch (err) {
        console.error('Verify OTP Error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

/**
 * Reset Password
 */
const resetPassword = async (req, res) => {
    const { phoneNum, newPassword } = req.body;

    try {
        const user = await User.findOne({ phoneNum });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Hash new password (loginCode)
        const loginCodeHash = await hashLoginCode(newPassword);

        user.loginCodeHash = loginCodeHash;
        await user.save();

        res.status(200).json({ message: 'Password reset successfully' });

    } catch (err) {
        console.error('Reset Password Error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

/**
 * Generic Login by Phone (Student, Guest, Assistant)
 */
const loginUserByPhone = async (role, phoneNum, loginCode) => {
    // Normal DB Lookup
    const user = await User.findOne({ phoneNum });

    if (!user) {
        throw new Error('User not found');
    }

    // Enforce role check if role is provided
    if (role && user.role !== role) {
        throw new Error('wrong mobile number or password');
    }

    const isMatch = await compareLoginCode(loginCode, user.loginCodeHash);

    if (!isMatch) {
        throw new Error('Invalid password/PIN');
    }

    return user;
};

/**
 * Update Password
 */
const updatePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    // const user = req.user; // Set by protect middleware but lacks password hash

    try {
        // Re-fetch user to get the password hash
        const user = await User.findById(req.user._id);

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: 'Old and new passwords are required' });
        }

        // Verify old password
        const isMatch = await compareLoginCode(oldPassword, user.loginCodeHash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect old password' });
        }

        // Hash new password
        const loginCodeHash = await hashLoginCode(newPassword);

        // Update user
        user.loginCodeHash = loginCodeHash;
        await user.save();

        res.status(200).json({ message: 'Password updated successfully' });

    } catch (err) {
        console.error('Update Password Error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

module.exports = {
    register,
    login,
    forgetPassword,
    verifyOtp,
    resetPassword,
    updatePassword
};

