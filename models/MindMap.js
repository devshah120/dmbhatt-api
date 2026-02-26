const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    children: [this] // Recursive children
}, { _id: false });

const MindMapSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    unit: { type: String, required: true },
    title: { type: String, required: true },
    std: { type: String, required: true },
    data: {
        name: { type: String, required: true },
        children: { type: Array, default: [] }
    }
}, { timestamps: true });

module.exports = mongoose.model('MindMap', MindMapSchema);
