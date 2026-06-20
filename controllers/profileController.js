const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const AdminProfile = require('../models/AdminProfile');
const ProductPurchase = require('../models/ProductPurchase');
const PlanUpgrade = require('../models/PlanUpgrade');
const ExamResult = require('../models/ExamResult');
const FiveMinTestResult = require('../models/FiveMinTestResult');
const OneLinerExamResult = require('../models/OneLinerExamResult');
const TrueFalseExamResult = require('../models/TrueFalseExamResult');
const Session = require('../models/Session');

/**
 * Get User Profile
 * @route GET /api/profile
 * @access Private
 */
// ... (rest of the functions remain same)
const getProfile = async (req, res) => {
    try {
        const user = req.user;
        let profile = null;

        // Fetch profile based on role
        if (user.role === 'student') {
            profile = await StudentProfile.findOne({ userId: user._id });
        } else if (user.role === 'admin' || user.role === 'super admin') {
            profile = await AdminProfile.findOne({ userId: user._id });
        }

        const examCounts = {
            mainExam: await ExamResult.countDocuments({ studentId: user._id }),
            fiveMinTest: await FiveMinTestResult.countDocuments({ studentId: user._id }),
            oneLinerExam: await OneLinerExamResult.countDocuments({ studentId: user._id }),
            trueFalseExam: await TrueFalseExamResult.countDocuments({ studentId: user._id }),
        };

        res.status(200).json({
            user: {
                firstName: user.firstName,
                middleName: user.middleName,
                lastName: user.lastName,
                email: user.email,
                phoneNum: user.phoneNum,
                photoPath: user.photoPath,
                role: user.role,
                address: user.address,
                isPaid: user.isPaid,
                dob: user.dob,
            },
            examCounts: examCounts,
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
        const { firstName, phoneNum, email, school, city, state, std, stream, medium, board, schoolName, parentPhone, dob } = req.body;

        if (firstName) user.firstName = firstName;
        if (phoneNum) user.phoneNum = phoneNum;
        if (email) user.email = email;
        if (dob) user.dob = dob;

        if (req.files && req.files['photo'] && req.files['photo'][0]) {
            user.photoPath = req.files['photo'][0].path;
        }

        if (city || state) {
            user.address = user.address || {};
            if (city) user.address.city = city;
            if (state) user.address.state = state;
        }

        await user.save();

        let profile = null;
        if (user.role === 'student') {
            profile = await StudentProfile.findOne({ userId: user._id });
            if (profile) {
                if (std) profile.std = std;
                if (stream) profile.stream = stream;
                if (medium) profile.medium = medium;
                if (board) profile.board = board;
                if (school) profile.school = school;
                if (parentPhone) profile.parentPhone = parentPhone;
                await profile.save();
            }
        }

        res.status(200).json({ message: 'Profile updated successfully', user, profile });

    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
}

/**
 * Get Purchased Products
 * @route GET /api/profile/purchased-products
 * @access Private
 */
const getPurchasedProducts = async (req, res) => {
    try {
        const purchases = await ProductPurchase.find({ userId: req.user.id })
            .populate('productId')
            .sort({ createdAt: -1 });

        res.status(200).json(purchases);
    } catch (error) {
        console.error('Get Purchased Products Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

/**
 * Get Upgrade History
 * @route GET /api/profile/upgrade-history
 * @access Private
 */
const getUpgradeHistory = async (req, res) => {
    try {
        const upgrades = await PlanUpgrade.find({ userId: req.user.id })
            .sort({ createdAt: -1 });

        res.status(200).json(upgrades);
    } catch (error) {
        console.error('Get Upgrade History Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

/**
 * Delete Account (Soft Delete)
 * @route DELETE /api/profile
 * @access Private
 */
const deleteAccount = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Soft delete: mark as deleted and deactivate
        user.deletedAt = new Date();
        user.isActive = false;
        await user.save();

        // Invalidate all sessions for this user
        await Session.updateMany(
            { userId: user._id },
            { isActive: false }
        );

        console.log(`[DELETE ACCOUNT] User ${user._id} (${user.phoneNum}) soft-deleted at ${user.deletedAt}`);

        res.status(200).json({ message: 'Account deleted successfully' });

    } catch (error) {
        console.error('Delete Account Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    getPurchasedProducts,
    getUpgradeHistory,
    deleteAccount
};
