const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['BoardPaper', 'SchoolPaper', 'ImageMaterial', 'Notes']
    },
    title: {
        type: String,
        required: true
    },
    orderIndex: { type: Number, default: 1 },
    subject: {
        type: String,
        required: true
    },
    medium: {
        type: String,
        required: function () { return ['BoardPaper', 'SchoolPaper', 'ImageMaterial', 'Notes'].includes(this.type); }
    },
    standard: {
        type: String,
        required: function () { return ['BoardPaper', 'SchoolPaper', 'ImageMaterial', 'Notes'].includes(this.type); }
    },
    board: {
        type: String,
        required: function () { return ['BoardPaper', 'SchoolPaper', 'ImageMaterial'].includes(this.type); },
        default: 'GSEB'
    },
    stream: {
        type: String,
        default: 'None'
    },
    year: {
        type: String,
        required: function () { return ['BoardPaper', 'SchoolPaper', 'ImageMaterial', 'Notes'].includes(this.type); }
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
    isDeleted: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date
    },
    deletedAt: {
        type: Date
    }
});

module.exports = mongoose.model('Material', MaterialSchema);
