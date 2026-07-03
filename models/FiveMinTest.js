const mongoose = require('mongoose');

const fiveMinTestSchema = new mongoose.Schema({
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
    overview: {
        type: String,
        required: true
    },
    questions: [{
        question: String,
        questionImage: String,
        type: { type: String, default: 'MCQ' }, // MCQ, True/False, or Fill in the Blanks
        optionA: String,
        optionAImage: String,
        optionB: String,
        optionBImage: String,
        optionC: String,
        optionCImage: String,
        optionD: String,
        optionDImage: String,
        correctAnswer: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('FiveMinTest', fiveMinTestSchema);
