const mongoose = require('mongoose');

const objectivesTestSeriesResultSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ObjectivesTestSeries',
        required: true
    },
    title: {
        type: String,
        default: 'Objectives Test Series'
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
    // true only for the student's first attempt inside the paper's ranked
    // window; retakes and attempts after endAt are practice.
    isRanked: {
        type: Boolean,
        default: false
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

// At most one ranked result per student per paper, even if two submits race.
objectivesTestSeriesResultSchema.index(
    { examId: 1, studentId: 1 },
    { unique: true, partialFilterExpression: { isRanked: true } }
);
// Leaderboard order: marks, then fastest, then earliest.
objectivesTestSeriesResultSchema.index({ examId: 1, isRanked: 1, obtainedMarks: -1, timeTakenSeconds: 1, submittedAt: 1 });

// Collection keeps its original name so documents saved while this model
// was called "BoardCrackerResult" are still found.
module.exports = mongoose.model('ObjectivesTestSeriesResult', objectivesTestSeriesResultSchema, 'boardcrackerresults');
