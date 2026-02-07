const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    subject: {
        type: String,
        required: true
    },
    totalMarks: {
        type: Number,
        required: true
    },
    std: {
        type: String,
        required: true
    },
    medium: {
        type: String,
        required: true
    },
    unit: {
        type: String,
        required: true
    },
    questions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question'
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Exam', examSchema);
