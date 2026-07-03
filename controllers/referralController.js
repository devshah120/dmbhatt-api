const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const { createRequestLogger } = require('../utils/logger');

const getReferralConfig = () => {
    try {
        const configPath = path.join(__dirname, '../config/referral.json');
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

// Generate a unique 6-character referral code
const generateReferralCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};

// POST /api/referral/validate - Validate a referral code (public endpoint)
exports.validateReferralCode = async (req, res) => {
    const log = createRequestLogger('referral', {
        endpoint: 'POST /referral/validate',
        req,
        meta: { flow: 'referral-validate', referralCode: req.body?.referralCode || null }
    });
    try {
        const { referralCode } = req.body;

        if (!referralCode) {
            log.step('Validate input', { success: false, error: 'Referral code missing' });
            log.finish('VALIDATION_FAILED');
            return res.status(400).json({ message: 'Referral code is required' });
        }

        // Find the referrer by code
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() }).select('firstName referralCode invitedFriends');

        if (!referrer) {
            log.step('Lookup referrer', { success: false, error: 'Invalid referral code' });
            log.finish('INVALID_CODE');
            return res.status(404).json({ message: 'Invalid referral code' });
        }

        const config = getReferralConfig();

        // Check if referrer has reached max referrals
        if (referrer.invitedFriends && referrer.invitedFriends.length >= config.maxReferralsAllowed) {
            log.step('Check referral limit', { success: false, referrerId: referrer._id, used: referrer.invitedFriends.length, max: config.maxReferralsAllowed });
            log.finish('LIMIT_REACHED');
            return res.status(400).json({ message: `Referrer has reached maximum referral limit of ${config.maxReferralsAllowed}` });
        }

        // Calculate discount / points
        const milestoneNumber = (referrer.invitedFriends?.length || 0) + 1;
        const discountAmount = config.pointsPerReferral;

        log.step('Referral code valid', { success: true, referrerId: referrer._id, referrerName: referrer.firstName, discountAmount, milestone: milestoneNumber });
        log.finish('SUCCESS');

        res.status(200).json({
            valid: true,
            referrerName: referrer.firstName,
            discountAmount: discountAmount,
            milestone: milestoneNumber,
            message: `Valid referral code from ${referrer.firstName}. You'll get ${discountAmount} points/discount!`
        });
    } catch (error) {
        console.error('Error validating referral code:', error);
        log.fail('EXCEPTION', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET /api/referral/data - Get user's referral data
exports.getReferralData = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId).select('referralCode bonusPoints invitedFriends');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // If user doesn't have a referral code yet, generate one
        if (!user.referralCode) {
            let code;
            let isUnique = false;

            // Keep generating until we get a unique code
            while (!isUnique) {
                code = generateReferralCode();
                const existing = await User.findOne({ referralCode: code });
                if (!existing) {
                    isUnique = true;
                }
            }

            user.referralCode = code;
            await user.save();
        }

        res.status(200).json({
            referralCode: user.referralCode,
            bonusPoints: user.bonusPoints || 0,
            invitedFriends: user.invitedFriends || []
        });
    } catch (error) {
        console.error('Error fetching referral data:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// POST /api/referral/apply - Apply a referral code during registration
exports.applyReferralCode = async (req, res) => {
    const log = createRequestLogger('referral', {
        endpoint: 'POST /referral/apply',
        req,
        meta: { flow: 'referral-apply', referralCode: req.body?.referralCode || null }
    });
    try {
        const { referralCode } = req.body;
        const userId = req.user.id;

        if (!referralCode) {
            log.step('Validate input', { success: false, error: 'Referral code missing' });
            log.finish('VALIDATION_FAILED');
            return res.status(400).json({ message: 'Referral code is required' });
        }

        // Find the referrer by code
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });

        if (!referrer) {
            log.step('Lookup referrer', { success: false, error: 'Invalid referral code' });
            log.finish('INVALID_CODE');
            return res.status(404).json({ message: 'Invalid referral code' });
        }

        const config = getReferralConfig();

        // Check if referrer has reached max referrals
        if (referrer.invitedFriends && referrer.invitedFriends.length >= config.maxReferralsAllowed) {
            log.step('Check referral limit', { success: false, referrerId: referrer._id, used: referrer.invitedFriends.length, max: config.maxReferralsAllowed });
            log.finish('LIMIT_REACHED');
            return res.status(400).json({ message: `Referrer has reached maximum referral limit of ${config.maxReferralsAllowed}` });
        }

        // Get current user
        const currentUser = await User.findById(userId);

        if (!currentUser) {
            log.step('Fetch current user', { success: false, error: 'User not found' });
            log.finish('USER_NOT_FOUND');
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user already used a referral code
        if (currentUser.referredBy) {
            log.step('Check already referred', { success: false, error: 'User already used a referral code', referredBy: currentUser.referredBy });
            log.finish('ALREADY_REFERRED');
            return res.status(400).json({ message: 'You have already used a referral code' });
        }

        // Check if user is trying to refer themselves
        if (referrer._id.toString() === userId) {
            log.step('Check self-referral', { success: false, error: 'User attempted self-referral' });
            log.finish('SELF_REFERRAL');
            return res.status(400).json({ message: 'You cannot use your own referral code' });
        }

        // Update referrer's invited friends and add bonus points
        referrer.invitedFriends.push({
            userId: currentUser._id,
            name: currentUser.firstName,
            joinedAt: new Date()
        });
        referrer.bonusPoints = (referrer.bonusPoints || 0) + config.pointsPerReferral;
        await referrer.save();

        // Update current user's referredBy field
        currentUser.referredBy = referrer._id;
        await currentUser.save();

        log.step('Referral code applied', {
            success: true,
            referrerId: referrer._id,
            referrerName: referrer.firstName,
            pointsAwarded: config.pointsPerReferral,
            referrerNewBalance: referrer.bonusPoints
        });
        log.finish('SUCCESS');

        res.status(200).json({
            message: 'Referral code applied successfully'
        });
    } catch (error) {
        console.error('Error applying referral code:', error);
        log.fail('EXCEPTION', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
