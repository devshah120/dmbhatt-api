const mongoose = require('mongoose');

/**
 * Board Crackers: a full-length MCQ paper (up to 100 questions) built around
 * the board exam pattern for one subject. Unlike the chapter-wise exam types
 * there is no unit - a paper covers the whole syllabus.
 */
const MAX_QUESTIONS = 100;

const boardCrackerSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
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
    // Time limit in minutes; 0 means untimed.
    duration: {
        type: Number,
        default: 60
    },
    questions: {
        type: [{
            question: String,
            questionImage: String,
            optionA: String,
            optionAImage: String,
            optionB: String,
            optionBImage: String,
            optionC: String,
            optionCImage: String,
            optionD: String,
            optionDImage: String,
            // Option letter: "A" | "B" | "C" | "D"
            correctAnswer: String,
            explanation: String
        }],
        validate: {
            validator: (qs) => qs.length <= MAX_QUESTIONS,
            message: `A Board Cracker paper can have at most ${MAX_QUESTIONS} questions.`
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

boardCrackerSchema.statics.MAX_QUESTIONS = MAX_QUESTIONS;

module.exports = mongoose.model('BoardCracker', boardCrackerSchema);
