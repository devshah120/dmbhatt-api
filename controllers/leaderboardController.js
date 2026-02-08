const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');

/**
 * Get leaderboard for a specific standard
 * @route GET /api/leaderboard/:std
 */
exports.getLeaderboardByStandard = async (req, res) => {
    try {
        const { std } = req.params;

        // Validate standard parameter
        if (!std) {
            return res.status(400).json({
                success: false,
                message: 'Standard parameter is required'
            });
        }

        // Find all students in the specified standard
        const students = await StudentProfile.find({ std })
            .populate('userId', 'firstName lastName')
            .sort({ totalRewardPoints: -1 }) // Sort by points descending
            .lean();

        // Add rank to each student
        const leaderboard = students.map((student, index) => ({
            _id: student.userId?._id,
            firstName: student.userId?.firstName || 'Unknown',
            lastName: student.userId?.lastName || '',
            totalRewardPoints: student.totalRewardPoints || 0,
            rank: index + 1,
            std: student.std,
            medium: student.medium,
            school: student.school
        }));

        res.status(200).json({
            success: true,
            count: leaderboard.length,
            data: leaderboard
        });

    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch leaderboard',
            error: error.message
        });
    }
};
