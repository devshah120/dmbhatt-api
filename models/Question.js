const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exam',
        required: true
    },
    questionText: {
        type: String,
        required: true
    },
    options: [{
        key: String, // A, B, C, D
        text: String
    }],
    correctAnswer: {
        type: String, // A, B, C, D
        required: true
    },
    marks: {
        type: Number,
        default: 1
    }
});

module.exports = mongoose.model('Question', questionSchema);
