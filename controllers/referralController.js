const User = require('../models/User');

// Generate a unique 6-character referral code
const generateReferralCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
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
    try {
        const { referralCode } = req.body;
        const userId = req.user.id;

        if (!referralCode) {
            return res.status(400).json({ message: 'Referral code is required' });
        }

        // Find the referrer by code
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });

        if (!referrer) {
            return res.status(404).json({ message: 'Invalid referral code' });
        }

        // Check if referrer has reached max referrals (5)
        if (referrer.invitedFriends && referrer.invitedFriends.length >= 5) {
            return res.status(400).json({ message: 'Referrer has reached maximum referral limit' });
        }

        // Get current user
        const currentUser = await User.findById(userId);

        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user already used a referral code
        if (currentUser.referredBy) {
            return res.status(400).json({ message: 'You have already used a referral code' });
        }

        // Check if user is trying to refer themselves
        if (referrer._id.toString() === userId) {
            return res.status(400).json({ message: 'You cannot use your own referral code' });
        }

        // Update referrer's invited friends and bonus points
        referrer.invitedFriends.push({
            userId: currentUser._id,
            name: currentUser.firstName,
            joinedAt: new Date()
        });
        referrer.bonusPoints = (referrer.bonusPoints || 0) + 10; // 10 points per referral
        await referrer.save();

        // Update current user's referredBy field
        currentUser.referredBy = referrer._id;
        await currentUser.save();

        res.status(200).json({
            message: 'Referral code applied successfully',
            bonusEarned: 10
        });
    } catch (error) {
        console.error('Error applying referral code:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
