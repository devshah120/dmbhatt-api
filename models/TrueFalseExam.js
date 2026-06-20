const mongoose = require('mongoose');

const trueFalseExamSchema = new mongoose.Schema({
    title: {
        type: String,
        default: ''
    },
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
    questions: [{
        question: { type: String },
        questionImage: String,
        type: { type: String, default: 'True/False' },
        optionA: { type: String, default: 'True' },
        optionAImage: String,
        optionB: { type: String, default: 'False' },
        optionBImage: String,
        correctAnswer: String // "True" or "False"
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('TrueFalseExam', trueFalseExamSchema);
