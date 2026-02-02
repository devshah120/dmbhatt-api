const mongoose = require('mongoose');

const fiveMinTestSchema = new mongoose.Schema({
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
        default: '-'
    },
    subject: {
        type: String,
        required: true
    },
    unit: {
        type: String,
        required: true
    },
    overview: {
        type: String,
        required: true
    },
    questions: [{
        question: String,
        type: { type: String, default: 'MCQ' }, // MCQ or True/False
        optionA: String,
        optionB: String,
        optionC: String,
        optionD: String,
        correctAnswer: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('FiveMinTest', fiveMinTestSchema);
