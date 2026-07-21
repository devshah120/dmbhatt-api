const mongoose = require('mongoose');

/**
 * One document per student per exam, holding a rolling history of every attempt.
 *
 * The per-type result collections (ExamResult, OneLinerExamResult, ...) stay the
 * source of truth for an individual submission; this model is the aggregate view
 * that answers "how many times has this student taken this exam, and what did
 * they score each time" without a fan-out query across five collections.
 */
const examAttemptSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    // Which exam collection examId points at.
    examType: {
        type: String,
        required: true,
        enum: ['REGULAR', 'ONELINER', 'TRUE_FALSE', 'MATCH_FOLLOWING', 'FIVE_MIN']
    },
    title: {
        type: String,
        default: 'Untitled Exam'
    },
    totalAttempts: {
        type: Number,
        default: 0
    },
    bestMarks: {
        type: Number,
        default: 0
    },
    lastMarks: {
        type: Number,
        default: 0
    },
    attempts: [{
        attemptNumber: Number,
        obtainedMarks: Number,
        totalMarks: Number,
        accuracy: Number,
        violationCount: { type: Number, default: 0 },
        // false for attempt 1 (admin order), true for every reshuffled attempt
        wasShuffled: { type: Boolean, default: false },
        submittedAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

// One row per student+exam, and the lookup path for "have they taken this?"
examAttemptSchema.index({ studentId: 1, examId: 1, examType: 1 }, { unique: true });

module.exports = mongoose.model('ExamAttempt', examAttemptSchema);
