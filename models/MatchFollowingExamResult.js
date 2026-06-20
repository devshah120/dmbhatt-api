const mongoose = require('mongoose');

const matchFollowingExamResultSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentProfile',
        required: true
    },
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MatchFollowingExam',
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
    accuracy: {
        type: Number,
        default: 0
    },
    violationCount: {
        type: Number,
        default: 0
    },
    type: {
        type: String,
        default: 'MATCH_FOLLOWING'
    },
    date: {
        type: Date,
        default: Date.now
    },
    answers: [{
        left: String,
        studentMatch: String,
        isCorrect: Boolean,
        correctMatch: String
    }],
    submittedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('MatchFollowingExamResult', matchFollowingExamResultSchema);
// Trigger restart
