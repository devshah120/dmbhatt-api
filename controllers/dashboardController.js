const ExamResult = require('../models/ExamResult');
const OneLinerExamResult = require('../models/OneLinerExamResult');
const FiveMinTestResult = require('../models/FiveMinTestResult');
const TrueFalseExamResult = require('../models/TrueFalseExamResult');
const MatchFollowingExamResult = require('../models/MatchFollowingExamResult');
const StudentProfile = require('../models/StudentProfile');

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
        const [examResults, oneLinerResults, fiveMinTestResults, trueFalseResults, matchFollowingResults] = await Promise.all([
            ExamResult.find({ studentId: user._id }),
            OneLinerExamResult.find({ studentId: user._id }),
            FiveMinTestResult.find({ studentId: user._id }),
            TrueFalseExamResult.find({ studentId: user._id }),
            MatchFollowingExamResult.find({ studentId: user._id })
        ]);

        // Merge and sort by date descending
        const allResults = [
            ...examResults.map(e => {
                const obj = e.toObject();
                // For ExamResult, prioritize explicit type or deduce from isOnline
                if (!obj.type || (obj.type === 'REGULAR' && obj.isOnline === false)) {
                    obj.type = obj.isOnline ? 'REGULAR' : 'QUIZ';
                }
                return obj;
            }),
            ...oneLinerResults.map(e => {
                const obj = e.toObject();
                // For OneLiner, type is always 'ONELINER'
                if (!obj.type) {
                    obj.type = 'ONELINER';
                }
                // Ensure isOnline is true for OneLiner if not present
                if (obj.isOnline === undefined) {
                    obj.isOnline = true;
                }
                return obj;
            }),
            ...fiveMinTestResults.map(e => {
                const obj = e.toObject();
                // For FiveMinTest, type is 'QUIZ'
                if (!obj.type) {
                    obj.type = 'QUIZ';
                }
                // Ensure isOnline is true for FiveMinTest if not present
                if (obj.isOnline === undefined) {
                    obj.isOnline = true;
                }
                return obj;
            }),
            ...trueFalseResults.map(e => {
                const obj = e.toObject();
                // For TrueFalseExam, type is 'TRUE_FALSE'
                if (!obj.type) {
                    obj.type = 'TRUE_FALSE';
                }
                if (obj.isOnline === undefined) {
                    obj.isOnline = true;
                }
                if (!obj.date && !obj.createdAt) {
                    obj.date = obj.submittedAt || new Date();
                }
                return obj;
            }),
            ...matchFollowingResults.map(e => {
                const obj = e.toObject();
                if (!obj.type) {
                    obj.type = 'MATCH_FOLLOWING';
                }
                if (obj.isOnline === undefined) {
                    obj.isOnline = true;
                }
                if (!obj.date && !obj.createdAt) {
                    obj.date = obj.submittedAt || new Date();
                }
                return obj;
            })
        ].sort((a, b) => new Date(b.date || b.createdAt || b.submittedAt) - new Date(a.date || a.createdAt || a.submittedAt));

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
                date: exam.date || exam.createdAt || exam.submittedAt,
                type: exam.type,
                accuracy: exam.accuracy, // Optional for One Liners & True/False
                answers: exam.answers // Optional for Five Min & True/False
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
