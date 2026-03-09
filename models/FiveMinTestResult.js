const mongoose = require('mongoose');

const fiveMinTestResultSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiveMinTest',
        required: true
    },
    title: {
        type: String,
        required: true
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
        default: 'QUIZ'
    },
    isOnline: {
        type: Boolean,
        default: true
    },
    violationCount: {
        type: Number,
        default: 0
    },
    answers: [{
        questionIndex: Number,
        studentAnswer: String,
        isCorrect: Boolean,
        correctAnswer: String
    }],
    date: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('FiveMinTestResult', fiveMinTestResultSchema);
