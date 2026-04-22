const mongoose = require('mongoose');
const User = require('../models/User');
const AdminProfile = require('../models/AdminProfile');
const StudentProfile = require('../models/StudentProfile');
const Session = require('../models/Session');
const { hashLoginCode, compareLoginCode, generateToken, parseAddress } = require('../utils/helpers');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const RedeemCode = require('../models/RedeemCode');
const { sendOTPEmail } = require('../utils/emailService');

/**
 * Universal Registration Handler
 * Handles registration for all roles: admin, assistant, student, guest
 */
const register = async (req, res) => {
    const { role, phoneNum, firstName } = req.body;
    console.log(`[DEBUG] Incoming Registration Request. Role: '${role}', Phone: '${phoneNum}', Name: '${firstName}'`);

    if (!role) {
        return res.status(400).json({ message: 'Role is required' });
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

            case 'student':
                await registerStudent(req, session);
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

    // Create or update admin profile
    await AdminProfile.findOneAndUpdate(
        { userId: savedUser._id },
        { name },
        { upsert: true, session }
    );
};



/**
 * Student Registration
 * Required: firstName, middleName, phoneNum, std, medium, school, photo, loginCode
 */
const registerStudent = async (req, session) => {
    let appliedRedeemCode = null;
    const { firstName, phoneNum, email, std, medium, board, stream, school, loginCode, rollNo, referralCode, parentPhone, razorpay_payment_id, razorpay_order_id, razorpay_signature, amount, city, state } = req.body;
    console.log(`[DEBUG] Registering student: ${firstName} (${phoneNum}), City: ${city}, State: ${state}`);

    // Verify Payment unless skipped (for testing or specific cases)
    if (razorpay_payment_id && razorpay_order_id && razorpay_signature) {
        const secret = 'IHUC5CwHWJwCgVIuvG7ZAti6';
        const generated_signature = crypto.createHmac('sha256', secret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            throw new Error('Payment verification failed: Invalid signature');
        }
    } else {
        console.log('[DEBUG] Registration proceeding without payment details');
    }

    // Check if user exists
    console.log(`[DEBUG] Registering student. Phone: '${phoneNum}', Type: ${typeof phoneNum}`);

    if (!phoneNum) {
        throw new Error('Phone number is missing or undefined');
    }

    const existingUser = await User.findOne({
        $or: [
            { phoneNum },
            ...(email ? [{ email }] : [])
        ]
    }).session(session);

    let savedUser;

    if (existingUser) {
        // Check if account was previously deleted
        if (existingUser.deletedAt) {
            throw new Error('This account was previously deleted. Registration is not allowed with this phone number.');
        }

        // 1. Check if email is already taken by ANOTHER user
        if (email && existingUser.email === email && existingUser.phoneNum !== phoneNum) {
            throw new Error('User with this email already exists');
        }

        // 2. Handle phone match
        if (existingUser.phoneNum === phoneNum) {
            if (existingUser.role === 'student') {
                console.log(`[DEBUG] Existing student found: ${existingUser.phoneNum}. blocking re-registration.`);
                // Strictly block re-registration if they are already a student (even if unpaid)
                // Unless they are providing a NEW payment (upgrade or renewal)
                if (!razorpay_payment_id) {
                    throw new Error('User with this phone number already exists');
                }
                // Allow update ONLY if payment is provided
                savedUser = existingUser;
            } else if (existingUser.role !== 'guest') {
                console.log(`[DEBUG] User found: ${existingUser.phoneNum}, ID: ${existingUser._id}, Role: ${existingUser.role}`);
                throw new Error('User with this phone number already exists');
            } else {
                console.log(`[DEBUG] Upgrading guest user to student: ${existingUser.phoneNum}`);
                savedUser = existingUser;
            }
        }
    }

    // Hash login code
    const loginCodeHash = await hashLoginCode(loginCode);

    // Handle referral code if provided
    let referrerId = null;
    if (referralCode) {
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() }).session(session);
        if (referrer) {
            if (referrer.invitedFriends && referrer.invitedFriends.length >= 5) {
                throw new Error('Referrer has reached maximum referral limit');
            }
            referrerId = referrer._id;
        } else {
            const adminCode = await RedeemCode.findOne({ code: referralCode.toUpperCase() }).session(session);
            if (adminCode) {
                if (adminCode.used) throw new Error('This code has already been used');
                if (adminCode.std && adminCode.std !== std) throw new Error(`Code only valid for standard ${adminCode.std}`);
                if (adminCode.board && adminCode.board !== (board || 'GSEB')) throw new Error(`Code only valid for ${adminCode.board} board`);
                appliedRedeemCode = adminCode;
            }
        }
    }

    // Create or update user
    if (existingUser && (existingUser.role === 'guest' || existingUser.role === 'student')) {
        existingUser.role = 'student';
        if (firstName) existingUser.firstName = firstName;
        if (email) existingUser.email = email;
        if (loginCode) existingUser.loginCodeHash = loginCodeHash;
        existingUser.photoPath = req.files?.photo?.[0]?.path || existingUser.photoPath;
        if (referrerId) existingUser.referredBy = referrerId;
        if (razorpay_payment_id) existingUser.isPaid = true;
        
        // Update city and state in address
        if (city || state) {
            if (!existingUser.address) existingUser.address = {};
            if (city) existingUser.address.city = city;
            if (state) existingUser.address.state = state;
        }

        savedUser = await existingUser.save({ session });
    }
    else {
        const user = new User({
            role: 'student',
            firstName,
            email,
            phoneNum,
            loginCodeHash,
            photoPath: req.files?.photo?.[0]?.path || '',
            referredBy: referrerId,
            isPaid: !!razorpay_payment_id,
            address: {
                city: city || '',
                state: state || ''
            }
        });
        savedUser = await user.save({ session });
    }

    // Save Payment Record
    if (razorpay_payment_id) {
        const payment = new Payment({
            userId: savedUser._id,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            amount: amount,
            status: 'captured'
        });
        await payment.save({ session });
    }

    // Mark Admin Redeem Code as used if applied
    if (appliedRedeemCode) {
        appliedRedeemCode.used = true;
        appliedRedeemCode.usedBy = savedUser._id;
        appliedRedeemCode.usedAt = new Date();
        await appliedRedeemCode.save({ session });
    }

    // Update referrer's invited friends and award bonus points if referral code was used
    if (referrerId) {
        // Calculate milestone and bonus points
        const referrer = await User.findById(referrerId).session(session);
        const milestoneNumber = (referrer.invitedFriends?.length || 0) + 1; // 1-5
        const bonusPoints = milestoneNumber * 500; // 500, 1000, 1500, 2000, 2500 points

        await User.findByIdAndUpdate(
            referrerId,
            {
                $push: {
                    invitedFriends: {
                        userId: savedUser._id,
                        name: firstName,
                        joinedAt: new Date()
                    }
                },
                $inc: { bonusPoints: bonusPoints }
            },
            { session }
        );
    }

    // Create or update student profile
    await StudentProfile.findOneAndUpdate(
        { userId: savedUser._id },
        {
            std,
            medium,
            board: board || 'GSEB',
            stream: stream || 'None',
            school,
            rollNo,
            parentPhone
        },
        { upsert: true, session }
    );
};

/**
 * Guest Registration
 * Required: firstName, middleName, phoneNum, photo, loginCode
 */
const registerGuest = async (req, session) => {
    let appliedRedeemCode = null;
    const { firstName, phoneNum, email, loginCode, board, stream, schoolName, referralCode, city, state } = req.body;

    // Check if photo was uploaded
    const photoFile = req.files?.photo?.[0];
    // Photo is NOT required for guest registration


    // Check if user exists (by phone or email)
    const existingUser = await User.findOne({
        $or: [
            { phoneNum },
            ...(email ? [{ email }] : [])
        ]
    }).session(session);

    if (existingUser) {
        if (email && existingUser.email === email) {
            throw new Error('User with this email already exists');
        }
        throw new Error('User with this phone number already exists');
    }

    // Hash login code
    const loginCodeHash = await hashLoginCode(loginCode);

    // Handle referral code if provided
    let referrerId = null;
    if (referralCode) {
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() }).session(session);
        if (referrer) {
            if (referrer.invitedFriends && referrer.invitedFriends.length >= 5) {
                throw new Error('Referrer has reached maximum referral limit');
            }
            referrerId = referrer._id;
        } else {
            const adminCode = await RedeemCode.findOne({ code: referralCode.toUpperCase() }).session(session);
            if (adminCode) {
                if (adminCode.used) throw new Error('This code has already been used');
                if (adminCode.std && adminCode.std !== std) throw new Error(`Code only valid for standard ${adminCode.std}`);
                if (adminCode.board && adminCode.board !== (board || 'GSEB')) throw new Error(`Code only valid for ${adminCode.board} board`);
                appliedRedeemCode = adminCode;
            }
        }
    }

    // Create user
    const user = new User({
        role: 'guest',
        firstName,
        email,
        phoneNum,
        loginCodeHash,
        photoPath: req.files?.photo?.[0]?.path || '',
        referredBy: referrerId,
        address: {
            city: city || '',
            state: state || ''
        }
    });

    const savedUser = await user.save({ session });

    if (appliedRedeemCode) {
        appliedRedeemCode.used = true;
        appliedRedeemCode.usedBy = savedUser._id;
        appliedRedeemCode.usedAt = new Date();
        await appliedRedeemCode.save({ session });
    }

    // Update referrer's invited friends and award bonus points if referral code was used
    if (referrerId) {
        // Calculate milestone and bonus points
        const referrer = await User.findById(referrerId).session(session);
        const milestoneNumber = (referrer.invitedFriends?.length || 0) + 1; // 1-5
        const bonusPoints = milestoneNumber * 500; // 500, 1000, 1500, 2000, 2500 points

        await User.findByIdAndUpdate(
            referrerId,
            {
                $push: {
                    invitedFriends: {
                        userId: savedUser._id,
                        name: firstName,
                        joinedAt: new Date()
                    }
                },
                $inc: { bonusPoints: bonusPoints }
            },
            { session }
        );
    }

    // Create or update guest profile
    await GuestProfile.findOneAndUpdate(
        { userId: savedUser._id },
        {
            board: board || 'GSEB',
            stream: stream || 'None',
            schoolName: schoolName || 'Not specified'
        },
        { upsert: true, session }
    );
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

        // Create Session
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // Match JWT expiry (7 days)

        const session = new Session({
            userId: user._id,
            token,
            deviceId: req.body.deviceId || 'unknown',
            expiresAt
        });
        await session.save();

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
            message: err.message || 'Login failed'
        });
    }
};



/**
 * Forgot Password - Send OTP
 */
const forgetPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found with this email address' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Save OTP to user
        user.resetPasswordOTP = otp;
        user.resetPasswordExpires = otpExpiry;
        await user.save();

        // Send Email
        await sendOTPEmail(user.email, otp, user.firstName);

        res.status(200).json({ message: 'OTP sent successfully to your registered email' });

    } catch (err) {
        console.error('Forget Password Error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

/**
 * Verify OTP
 */
const verifyOtp = async (req, res) => {
    const { email, otp } = req.body;

    try {
        const user = await User.findOne({ 
            email,
            resetPasswordOTP: otp,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        res.status(200).json({ message: 'OTP verified successfully' });
    } catch (err) {
        console.error('Verify OTP Error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

/**
 * Reset Password
 */
const resetPassword = async (req, res) => {
    const { email, newPassword } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Hash new password (loginCode)
        const loginCodeHash = await hashLoginCode(newPassword);

        user.loginCodeHash = loginCodeHash;
        user.resetPasswordOTP = null;
        user.resetPasswordExpires = null;
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

    // Block login for deleted accounts
    if (user.deletedAt) {
        throw new Error('This account has been deleted. Please contact support.');
    }

    // Enforce role check if role is provided
    if (role && user.role !== role) {
        // Special Case: super admin can log in as admin or super admin
        const isSuperAdminLogin = (role === 'admin' && user.role === 'super admin');
        if (!isSuperAdminLogin) {
            throw new Error('wrong mobile number or password');
        }
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

/**
 * Logout - Invalidate current session
 */
const logout = async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        
        // Find session and mark as inactive
        const session = await Session.findOneAndUpdate(
            { token },
            { isActive: false },
            { new: true }
        );

        res.status(200).json({ message: 'Logged out successfully' });

    } catch (err) {
        console.error('Logout Error:', err);
        res.status(500).json({ message: 'Logout failed', error: err.message });
    }
};

module.exports = {
    register,
    login,
    forgetPassword,
    verifyOtp,
    resetPassword,
    updatePassword,
    logout
};

