const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const GuestProfile = require('../models/GuestProfile');
const AssistantProfile = require('../models/AssistantProfile');
const AdminProfile = require('../models/AdminProfile');

/**
 * Get User Profile
 * @route GET /api/profile
 * @access Private
 */
const getProfile = async (req, res) => {
    try {
        const user = req.user;
        let profile = null;

        // Fetch profile based on role
        if (user.role === 'student') {
            profile = await StudentProfile.findOne({ userId: user._id });
        } else if (user.role === 'guest') {
            profile = await GuestProfile.findOne({ userId: user._id });
        } else if (user.role === 'assistant') {
            profile = await AssistantProfile.findOne({ userId: user._id });
        } else if (user.role === 'admin') {
            profile = await AdminProfile.findOne({ userId: user._id });
        }

        if (!profile) {
            // It's possible to have a user without a profile if registration failed halfway or manual DB entry
            // But ideally shouldn't happen. Return basic user info + empty profile or null
            // return res.status(404).json({ message: 'Profile not found' });
        }

        res.status(200).json({
            user: {
                firstName: user.firstName,
                middleName: user.middleName,
                lastName: user.lastName,
                email: user.email,
                phoneNum: user.phoneNum,
                photoPath: user.photoPath,
                role: user.role
            },
            profile: profile || {}
        });

    } catch (error) {
        console.error('Get Profile Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

/**
 * Update User Profile
 * @route PUT /api/profile
 * @access Private
 */
const updateProfile = async (req, res) => {
    try {
        const user = req.user;
        const { firstName, phoneNum, school, city, std, medium, schoolName } = req.body; // Add other fields as needed

        // Update User basic fields
        if (firstName) user.firstName = firstName;
        if (phoneNum) user.phoneNum = phoneNum;

        await user.save();

        let profile = null;

        if (user.role === 'student') {
            profile = await StudentProfile.findOne({ userId: user._id });
            if (profile) {
                if (std) profile.std = std;
                if (medium) profile.medium = medium;
                if (school) profile.school = school;
                await profile.save();
            }
        } else if (user.role === 'guest') {
            // Guest usually just updates schoolName if tracked
            profile = await GuestProfile.findOne({ userId: user._id });
            if (profile) {
                if (schoolName) profile.schoolName = schoolName;
                await profile.save();
            }
        }
        // Add other roles if needed

        res.status(200).json({ message: 'Profile updated successfully', user, profile });

    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
}

module.exports = {
    getProfile,
    updateProfile
};
