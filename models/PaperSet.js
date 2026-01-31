const mongoose = require('mongoose');

const PaperSetSchema = new mongoose.Schema({
    examName: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    medium: {
        type: String,
        required: true
    },
    standard: {
        type: String,
        required: true
    },
    stream: {
        type: String,
        // Can be 'Science', 'General', 'None' or empty if not applicable
        default: 'None'
    },
    status: {
        type: String,
        enum: ['Created', 'Collected', 'Checked', 'Rechecked'],
        default: 'Created'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('PaperSet', PaperSetSchema);
