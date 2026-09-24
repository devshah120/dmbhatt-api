const mongoose = require('mongoose');

const boardCrackerResultSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BoardCracker',
        required: true
    },
    title: {
        type: String,
        default: 'Board Cracker'
    },
    subject: String,
    obtainedMarks: {
        type: Number,
        required: true
    },
    totalMarks: {
        type: Number,
        required: true
    },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    type: {
        type: String,
        default: 'BOARD_CRACKER'
    },
    isOnline: {
        type: Boolean,
        default: true
    },
    accuracy: {
        type: Number,
        default: 0
    },
    timeTakenSeconds: {
        type: Number,
        default: 0
    },
    violationCount: {
        type: Number,
        default: 0
    },
    // What each violation was, e.g. "You left the app during the exam."
    violations: [String],
    // MANUAL = student submitted; TIME_UP / VIOLATIONS = auto-submitted.
    submitReason: {
        type: String,
        enum: ['MANUAL', 'TIME_UP', 'VIOLATIONS'],
        default: 'MANUAL'
    },
    answers: [{
        questionId: mongoose.Schema.Types.ObjectId,
        selectedAnswer: String,
        correctAnswer: String,
        isCorrect: Boolean
    }],
    submittedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('BoardCrackerResult', boardCrackerResultSchema);
