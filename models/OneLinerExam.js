const mongoose = require('mongoose');

const oneLinerExamSchema = new mongoose.Schema({
    std: {
        type: String,
        required: true
    },
    medium: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    unit: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    questions: [{
        questionText: { type: String, required: true },
        correctAnswer: { type: String, required: true }
    }]
}, { timestamps: true });

module.exports = mongoose.model('OneLinerExam', oneLinerExamSchema);
