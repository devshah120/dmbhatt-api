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
    board: {
        type: String,
        required: true,
        default: 'GSEB'
    },
    stream: {
        type: String,
        default: 'None'
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
    orderIndex: { type: Number, default: 1 },
    totalMarks: {
        type: Number,
        required: true,
        default: 20
    },
    questions: [{
        questionText: { type: String, required: true },
        correctAnswer: { type: String, required: true },
        mark: { type: Number, required: true, default: 1 }
    }]
}, { timestamps: true });

module.exports = mongoose.model('OneLinerExam', oneLinerExamSchema);
