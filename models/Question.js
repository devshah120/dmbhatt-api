const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exam',
        required: true
    },
    questionText: {
        type: String,
        required: false
    },
    questionImage: {
        type: String // Cloudinary URL
    },
    options: [{
        key: String, // A, B, C, D
        text: String,
        image: String // Cloudinary URL for option image
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
