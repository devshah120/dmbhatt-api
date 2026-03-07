const mongoose = require('mongoose');

const assistantProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    specialization: {
        type: String,
        required: false,
        trim: true
    },
    qualifications: {
        type: String,
        required: false,
        trim: true
    },
    experience: {
        type: Number,
        required: false,
        default: 0
    },
    bio: {
        type: String,
        required: false,
        trim: true
    },
    hourlyRate: {
        type: Number,
        required: false,
        default: 0
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    totalRewardPoints: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AssistantProfile', assistantProfileSchema);
