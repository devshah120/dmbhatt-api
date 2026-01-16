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
        type: [String],
        required: true,
        validate: [arrayLimit, '{PATH} exceeds the limit of 2']
    }
}, {
    timestamps: true
});

function arrayLimit(val) {
    return val.length <= 2;
}

module.exports = mongoose.model('AssistantProfile', assistantProfileSchema);
