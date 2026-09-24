const mongoose = require('mongoose');

/**
 * When a student opened their ranked Objectives Test Series attempt, by the server's
 * clock. Created the first time they open a paper inside its ranked window.
 *
 * - Ranked time taken is measured from here, not reported by the app.
 * - Reopening the paper resumes this clock instead of restarting it, so a
 *   student can't look at the questions, quit, and start fresh.
 * - A student who starts just before endAt still gets their full time limit.
 */
const objectivesTestSeriesAttemptStartSchema = new mongoose.Schema({
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
    startedAt: {
        type: Date,
        required: true
    }
});

objectivesTestSeriesAttemptStartSchema.index({ studentId: 1, examId: 1 }, { unique: true });

// Collection keeps its original name so documents saved while this model
// was called "BoardCrackerAttemptStart" are still found.
module.exports = mongoose.model('ObjectivesTestSeriesAttemptStart', objectivesTestSeriesAttemptStartSchema, 'boardcrackerattemptstarts');
