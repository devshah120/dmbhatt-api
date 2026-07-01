const mongoose = require('mongoose');

const redeemCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    discount: {
        type: Number,
        required: true,
        min: 1,
        max: 70
    },
    board: String,
    std: String,
    medium: String,
    stream: String,
    createdBy: {
        type: String,
        required: true
    },
    used: {
        type: Boolean,
        default: false
    },
    usedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    usedAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('RedeemCode', redeemCodeSchema);
