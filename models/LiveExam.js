const mongoose = require('mongoose');

/**
 * A scheduled, time-boxed exam that every eligible student sits at the same time
 * ("Live Arena").
 *
 * Questions are NOT copied: they are references into the existing Question bank
 * (the same documents the regular Online Exams use), picked by the admin.
 *
 * `status` only holds what an admin decides (DRAFT / SCHEDULED / CANCELLED). The
 * time-driven phases (QUEUE_OPEN, LIVE, COMPLETED) are derived from the server
 * clock on every read by liveExamService.getEffectiveStatus, so they are always
 * correct after a restart and never depend on a job having run.
 */
const liveExamSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    instructions: { type: String, default: '' },

    subject: { type: String, required: true, trim: true },
    std: { type: String, required: true, trim: true },
    board: { type: String, required: true, default: 'GSEB', trim: true },
    medium: { type: String, required: true, trim: true },
    stream: { type: String, default: 'None', trim: true },

    // Order here is the order students see on their first attempt.
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    // Online Exams the questions were picked from (for the admin editor).
    sourceExamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Exam' }],

    // Both derived from the selected questions on save, never taken from the client.
    questionCount: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    passingMarks: { type: Number, default: 0 },

    startAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    endAt: { type: Date, required: true },
    // Students may join the waiting queue this many minutes before startAt.
    queueOpensBeforeMinutes: { type: Number, default: 30, min: 0 },

    status: {
        type: String,
        enum: ['DRAFT', 'SCHEDULED', 'CANCELLED'],
        default: 'DRAFT'
    },
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelReason: String,

    // Pending push reminders created for this exam, so a reschedule / cancel can
    // withdraw them before the notification worker sends them.
    reminderNotificationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledNotification' }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Student listing: "published exams for my class that have not ended yet".
liveExamSchema.index({ std: 1, board: 1, status: 1, endAt: 1 });
// Admin listing and the realtime ticker.
liveExamSchema.index({ isDeleted: 1, startAt: -1 });

module.exports = mongoose.model('LiveExam', liveExamSchema);
