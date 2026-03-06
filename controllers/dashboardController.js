const ExamResult = require('../models/ExamResult');
const OneLinerExamResult = require('../models/OneLinerExamResult');
const StudentProfile = require('../models/StudentProfile');
// const RewardHistory = require('../models/RewardHistory'); // If needed for detailed history

/**
 * Get Student Dashboard Data
 * Returns Exam Results and Total Reward Points
 * @route GET /api/dashboard
 * @access Private (Student)
 */
const getDashboardData = async (req, res) => {
    try {
        const user = req.user;

        if (user.role !== 'student') {
            // For now, only students have this dashboard view
            return res.status(403).json({ message: 'Dashboard available for students only' });
        }

        // Fetch Student Profile for Reward Points
        const studentProfile = await StudentProfile.findOne({ userId: user._id });

        if (!studentProfile) {
            return res.status(404).json({ message: 'Student profile not found' });
        }

        // Fetch All Results
        const [examResults, oneLinerResults] = await Promise.all([
            ExamResult.find({ studentId: user._id }),
            OneLinerExamResult.find({ studentId: user._id })
        ]);

        // Merge and sort by date descending
        const allResults = [
            ...examResults.map(e => ({ ...e.toObject(), type: 'REGULAR' })),
            ...oneLinerResults.map(e => ({ ...e.toObject(), type: 'ONELINER' }))
        ].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

        // Consolidate points: Exam Points + Referral Points
        const totalPoints = (studentProfile.totalRewardPoints || 0) + (user.bonusPoints || 0);

        res.status(200).json({
            totalRewardPoints: totalPoints,
            examResults: allResults.map(exam => ({
                id: exam._id,
                examId: exam.examId,
                title: exam.title,
                obtainedMarks: exam.obtainedMarks,
                totalMarks: exam.totalMarks,
                earnedPoints: exam.earnedPoints || 0,
                isOnline: exam.isOnline,
                date: exam.date || exam.createdAt,
                type: exam.type,
                accuracy: exam.accuracy // Optional for One Liners
            }))
        });

    } catch (error) {
        console.error('Dashboard Data Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    getDashboardData
};
