const MindMap = require('../models/MindMap');
const ActivityLog = require('../models/ActivityLog');

const createMindMap = async (req, res) => {
    try {
        const { subject, unit, title, std, board, stream, data } = req.body;
        if (!subject || !unit || !title || !std || !data) {
            return res.status(400).json({ message: 'Subject, Unit, Title, Std, and Data are required' });
        }

        const mindMap = new MindMap({ subject, unit, title, std, board: board || 'GSEB', stream: stream || 'None', data });
        await mindMap.save();

        await ActivityLog.create({
            entityType: 'MindMap',
            action: 'Added',
            targetName: title,
            performedBy: req.query.performedBy || 'Admin App'
        });

        res.status(201).json({ message: 'Mind Map created successfully', mindMap });
    } catch (err) {
        console.error('Create MindMap Error:', err);
        res.status(500).json({ message: 'Failed to create Mind Map' });
    }
};

const getAllMindMaps = async (req, res) => {
    try {
        const { std, board, stream, subject } = req.query;
        let query = {};
        if (std) query.std = std;
        if (board) query.board = board;
        if (stream) query.stream = stream;
        if (subject) query.subject = subject;

        const mindMaps = await MindMap.find(query).sort({ createdAt: -1 });
        res.status(200).json(mindMaps);
    } catch (err) {
        console.error('Get All MindMaps Error:', err);
        res.status(500).json({ message: 'Failed to fetch Mind Maps' });
    }
};

const deleteMindMap = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await MindMap.findByIdAndDelete(id);
        
        if (deleted) {
            await ActivityLog.create({
                entityType: 'MindMap',
                action: 'Deleted',
                targetName: deleted.title,
                performedBy: req.query.performedBy || 'Admin App'
            });
        }

        res.status(200).json({ message: 'Mind Map deleted successfully' });
    } catch (err) {
        console.error('Delete MindMap Error:', err);
        res.status(500).json({ message: 'Failed to delete Mind Map' });
    }
};

const updateMindMap = async (req, res) => {
    try {
        const { id } = req.params;
        const { subject, unit, title, std, board, stream, data } = req.body;

        const updatedDoc = await MindMap.findByIdAndUpdate(
            id,
            { subject, unit, title, std, board: board || 'GSEB', stream: stream || 'None', data },
            { new: true, runValidators: true }
        );

        if (!updatedDoc) {
            return res.status(404).json({ message: 'Mind Map not found' });
        }

        await ActivityLog.create({
            entityType: 'MindMap',
            action: 'Updated',
            targetName: updatedDoc.title,
            performedBy: req.query.performedBy || 'Admin App'
        });

        res.status(200).json({ message: 'Mind Map updated successfully', mindMap: updatedDoc });
    } catch (err) {
        console.error('Update MindMap Error:', err);
        res.status(500).json({ message: 'Failed to update Mind Map' });
    }
};

module.exports = {
    createMindMap,
    getAllMindMaps,
    deleteMindMap,
    updateMindMap
};
