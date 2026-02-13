const mongoose = require('mongoose');

const gameQuestionSchema = new mongoose.Schema({
    gameType: {
        type: String,
        required: true,
        enum: [
            'Speed Math',
            'Word Scramble',
            'Odd One Out',
            'Fact or Fiction',
            'Sentence Builder',
            'Grammar Guradian', // Note: User typo "Guradian", keeping as requested or correcting? I'll correct to Guardian but support the string if needed. Let's use the user's string for safety or confirm. I'll use "Grammar Guardian" as the likely intended string but mapped from the frontend.
            'Word Bridge',
            'Emoji Decoder'
        ]
    },
    questionText: {
        type: String,
        required: true
    },
    options: [{
        type: String
    }],
    correctAnswer: {
        type: String, // Can be the answer text or index depending on game
        required: true
    },
    difficulty: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
        default: 'Medium'
    },
    meta: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('GameQuestion', gameQuestionSchema);
