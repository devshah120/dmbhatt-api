const mongoose = require('mongoose');

/**
 * Waiting-queue membership for a Live Exam: one row per student per exam.
 *
 * The unique index is what makes "join queue" idempotent — a double tap, a
 * second tab or a retried request can never add the same student twice, and
 * the queue count is simply the number of rows.
 *
 * Online presence is deliberately NOT stored here; it is tracked from live
 * socket connections (see realtime/liveExamSocket.js).
 */
const liveExamQueueSchema = new mongoose.Schema({
    liveExamId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveExam', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });

liveExamQueueSchema.index({ liveExamId: 1, studentId: 1 }, { unique: true });
// "Which exams is this student queued for?" (student listing / banner).
liveExamQueueSchema.index({ studentId: 1 });

module.exports = mongoose.model('LiveExamQueue', liveExamQueueSchema);
