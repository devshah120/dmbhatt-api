const mongoose = require('mongoose');

const assistantProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    aadharNum: {
        type: String,
        required: true,
        trim: true
    },
    aadharFilePath: {
        type: String,
        required: true,
        trim: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AssistantProfile', assistantProfileSchema);
