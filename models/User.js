const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    role: {
        type: String,
        required: true,
        enum: ['admin', 'assistant', 'student', 'guest']
    },
    // Common fields
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    middleName: {
        type: String,
        trim: true
    },
    lastName: {
        type: String,
        trim: true
    },
    phoneNum: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        lowercase: true,
        trim: true,
        sparse: true // Allows multiple null values (for students/guests without email)
    },
    loginCodeHash: {
        type: String,
        required: true
    },
    // Optional fields
    photoPath: {
        type: String // For student and guest
    },
    address: {
        street: String,
        city: String,
        state: String,
        pincode: String
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for role only (phoneNum and email already indexed)
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
