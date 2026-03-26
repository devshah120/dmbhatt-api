const mongoose = require('mongoose');

const studentProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    std: {
        type: String,
        required: true,
        trim: true
    },
    medium: {
        type: String,
        required: true,
        trim: true
    },
    board: {
        type: String,
        required: true,
        trim: true,
        default: 'GSEB'
    },
    stream: {
        type: String,
        trim: true,
        default: 'None'
    },
    school: {
        type: String,
        required: false,
        trim: true
    },
    rollNo: {
        type: String,
        trim: true
    },
    parentPhone: {
        type: String,
        trim: true
    },
    totalRewardPoints: {
        type: Number,
        default: 0
    },
    isGifted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('StudentProfile', studentProfileSchema);
