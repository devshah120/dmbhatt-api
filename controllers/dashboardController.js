const ExamResult = require('../models/ExamResult');
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

        // Fetch Exam Results
        // Sort by date descending
        const examResults = await ExamResult.find({ studentId: user._id }).sort({ date: -1 });

        res.status(200).json({
            totalRewardPoints: studentProfile.totalRewardPoints || 0,
            examResults: examResults.map(exam => ({
                id: exam._id,
                title: exam.title,
                obtainedMarks: exam.obtainedMarks,
                totalMarks: exam.totalMarks,
                isOnline: exam.isOnline,
                date: exam.date
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
