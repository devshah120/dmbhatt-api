const mongoose = require('mongoose');

const trueFalseExamResultSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TrueFalseExam',
        required: true
    },
    title: {
        type: String,
        default: 'Untitled Exam'
    },
    obtainedMarks: {
        type: Number,
        required: true
    },
    totalMarks: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        default: 'TRUE_FALSE'
    },
    isOnline: {
        type: Boolean,
        default: true
    },
    accuracy: {
        type: Number,
        default: 0
    },
    violationCount: {
        type: Number,
        default: 0
    },
    date: {
        type: Date,
        default: Date.now
    },
    answers: [{
        questionIndex: Number,
        studentAnswer: Boolean,
        isCorrect: Boolean,
        correctAnswer: Boolean,
        questionText: String
    }],
    submittedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('TrueFalseExamResult', trueFalseExamResultSchema);
