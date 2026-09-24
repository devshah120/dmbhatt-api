const mongoose = require('mongoose');

/**
 * Objectives Test Series: a full-length MCQ paper (up to 100 questions) built around
 * the board exam pattern for one subject. Unlike the chapter-wise exam types
 * there is no unit - a paper covers the whole syllabus.
 */
const MAX_QUESTIONS = 100;

const objectivesTestSeriesSchema = new mongoose.Schema({
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
    // Students cannot open the paper before this moment. null = available immediately.
    startAt: {
        type: Date,
        default: null
    },
    // The ranked window closes here. A student's first attempt between startAt
    // and endAt counts on the leaderboard; everything after is practice.
    // null = the ranked window never closes.
    endAt: {
        type: Date,
        default: null
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
            message: `An Objectives Test Series paper can have at most ${MAX_QUESTIONS} questions.`
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

objectivesTestSeriesSchema.statics.MAX_QUESTIONS = MAX_QUESTIONS;

// Collection keeps its original name so documents saved while this model
// was called "BoardCracker" are still found.
module.exports = mongoose.model('ObjectivesTestSeries', objectivesTestSeriesSchema, 'boardcrackers');
