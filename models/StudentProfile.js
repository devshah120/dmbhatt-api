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
    school: {
        type: String,
        required: true,
        trim: true
    },
    rollNo: {
        type: String,
        required: true,
        trim: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('StudentProfile', studentProfileSchema);
