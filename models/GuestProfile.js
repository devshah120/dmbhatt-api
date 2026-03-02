const mongoose = require('mongoose');

const guestProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
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
    schoolName: {
        type: String,
        required: true,
        trim: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('GuestProfile', guestProfileSchema);
