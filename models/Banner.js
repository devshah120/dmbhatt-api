const mongoose = require('mongoose');

// Promotional banner shown as a popup when a student opens the app.
const BannerSchema = new mongoose.Schema({
    title: {
        type: String,
        default: ''
    },
    image: {
        type: String, // Relative upload path, e.g. "uploads/banners/123-offer.png"
        required: true
    },
    link: {
        type: String, // Optional URL opened when the student taps the banner
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

BannerSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Banner', BannerSchema);
