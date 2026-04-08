const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    standardId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: true
    },
    stream: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// A subject name must be unique within a standard
subjectSchema.index({ name: 1, standardId: 1 }, { unique: true });

module.exports = mongoose.model('Subject', subjectSchema);
