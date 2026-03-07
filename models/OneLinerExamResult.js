const mongoose = require('mongoose');

const oneLinerExamResultSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OneLinerExam',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    obtainedMarks: {
        type: Number,
        required: true
    },
    totalMarks: {
        type: Number,
        required: true
    },
    accuracy: {
        type: Number,
        default: 0
    },
    type: {
        type: String,
        default: 'ONELINER'
    },
    isOnline: {
        type: Boolean,
        default: true
    },
    date: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('OneLinerExamResult', oneLinerExamResultSchema);
