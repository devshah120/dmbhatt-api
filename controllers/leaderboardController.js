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

        // Find all students in the specified standard and combine points using aggregation
        const leaderboard = await StudentProfile.aggregate([
            { $match: { std } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'userData'
                }
            },
            { $unwind: '$userData' },
            {
                $project: {
                    _id: '$userData._id',
                    firstName: '$userData.firstName',
                    lastName: '$userData.lastName',
                    examPoints: { $ifNull: ['$totalRewardPoints', 0] },
                    referralPoints: { $ifNull: ['$userData.bonusPoints', 0] },
                    totalRewardPoints: {
                        $add: [
                            { $ifNull: ['$totalRewardPoints', 0] },
                            { $ifNull: ['$userData.bonusPoints', 0] }
                        ]
                    },
                    std: 1,
                    medium: 1,
                    school: 1
                }
            },
            { $sort: { totalRewardPoints: -1 } }
        ]);

        // Add rank to each student
        const rankedLeaderboard = leaderboard.map((student, index) => ({
            ...student,
            rank: index + 1
        }));

        res.status(200).json({
            success: true,
            count: rankedLeaderboard.length,
            data: rankedLeaderboard
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
