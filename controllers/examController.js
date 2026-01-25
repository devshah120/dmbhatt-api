const ExamResult = require('../models/ExamResult');
const StudentProfile = require('../models/StudentProfile');
const RewardHistory = require('../models/RewardHistory');

/**
 * Submit Exam Result and Calculate Rewards
 * @route POST /api/exam/submit
 * @access Private (Student)
 */
const submitExamResult = async (req, res) => {
    try {
        const user = req.user;
        const { title, obtainedMarks, totalMarks, isOnline } = req.body;

        if (!title || obtainedMarks === undefined || !totalMarks) {
            return res.status(400).json({ message: 'Please provide all fields' });
        }

        // 1. Save Exam Result
        const examResult = await ExamResult.create({
            studentId: user._id,
            title,
            obtainedMarks,
            totalMarks,
            isOnline: isOnline || false
        });

        // 2. Calculate Reward Points
        // Logic: 1 Point for every 1 marks (e.g., 7 -> 7)
        const earnedPoints = obtainedMarks;

        if (earnedPoints > 0) {
            // 3. Update Student Profile
            const profile = await StudentProfile.findOne({ userId: user._id });
            if (profile) {
                profile.totalRewardPoints = (profile.totalRewardPoints || 0) + earnedPoints;
                await profile.save();
            }

            // 4. Create Reward History
            await RewardHistory.create({
                studentId: user._id,
                points: earnedPoints,
                description: `Earned from ${title} (${obtainedMarks}/${totalMarks})`,
                type: 'credit'
            });
        }

        res.status(201).json({
            message: 'Exam submitted successfully',
            earnedPoints,
            examResult
        });

    } catch (error) {
        console.error('Submit Exam Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    submitExamResult
};
