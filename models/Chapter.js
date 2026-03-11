const mongoose = require('mongoose');

const chapterSchema = new mongoose.Schema({
    unitNo: {
        type: Number,
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    subjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// A unit number must be unique within a subject
chapterSchema.index({ unitNo: 1, subjectId: 1 }, { unique: true });

module.exports = mongoose.model('Chapter', chapterSchema);
