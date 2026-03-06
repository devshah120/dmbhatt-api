const OneLinerExam = require('../models/OneLinerExam');

const createExam = async (req, res) => {
    try {
        const exam = new OneLinerExam(req.body);
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

        const exams = await OneLinerExam.find(query).sort({ createdAt: -1 });

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
        const exam = await OneLinerExam.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ success: true, exam });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    createExam,
    getAllExams,
    getExamById,
    deleteExam,
    updateExam
};
