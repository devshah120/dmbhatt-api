const mongoose = require('mongoose');

const topRankerSchema = new mongoose.Schema({
    studentName: {
        type: String,
        required: true
    },
    percentage: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    rank: {
        type: String,
        required: true
    },
    standard: {
        type: String, // "10", "11", "12", etc.
        required: true
    },
    medium: {
        type: String, // "English", "Gujarati"
        required: true
    },
    stream: {
        type: String, // "Science", "Commerce", "General" or "-"
        default: '-'
    },
    photo: {
        type: String, // URL to photo if any
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('TopRanker', topRankerSchema);
