const MatchFollowingExam = require('../models/MatchFollowingExam');
const MatchFollowingExamResult = require('../models/MatchFollowingExamResult');
const StudentProfile = require('../models/StudentProfile');

// Create Exam
const createExam = async (req, res) => {
    try {
        const { title, std, medium, stream, board, subject, unit, overview, pairs, totalMarks, orderIndex } = req.body;
        const newExam = new MatchFollowingExam({
            title, std, medium, stream, board, subject, unit, overview, pairs, totalMarks: totalMarks || pairs.length,
            orderIndex: orderIndex || 1
        });
        const savedExam = await newExam.save();
        res.status(201).json(savedExam);
    } catch (error) {
        console.error('Error creating match following exam:', error);
        res.status(500).json({ error: 'Failed to create match following exam' });
    }
};

const getAllExams = async (req, res) => {
    try {
        const { std, medium, board, stream, subject } = req.query;
        let query = {};
        if (std) query.std = std;
        if (medium) query.medium = medium;
        if (board) query.board = board;
        if (stream) query.stream = stream;
        if (subject) query.subject = subject;

        const exams = await MatchFollowingExam.find(query).sort({ orderIndex: 1, createdAt: -1 });
        res.status(200).json(exams);
    } catch (error) {
        console.error('Error fetching match following exams:', error);
        res.status(500).json({ error: 'Failed to fetch match following exams' });
    }
};

const getExamById = async (req, res) => {
    try {
        const exam = await MatchFollowingExam.findById(req.params.id);
        if (!exam) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        res.status(200).json(exam);
    } catch (error) {
        console.error('Error fetching match following exam by id:', error);
        res.status(500).json({ error: 'Failed to fetch exam' });
    }
};

const updateExam = async (req, res) => {
    try {
        const { title, std, medium, stream, board, subject, unit, overview, pairs, totalMarks, orderIndex } = req.body;
        const updatedExam = await MatchFollowingExam.findByIdAndUpdate(
            req.params.id,
            { 
                title, std, medium, stream, board, subject, unit, overview, pairs, totalMarks,
                orderIndex: orderIndex || 1
            },
            { new: true }
        );
        if (!updatedExam) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        res.status(200).json(updatedExam);
    } catch (error) {
        console.error('Error updating match following exam:', error);
        res.status(500).json({ error: 'Failed to update exam' });
    }
};

const deleteExam = async (req, res) => {
    try {
        const deletedExam = await MatchFollowingExam.findByIdAndDelete(req.params.id);
        if (!deletedExam) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        res.status(200).json({ message: 'Exam deleted successfully' });
    } catch (error) {
        console.error('Error deleting match following exam:', error);
        res.status(500).json({ error: 'Failed to delete exam' });
    }
};

const submitResult = async (req, res) => {
    try {
        const { examId, obtainedMarks, totalMarks, accuracy, violationCount, answers } = req.body;
        const title = req.body.title || 'Untitled Exam';
        
        // Ensure student has not already submitted this exam
        const existingResult = await MatchFollowingExamResult.findOne({ studentId: req.user._id, examId });
        if (existingResult) {
            return res.status(400).json({ message: 'Exam already submitted' });
        }

        const newResult = new MatchFollowingExamResult({
            studentId: req.user._id,
            examId,
            title,
            obtainedMarks,
            totalMarks,
            accuracy: accuracy || 0,
            violationCount: violationCount || 0,
            type: 'MATCH_FOLLOWING',
            answers: answers || []
        });

        await newResult.save();

        // Add exam record to StudentProfile
        await StudentProfile.findByIdAndUpdate(req.user._id, {
            $push: {
                exams: {
                    examId,
                    examModel: 'MatchFollowingExam',
                    title,
                    type: 'MATCH_FOLLOWING',
                    score: obtainedMarks,
                    totalMarks,
                    accuracy: accuracy || 0,
                    date: new Date()
                }
            }
        });

        res.status(201).json({ message: 'Exam result submitted successfully' });
    } catch (error) {
        console.error('Error submitting match following exam result:', error);
        res.status(500).json({ message: 'Server error while submitting exam' });
    }
};

module.exports = {
    createExam,
    getAllExams,
    getExamById,
    updateExam,
    deleteExam,
    submitResult
};
