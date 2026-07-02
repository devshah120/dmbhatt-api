const mongoose = require('mongoose');
const User = require('../models/User');
const AdminProfile = require('../models/AdminProfile');
const StudentProfile = require('../models/StudentProfile');
const Session = require('../models/Session');
const { hashLoginCode, compareLoginCode, generateToken, parseAddress } = require('../utils/helpers');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const RedeemCode = require('../models/RedeemCode');
const { sendOTPEmail, sendWelcomeEmail } = require('../utils/emailService');
const fs = require('fs');
const path = require('path');

const getReferralConfig = () => {
    try {
        const configPath = path.join(__dirname, '../data/config/referral.json');
        if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            return {
                pointsPerReferral: data.pointsPerReferral !== undefined ? Number(data.pointsPerReferral) : 50,
                maxReferralsAllowed: data.maxReferralsAllowed !== undefined ? Number(data.maxReferralsAllowed) : 10
            };
        }
    } catch (err) {
        console.error('Error reading referral config:', err);
    }
    return { pointsPerReferral: 50, maxReferralsAllowed: 10 };
};

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

    // Send welcome email if email exists
    if (email) {
        try {
            console.log(`[REGISTRATION_FLOW] Attempting to send welcome email to admin: ${email}`);
            await sendWelcomeEmail(email, name);
            console.log(`[REGISTRATION_FLOW] ✓ Welcome email sent successfully to: ${email}`);
        } catch (error) {
            console.error(`[REGISTRATION_FLOW] ✗ Failed to send welcome email to admin: ${email}`);
            console.error(`[REGISTRATION_FLOW] Error: ${error.message}`);
        }
    } else {
        console.log(`[REGISTRATION_FLOW] ⚠ No email provided for admin registration - welcome email skipped`);
    }
};



/**
 * Student Registration
 * Required: firstName, middleName, phoneNum, std, medium, school, photo, loginCode
 */
const registerStudent = async (req, session) => {
    let appliedRedeemCode = null;
    const { firstName, phoneNum, email, std, medium, board, stream, school, loginCode, rollNo, referralCode, parentPhone, razorpay_payment_id, razorpay_order_id, razorpay_signature, amount, city, state, dob } = req.body;
    console.log(`[DEBUG] Registering student: ${firstName} (${phoneNum}), City: ${city}, State: ${state}, DOB: ${dob}`);

    // Verify Payment unless skipped (for testing or specific cases)
    if (razorpay_payment_id && razorpay_order_id && razorpay_signature) {
        // Get Razorpay secret from database (NotificationConfig)
        const NotificationConfig = require('../models/NotificationConfig');
        let razorpaySecret = null;

        try {
            const config = await NotificationConfig.findOne().session(session);
            if (config && config.razorpayKeySecret) {
                razorpaySecret = config.razorpayKeySecret;
                console.log(`[PAYMENT_VERIFICATION] ✓ Razorpay secret loaded from database (NotificationConfig)`);
            } else {
                console.error('[PAYMENT_VERIFICATION] ✗ NotificationConfig not found or razorpayKeySecret missing');
                // Fallback to environment variable
                razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
                if (razorpaySecret) {
                    console.log(`[PAYMENT_VERIFICATION] ✓ Using RAZORPAY_KEY_SECRET from environment variable`);
                } else {
                    throw new Error('Payment configuration not found in database or environment');
                }
            }
        } catch (err) {
            console.error('[PAYMENT_VERIFICATION] Error fetching config:', err.message);
            throw new Error('Payment verification failed: Could not fetch Razorpay config');
        }

        if (!razorpaySecret) {
            console.error('[PAYMENT_VERIFICATION] ✗ razorpayKeySecret not configured!');
            throw new Error('Payment verification failed: Razorpay secret not configured');
        }

        console.log(`[PAYMENT_VERIFICATION] Verifying payment signature with order_id: ${razorpay_order_id}`);
        const generated_signature = crypto.createHmac('sha256', razorpaySecret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            console.error(`[PAYMENT_VERIFICATION] ✗ Signature mismatch!`);
            console.error(`[PAYMENT_VERIFICATION] Expected: ${generated_signature}`);
            console.error(`[PAYMENT_VERIFICATION] Received: ${razorpay_signature}`);
            throw new Error('Payment verification failed: Invalid signature');
        }
        console.log(`[PAYMENT_VERIFICATION] ✓ Payment signature verified successfully`);
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
    let isNewUser = false; // Track if this is a new user for welcome email

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
        const config = getReferralConfig();
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() }).session(session);
        if (referrer) {
            if (referrer.invitedFriends && referrer.invitedFriends.length >= config.maxReferralsAllowed) {
                throw new Error(`Referrer has reached maximum referral limit of ${config.maxReferralsAllowed}`);
            }
            referrerId = referrer._id;
        } else {
            const adminCode = await RedeemCode.findOne({ code: referralCode.toUpperCase() }).session(session);
            if (adminCode) {
                if (adminCode.isExhausted()) throw new Error('This code has already been used');
                if (adminCode.isExpired()) throw new Error('This code has expired');
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
        if (dob) existingUser.dob = dob;
        
        // Update city and state in address
        if (city || state) {
            if (!existingUser.address) existingUser.address = {};
            if (city) existingUser.address.city = city;
            if (state) existingUser.address.state = state;
        }

        savedUser = await existingUser.save({ session });
    }
    else {
        isNewUser = true; // Mark as new user for welcome email
        const user = new User({
            role: 'student',
            firstName,
            email,
            phoneNum,
            loginCodeHash,
            photoPath: req.files?.photo?.[0]?.path || '',
            referredBy: referrerId,
            isPaid: !!razorpay_payment_id,
            dob: dob || null,
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
        appliedRedeemCode.recordUsage(savedUser._id);
        await appliedRedeemCode.save({ session });
    }

    // Update referrer's invited friends and award bonus points if referral code was used
    if (referrerId) {
        // Calculate milestone and bonus points dynamically
        const referrer = await User.findById(referrerId).session(session);
        const config = getReferralConfig();
        const bonusPoints = config.pointsPerReferral;

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

    // Send invoice email for existing users with payment (subscription/upgrade)
    if (!isNewUser && razorpay_payment_id && email) {
        try {
            console.log(`[REGISTRATION_FLOW] Existing student with payment - sending invoice email to: ${email}`);
            const { generateInvoice } = require('../utils/invoiceGenerator');
            const Invoice = require('../models/Invoice');
            const NotificationConfig = require('../models/NotificationConfig');

            // Ensure amount is a number
            const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
            console.log(`[REGISTRATION_FLOW] Payment amount: ${numAmount}`);

            // Determine if this is an upgrade (existing student with old standard) or initial subscription (new student)
            const studentProfile = await StudentProfile.findOne({ userId: savedUser._id }).session(session);
            const oldStd = studentProfile?.std || null;
            const descriptionText = oldStd
                ? `Standard ${oldStd} to Standard ${std}`
                : `Subscription - Standard ${std}`;

            // Generate invoice PDF
            const invoiceData = await generateInvoice({
                invoiceNumber: `${Date.now()}`,
                date: new Date(),
                studentName: savedUser.firstName,
                studentEmail: savedUser.email,
                studentPhone: savedUser.phoneNum,
                description: descriptionText,
                amount: numAmount,
                paymentId: razorpay_payment_id
            });

            // Save invoice record
            const invoiceRecord = new Invoice({
                userId: savedUser._id,
                paymentType: 'subscription',
                description: descriptionText,
                amount: numAmount,
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id,
                filePath: invoiceData.filepath,
                fileName: invoiceData.filename
            });
            await invoiceRecord.save({ session });

            console.log(`[REGISTRATION_FLOW] Invoice saved with number: ${invoiceRecord.invoiceNumber}`);

            // Send invoice email
            const nodemailer = require('nodemailer');
            let emailHost = process.env.SMTP_HOST;
            let emailPort = process.env.SMTP_PORT;
            let emailUser = process.env.SMTP_USER;
            let emailPassword = process.env.SMTP_PASS;
            let emailFromName = process.env.SMTP_FROM_NAME || 'Padhaku Desk';

            try {
                const config = await NotificationConfig.findOne();
                if (config?.emailHost && config?.emailUser && config?.emailPassword) {
                    emailHost = config.emailHost;
                    emailPort = config.emailPort;
                    emailUser = config.emailUser;
                    emailPassword = config.emailPassword;
                    emailFromName = config.emailFromName || emailFromName;
                }
            } catch (err) {
                console.log(`[REGISTRATION_FLOW] Using environment variables for email config`);
            }

            if (emailHost && emailUser && emailPassword) {
                const transporter = nodemailer.createTransport({
                    host: emailHost,
                    port: parseInt(emailPort) || 587,
                    secure: parseInt(emailPort) === 465,
                    auth: {
                        user: emailUser,
                        pass: emailPassword
                    }
                });

                // Determine header color and message based on subscription type
                const isUpgrade = oldStd !== null;
                const headerColor = isUpgrade ? '#27AE60' : '#0085B3';
                const headerText = isUpgrade ? 'Plan Upgrade Successful!' : 'Subscription Activated!';
                const mainMessage = isUpgrade
                    ? 'Congratulations! Your plan upgrade has been processed successfully. You now have access to all the premium features.'
                    : 'Thank you for subscribing to Padhaku Desk! Your subscription is now active and you can access all premium materials.';

                const mailOptions = {
                    from: `"${emailFromName}" <${emailUser}>`,
                    to: email,
                    subject: `Subscription Confirmation - Invoice #${invoiceRecord.invoiceNumber}`,
                    html: `
                        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background-color: ${headerColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                                <h1 style="margin: 0; font-size: 24px;">Padhaku Desk</h1>
                                <p style="margin: 5px 0 0 0;">${headerText}</p>
                            </div>

                            <div style="padding: 30px; background-color: #f9f9f9; border: 1px solid #ddd;">
                                <p>Dear ${savedUser.firstName},</p>

                                <p>${mainMessage}</p>

                                <div style="background-color: white; border: 2px solid ${headerColor}; padding: 20px; border-radius: 5px; margin: 20px 0;">
                                    <h3 style="color: ${headerColor}; margin-top: 0;">Subscription Details</h3>
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <tr style="border-bottom: 1px solid #eee;">
                                            <td style="padding: 10px 0; font-weight: bold; color: #666;">Standard:</td>
                                            <td style="padding: 10px 0; text-align: right; font-weight: bold; color: ${headerColor};">${std}</td>
                                        </tr>
                                        ${medium ? `
                                        <tr style="border-bottom: 1px solid #eee;">
                                            <td style="padding: 10px 0; font-weight: bold; color: #666;">Medium:</td>
                                            <td style="padding: 10px 0; text-align: right;">${medium}</td>
                                        </tr>
                                        ` : ''}
                                        ${board ? `
                                        <tr style="border-bottom: 1px solid #eee;">
                                            <td style="padding: 10px 0; font-weight: bold; color: #666;">Board:</td>
                                            <td style="padding: 10px 0; text-align: right;">${board}</td>
                                        </tr>
                                        ` : ''}
                                        <tr style="border-bottom: 1px solid #eee;">
                                            <td style="padding: 10px 0; font-weight: bold; color: #666;">Amount Paid:</td>
                                            <td style="padding: 10px 0; text-align: right; font-size: 18px; color: ${headerColor}; font-weight: bold;">₹${numAmount.toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px 0; font-weight: bold; color: #666;">Invoice Number:</td>
                                            <td style="padding: 10px 0; text-align: right;">${invoiceRecord.invoiceNumber}</td>
                                        </tr>
                                    </table>
                                </div>

                                <div style="background-color: ${isUpgrade ? '#e8f8f0' : '#e8f4f8'}; border-left: 4px solid ${headerColor}; padding: 15px; border-radius: 3px; margin: 20px 0;">
                                    <p style="margin: 0; color: ${headerColor};">
                                        <strong>📎 Your invoice is attached:</strong> Please keep it for your records and reference.
                                    </p>
                                </div>

                                <p style="margin-top: 20px; color: #666;">If you have any questions or need assistance, feel free to reach out to our support team.</p>

                                <p style="margin-top: 30px; color: #666;">
                                    Best regards,<br>
                                    <strong style="color: ${headerColor};">Padhaku Desk Team</strong>
                                </p>
                            </div>

                            <div style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #999; border-radius: 0 0 8px 8px;">
                                <p style="margin: 0;">© 2024 Padhaku Desk. All rights reserved.</p>
                            </div>
                        </div>
                    `,
                    attachments: [
                        {
                            filename: invoiceData.filename,
                            path: invoiceData.filepath
                        }
                    ]
                };

                await transporter.sendMail(mailOptions);
                console.log(`[REGISTRATION_FLOW] ✓ Invoice email sent successfully to: ${email}`);

                invoiceRecord.emailSent = true;
                invoiceRecord.emailSentAt = new Date();
                await invoiceRecord.save({ session });
            } else {
                console.error(`[REGISTRATION_FLOW] SMTP not configured - invoice email not sent`);
            }
        } catch (error) {
            console.error(`[REGISTRATION_FLOW] ✗ Failed to send invoice email: ${error.message}`);
        }
    }

    // Send welcome email only for NEW users (not for existing users making a payment upgrade)
    if (isNewUser && email) {
        try {
            console.log(`[REGISTRATION_FLOW] Attempting to send welcome email to NEW student: ${email}`);
            await sendWelcomeEmail(email, firstName);
            console.log(`[REGISTRATION_FLOW] ✓ Welcome email sent successfully to: ${email}`);
        } catch (error) {
            console.error(`[REGISTRATION_FLOW] ✗ Failed to send welcome email to student: ${email}`);
            console.error(`[REGISTRATION_FLOW] Error: ${error.message}`);
        }
    } else if (!isNewUser && email && !razorpay_payment_id) {
        console.log(`[REGISTRATION_FLOW] ⚠ Existing student (${email}) without payment - no email sent`);
    } else if (!isNewUser && email && razorpay_payment_id) {
        console.log(`[REGISTRATION_FLOW] ✓ Invoice email already sent for existing student`);
    } else {
        console.log(`[REGISTRATION_FLOW] ⚠ No email provided for student registration - no email sent`);
    }
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
        const config = getReferralConfig();
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() }).session(session);
        if (referrer) {
            if (referrer.invitedFriends && referrer.invitedFriends.length >= config.maxReferralsAllowed) {
                throw new Error(`Referrer has reached maximum referral limit of ${config.maxReferralsAllowed}`);
            }
            referrerId = referrer._id;
        } else {
            const adminCode = await RedeemCode.findOne({ code: referralCode.toUpperCase() }).session(session);
            if (adminCode) {
                if (adminCode.isExhausted()) throw new Error('This code has already been used');
                if (adminCode.isExpired()) throw new Error('This code has expired');
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
        appliedRedeemCode.recordUsage(savedUser._id);
        await appliedRedeemCode.save({ session });
    }

    // Update referrer's invited friends and award bonus points if referral code was used
    if (referrerId) {
        // Calculate milestone and bonus points dynamically
        const referrer = await User.findById(referrerId).session(session);
        const config = getReferralConfig();
        const bonusPoints = config.pointsPerReferral;

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

