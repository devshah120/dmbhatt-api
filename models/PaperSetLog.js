const mongoose = require('mongoose');

const PaperSetLogSchema = new mongoose.Schema({
    paperSetId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaperSet',
        required: true
    },
    examName: {
        type: String,
        required: true
    },
    action: {
        type: String,
        required: true
    },
    status: {
        type: String, // The status associated with this log (e.g., Collected)
    },
    createdBy: {
        type: String, // Name of the user (Assistant/Admin)
        required: true
    },
    updatedBy: {
        type: String, // Usually same as createdBy for a log entry
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('PaperSetLog', PaperSetLogSchema);
