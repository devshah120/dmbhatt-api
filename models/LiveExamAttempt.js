const mongoose = require('mongoose');

/**
 * One sitting of a Live Exam by one student.
 *
 * FIRST-ATTEMPT RULE: only the attempt with isFirstAttempt = true is ever read by
 * the leaderboard. It is set once, server-side, when the attempt is created
 * (attemptNumber === 1) and is never written again. Two indexes enforce it at
 * the database level, so even concurrent requests cannot produce a second one:
 *   - (liveExamId, studentId, attemptNumber) is unique
 *   - (liveExamId, studentId) is unique among isFirstAttempt: true
 * Later attempts are stored as practice and never affect the ranking.
 *
 * All marks are computed by the server from `answers` against the Question bank.
 */
const answerSchema = new mongoose.Schema({
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedKey: { type: String, default: null },
    isCorrect: { type: Boolean, default: false },
    marksAwarded: { type: Number, default: 0 }
}, { _id: false });

const liveExamAttemptSchema = new mongoose.Schema({
    liveExamId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveExam', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    attemptNumber: { type: Number, required: true, min: 1 },
    isFirstAttempt: { type: Boolean, required: true, immutable: true },

    status: {
        type: String,
        enum: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'],
        default: 'IN_PROGRESS'
    },

    // Question order served for this attempt (admin order for attempt 1).
    questionOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    // Autosaved selections while IN_PROGRESS; graded copy once finished.
    answers: [answerSchema],

    startedAt: { type: Date, required: true },
    // Hard server-side cut-off. Answers are not accepted after it.
    deadlineAt: { type: Date, required: true },
    submittedAt: Date,
    timeTakenMs: Number,

    obtainedMarks: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 }
}, { timestamps: true });

liveExamAttemptSchema.index(
    { liveExamId: 1, studentId: 1, attemptNumber: 1 },
    { unique: true }
);
liveExamAttemptSchema.index(
    { liveExamId: 1, studentId: 1 },
    { unique: true, partialFilterExpression: { isFirstAttempt: true }, name: 'one_first_attempt_per_student' }
);
// Leaderboard read path, in ranking order.
liveExamAttemptSchema.index(
    { liveExamId: 1, obtainedMarks: -1, timeTakenMs: 1, submittedAt: 1, _id: 1 },
    { partialFilterExpression: { isFirstAttempt: true }, name: 'leaderboard_first_attempts' }
);
// Sweeper for attempts whose deadline passed without a submit.
liveExamAttemptSchema.index({ status: 1, deadlineAt: 1 });

module.exports = mongoose.model('LiveExamAttempt', liveExamAttemptSchema);
