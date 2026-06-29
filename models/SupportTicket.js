const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    screenshotPath: {
        type: String,
        default: null
    },
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'In Progress', 'Resolved'],
        default: 'Pending'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
