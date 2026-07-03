const mongoose = require('mongoose');

const matchFollowingExamSchema = new mongoose.Schema({
    title: {
        type: String,
        default: ''
    },
    orderIndex: { type: Number, default: 1 },
    std: {
        type: String,
        required: true
    },
    medium: {
        type: String,
        required: true
    },
    stream: {
        type: String,
        default: 'None'
    },
    board: {
        type: String,
        required: true,
        default: 'GSEB'
    },
    subject: {
        type: String,
        required: true
    },
    unit: {
        type: String,
        required: true
    },
    totalMarks: {
        type: Number,
        required: true,
        default: 20
    },
    overview: {
        type: String,
        required: true
    },
    pairs: [{
        left: { type: String, required: true },
        right: { type: String, required: true }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('MatchFollowingExam', matchFollowingExamSchema);
