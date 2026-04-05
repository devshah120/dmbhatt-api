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
            'Grammar Guardian',
            'Word Bridge',
            'Emoji Decoder',
            'Math Riddles',
            'Number Series',
            'Algebra Balancer',
            'Flag Explorer',
            'Spelling Master',
            'Synonym & Antonym',
            'Language Translator',
            'Subject Word Search',
            'Grammar Sorter',
            'Capital City Quest',
            'Proverb Completer',
            'Direction Sense',
            'GK Quiz',
            'Syllable Scramble',
            'Word Chain',
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
    isDeleted: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('GameQuestion', gameQuestionSchema);
