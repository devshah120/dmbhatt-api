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
                role: user.role,
                address: user.address, // Include address for city
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
        const { firstName, phoneNum, email, school, city, std, medium, schoolName, parentPhone } = req.body;

        // Update User basic fields
        if (firstName) user.firstName = firstName;
        if (phoneNum) user.phoneNum = phoneNum;
        if (email) user.email = email;

        // Handle Photo Upload
        if (req.files && req.files['photo'] && req.files['photo'][0]) {
            user.photoPath = req.files['photo'][0].path;
        }

        // Update Address (City)
        if (city) {
            user.address = user.address || {};
            user.address.city = city;
        }

        await user.save();

        let profile = null;

        if (user.role === 'student') {
            profile = await StudentProfile.findOne({ userId: user._id });
            if (profile) {
                if (std) profile.std = std;
                if (medium) profile.medium = medium;
                if (school) profile.school = school;
                if (parentPhone) profile.parentPhone = parentPhone;
                await profile.save();
            }
        } else if (user.role === 'guest') {
            profile = await GuestProfile.findOne({ userId: user._id });
            if (profile) {
                if (schoolName) profile.schoolName = schoolName;
                await profile.save();
            }
        }

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
