const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['BoardPaper', 'SchoolPaper', 'ImageMaterial']
    },
    title: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    medium: {
        type: String,
        required: function () { return ['BoardPaper', 'SchoolPaper', 'ImageMaterial'].includes(this.type); }
    },
    standard: {
        type: String,
        required: function () { return ['BoardPaper', 'SchoolPaper', 'ImageMaterial'].includes(this.type); }
    },
    stream: {
        type: String,
        default: 'None'
    },
    year: {
        type: String,
        required: function () { return ['BoardPaper', 'SchoolPaper', 'ImageMaterial'].includes(this.type); }
    },
    schoolName: {
        type: String,
        required: function () { return this.type === 'SchoolPaper'; }
    },
    unit: {
        type: String,
        required: function () { return this.type === 'ImageMaterial'; }
    },
    file: {
        type: String, // Cloudinary URL
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Material', MaterialSchema);
