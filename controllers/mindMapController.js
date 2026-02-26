const MindMap = require('../models/MindMap');

const createMindMap = async (req, res) => {
    try {
        const { subject, unit, title, std, data } = req.body;
        if (!subject || !unit || !title || !std || !data) {
            return res.status(400).json({ message: 'Subject, Unit, Title, Std, and Data are required' });
        }

        const mindMap = new MindMap({ subject, unit, title, std, data });
        await mindMap.save();
        res.status(201).json({ message: 'Mind Map created successfully', mindMap });
    } catch (err) {
        console.error('Create MindMap Error:', err);
        res.status(500).json({ message: 'Failed to create Mind Map' });
    }
};

const getAllMindMaps = async (req, res) => {
    try {
        const mindMaps = await MindMap.find().sort({ createdAt: -1 });
        res.status(200).json(mindMaps);
    } catch (err) {
        console.error('Get All MindMaps Error:', err);
        res.status(500).json({ message: 'Failed to fetch Mind Maps' });
    }
};

const deleteMindMap = async (req, res) => {
    try {
        const { id } = req.params;
        await MindMap.findByIdAndDelete(id);
        res.status(200).json({ message: 'Mind Map deleted successfully' });
    } catch (err) {
        console.error('Delete MindMap Error:', err);
        res.status(500).json({ message: 'Failed to delete Mind Map' });
    }
};

module.exports = {
    createMindMap,
    getAllMindMaps,
    deleteMindMap
};
