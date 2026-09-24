const mongoose = require('mongoose');

const scheduledNotificationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    std: {
        type: String,
        default: 'all'
    },
    scheduledTime: {
        type: Date,
        required: true
    },
    // Set when the notification was queued automatically for a record (e.g. a
    // scheduled Objectives Test Series paper), so it can be moved or removed
    // when that record is rescheduled or deleted.
    sourceType: String,
    sourceId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'sent', 'failed'],
        default: 'pending'
    },
    sentAt: Date,
    errorMessage: String,
    fcmMessageId: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ScheduledNotification', scheduledNotificationSchema);
