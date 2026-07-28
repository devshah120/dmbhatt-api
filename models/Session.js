const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    token: {
        type: String,
        required: true,
        unique: true
    },
    deviceId: {
        type: String,
        default: 'unknown'
    },
    // Human-readable label shown to the student and in the admin panel
    // (e.g. "Samsung SM-G991B" / "iPhone 14 Pro").
    deviceName: {
        type: String,
        default: ''
    },
    platform: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

// Index for performance and TTL
sessionSchema.index({ userId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired sessions

// Device-limit counting reads active sessions per user, and login looks up the
// current device's session to reuse its slot.
sessionSchema.index({ userId: 1, isActive: 1 });
sessionSchema.index({ userId: 1, deviceId: 1, isActive: 1 });

module.exports = mongoose.model('Session', sessionSchema);
