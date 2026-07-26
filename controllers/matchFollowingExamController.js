const MatchFollowingExam = require('../models/MatchFollowingExam');
const MatchFollowingExamResult = require('../models/MatchFollowingExamResult');
const StudentProfile = require('../models/StudentProfile');
const ActivityLog = require('../models/ActivityLog');
const { shuffleQuestions } = require('../utils/examShuffleService');
const { recordAttempt, getNextAttemptNumber, shouldShuffleFor } = require('../utils/examAttemptService');

const normalizeStream = (stream) => {
    if (!stream || stream === 'None' || stream === '-') {
        return 'None';
    }
    return stream;
};

const checkDuplicateOrderIndex = async (query, excludeId = null) => {
    const filter = {
        isDeleted: { $ne: true },
        std: query.std,
        subject: query.subject,
        medium: query.medium,
        board: query.board || 'GSEB',
        stream: normalizeStream(query.stream),
        orderIndex: parseInt(query.orderIndex) || 1
    };
    if (excludeId) {
        filter._id = { $ne: excludeId };
    }
    return await MatchFollowingExam.findOne(filter);
};

// Create Exam
const createExam = async (req, res) => {
    try {
        const { title, std, medium, stream, board, subject, unit, overview, pairs, totalMarks, orderIndex } = req.body;

        const duplicate = await checkDuplicateOrderIndex({
            std,
            subject,
            medium,
            board: board || 'GSEB',
            stream: normalizeStream(stream),
            orderIndex
        });

        if (duplicate) {
            return res.status(400).json({ error: `Display Order / Chapter No. ${orderIndex || 1} is already assigned to another match following exam in this subject.` });
        }

        const newExam = new MatchFollowingExam({
            title, std, medium, 
            stream: normalizeStream(stream), 
            board, subject, unit, overview, pairs, totalMarks: totalMarks || pairs.length,
            orderIndex: orderIndex || 1
        });
        const savedExam = await newExam.save();

        await ActivityLog.create({
            entityType: 'Exam',
            action: 'Added',
            targetName: savedExam.title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

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

        // The student app starts an exercise straight from this list payload
        // rather than re-fetching by id, so the per-attempt shuffle has to
        // happen here too. ?original=true (admin app / review) opts out.
        if (!shouldShuffleFor(req)) {
            return res.status(200).json(exams);
        }
        const studentId = req.user._id;

        const payload = await Promise.all(exams.map(async (exam) => {
            const obj = exam.toObject();
            const attemptNumber = await getNextAttemptNumber({
                studentId,
                examId: obj._id,
                examType: 'MATCH_FOLLOWING',
                ResultModel: MatchFollowingExamResult
            });

            obj.pairs = shuffleQuestions(obj.pairs, {
                attemptNumber,
                studentId,
                examId: obj._id
            });
            obj.attemptNumber = attemptNumber;
            obj.isShuffled = attemptNumber > 1;
            return obj;
        }));

        res.status(200).json(payload);
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

        // Attempt 1 shows the admin's order; retakes reorder the pairs so the
        // student cannot rely on remembering row positions.
        const studentId = req.user?._id;
        const attemptNumber = await getNextAttemptNumber({
            studentId,
            examId: req.params.id,
            examType: 'MATCH_FOLLOWING',
            ResultModel: MatchFollowingExamResult,
            skipShuffle: !shouldShuffleFor(req)
        });

        const payload = exam.toObject();
        payload.pairs = shuffleQuestions(payload.pairs, {
            attemptNumber,
            studentId,
            examId: req.params.id
        });
        payload.attemptNumber = attemptNumber;
        payload.isShuffled = attemptNumber > 1;

        res.status(200).json(payload);
    } catch (error) {
        console.error('Error fetching match following exam by id:', error);
        res.status(500).json({ error: 'Failed to fetch exam' });
    }
};

const updateExam = async (req, res) => {
    try {
        const { id } = req.params;
        const existingExam = await MatchFollowingExam.findById(id);
        if (!existingExam) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        const { title, std, medium, stream, board, subject, unit, overview, pairs, totalMarks, orderIndex } = req.body;
        const newOrderIndex = orderIndex !== undefined ? orderIndex : existingExam.orderIndex;

        const duplicate = await checkDuplicateOrderIndex({
            std: std || existingExam.std,
            subject: subject || existingExam.subject,
            medium: medium || existingExam.medium,
            board: board || existingExam.board || 'GSEB',
            stream: normalizeStream(stream || existingExam.stream),
            orderIndex: newOrderIndex
        }, id);

        if (duplicate) {
            return res.status(400).json({ error: `Display Order / Chapter No. ${newOrderIndex} is already assigned to another match following exam in this subject.` });
        }

        const updatedExam = await MatchFollowingExam.findByIdAndUpdate(
            id,
            { 
                title, std, medium, 
                stream: normalizeStream(stream), 
                board, subject, unit, overview, pairs, totalMarks,
                orderIndex: newOrderIndex
            },
            { new: true }
        );
        if (!updatedExam) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        await ActivityLog.create({
            entityType: 'Exam',
            action: 'Updated',
            targetName: updatedExam.title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

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

        await ActivityLog.create({
            entityType: 'Exam',
            action: 'Deleted',
            targetName: deletedExam.title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

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
        // DISABLED: students may now retake an exam any number of times
        // const existingResult = await MatchFollowingExamResult.findOne({ studentId: req.user._id, examId });
        // if (existingResult) {
        //     return res.status(400).json({ message: 'Exam already submitted' });
        // }

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

        const attemptInfo = await recordAttempt({
            studentId: req.user._id,
            examId,
            examType: 'MATCH_FOLLOWING',
            title,
            obtainedMarks,
            totalMarks,
            accuracy,
            violationCount
        });

        res.status(201).json({
            message: 'Exam result submitted successfully',
            attemptNumber: attemptInfo?.attemptNumber,
            totalAttempts: attemptInfo?.totalAttempts,
            bestMarks: attemptInfo?.bestMarks
        });
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
