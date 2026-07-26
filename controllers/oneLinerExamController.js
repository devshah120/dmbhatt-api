const OneLinerExam = require('../models/OneLinerExam');
const OneLinerExamResult = require('../models/OneLinerExamResult');
const StudentProfile = require('../models/StudentProfile');
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
    return await OneLinerExam.findOne(filter);
};

const createExam = async (req, res) => {
    try {
        const { std, subject, medium, board, stream, orderIndex } = req.body;

        const duplicate = await checkDuplicateOrderIndex({
            std,
            subject,
            medium,
            board: board || 'GSEB',
            stream: normalizeStream(stream),
            orderIndex
        });

        if (duplicate) {
            return res.status(400).json({ success: false, message: `Display Order / Chapter No. ${orderIndex || 1} is already assigned to another one-liner exam in this subject.` });
        }

        const exam = new OneLinerExam({
            ...req.body,
            stream: normalizeStream(req.body.stream)
        });
        await exam.save();
        res.status(201).json({ success: true, exam });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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

        const exams = await OneLinerExam.find(query)
            .sort({ orderIndex: 1, createdAt: -1 });

        // Ensure totalMarks is explicitly included for older records
        const processedExams = exams.map(exam => {
            const obj = exam.toObject();
            if (obj.totalMarks === undefined || obj.totalMarks === null) {
                obj.totalMarks = obj.questions ? obj.questions.length : 20;
            }
            return obj;
        });

        res.status(200).json(processedExams);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getExamById = async (req, res) => {
    try {
        const exam = await OneLinerExam.findById(req.params.id);
        if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

        const obj = exam.toObject();
        if (obj.totalMarks === undefined || obj.totalMarks === null) {
            obj.totalMarks = obj.questions ? obj.questions.length : 20;
        }

        // Attempt 1 shows the admin's order; retakes get a reshuffled paper.
        const studentId = req.user?._id;
        const attemptNumber = await getNextAttemptNumber({
            studentId,
            examId: req.params.id,
            examType: 'ONELINER',
            ResultModel: OneLinerExamResult,
            skipShuffle: !shouldShuffleFor(req)
        });

        obj.questions = shuffleQuestions(obj.questions, {
            attemptNumber,
            studentId,
            examId: req.params.id
        });
        obj.attemptNumber = attemptNumber;
        obj.isShuffled = attemptNumber > 1;

        res.status(200).json(obj);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const deleteExam = async (req, res) => {
    try {
        await OneLinerExam.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Exam deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const updateExam = async (req, res) => {
    try {
        const { id } = req.params;
        const existingExam = await OneLinerExam.findById(id);
        if (!existingExam) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }

        const { std, subject, medium, board, stream, orderIndex } = req.body;
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
            return res.status(400).json({ success: false, message: `Display Order / Chapter No. ${newOrderIndex} is already assigned to another one-liner exam in this subject.` });
        }

        const exam = await OneLinerExam.findByIdAndUpdate(id, {
            ...req.body,
            stream: normalizeStream(req.body.stream)
        }, { new: true });
        res.status(200).json({ success: true, exam });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const submitResult = async (req, res) => {
    try {
        const { examId, obtainedMarks, totalMarks, accuracy } = req.body;
        const title = req.body.title || 'Untitled Exam';
        const studentId = req.user._id;

        // 1. Check for duplicate
        // DISABLED: students may now retake an exam any number of times
        // const existing = await OneLinerExamResult.findOne({ studentId, examId });
        // if (existing) {
        //     return res.status(400).json({ success: false, message: 'You have already submitted this exam.' });
        // }

        // 2. Points (1 per 10 marks)
        // DISABLED: reward points are no longer awarded for exams
        // const earnedPoints = Math.floor(obtainedMarks / 10);
        // const profile = await StudentProfile.findOne({ userId: studentId });
        // if (profile) {
        //     profile.totalRewardPoints = (profile.totalRewardPoints || 0) + earnedPoints;
        //     await profile.save();
        // }
        const earnedPoints = 0;

        // 3. Save
        const result = new OneLinerExamResult({
            studentId,
            examId,
            title,
            obtainedMarks,
            totalMarks,
            accuracy: accuracy || 0,
            type: req.body.type || 'ONELINER',
            isOnline: req.body.isOnline !== undefined ? req.body.isOnline : true
        });

        await result.save();

        const attemptInfo = await recordAttempt({
            studentId,
            examId,
            examType: 'ONELINER',
            title,
            obtainedMarks,
            totalMarks,
            accuracy
        });

        res.status(201).json({
            success: true,
            result,
            earnedPoints,
            attemptNumber: attemptInfo?.attemptNumber,
            totalAttempts: attemptInfo?.totalAttempts,
            bestMarks: attemptInfo?.bestMarks
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    createExam,
    getAllExams,
    getExamById,
    deleteExam,
    updateExam,
    submitResult
};
