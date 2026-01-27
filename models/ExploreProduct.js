const mongoose = require('mongoose');

const ExploreProductSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    subject: {
        type: String, // Optional, e.g. for "Books" or "Diagrams" related to a subject
    },
    price: {
        type: Number,
        required: true
    },
    originalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    image: {
        type: String, // Cloudinary URL
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ExploreProduct', ExploreProductSchema);
