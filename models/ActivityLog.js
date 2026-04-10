const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
    entityType: {
        type: String,
        required: true,
        enum: ['Student', 'Admin', 'Product', 'Material', 'PaperSet', 'Standard', 'Subject', 'Chapter', 'System', 'Other'],
        default: 'Student'
    },
    action: {
        type: String,
        required: true,
        enum: ['Added', 'Updated', 'Deleted']
    },
    targetName: {
        type: String,
        required: true // The name of the student who was deleted.
    },
    performedBy: {
        type: String,
        required: true,
        default: 'Admin'
    },
    performedByImg: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
