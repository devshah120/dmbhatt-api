const mongoose = require('mongoose');

const examViolationSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    count: {
        type: Number,
        default: 0
    },
    examType: {
        type: String,
        required: true,
        enum: ['REGULAR', 'ONELINER', 'FIVEMIN']
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ExamViolation', examViolationSchema);
