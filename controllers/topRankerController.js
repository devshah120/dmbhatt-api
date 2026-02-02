const TopRanker = require('../models/TopRanker');

// Create Ranker
const createRanker = async (req, res) => {
    try {
        const ranker = new TopRanker(req.body);
        await ranker.save();
        res.status(201).json(ranker);
    } catch (err) {
        console.error('Create Top Ranker Error:', err);
        res.status(500).json({ message: 'Failed to create ranker', error: err.message });
    }
};

// Get All Rankers
const getAllRankers = async (req, res) => {
    try {
        const rankers = await TopRanker.find().sort({ createdAt: -1 });
        res.status(200).json(rankers);
    } catch (err) {
        console.error('Get All Top Rankers Error:', err);
        res.status(500).json({ message: 'Failed to fetch rankers', error: err.message });
    }
};

// Update Ranker
const updateRanker = async (req, res) => {
    const { id } = req.params;
    try {
        const ranker = await TopRanker.findByIdAndUpdate(id, req.body, { new: true });
        if (!ranker) {
            return res.status(404).json({ message: 'Ranker not found' });
        }
        res.status(200).json(ranker);
    } catch (err) {
        console.error('Update Top Ranker Error:', err);
        res.status(500).json({ message: 'Failed to update ranker', error: err.message });
    }
};

// Delete Ranker
const deleteRanker = async (req, res) => {
    const { id } = req.params;
    try {
        await TopRanker.findByIdAndDelete(id);
        res.status(200).json({ message: 'Ranker deleted successfully' });
    } catch (err) {
        console.error('Delete Top Ranker Error:', err);
        res.status(500).json({ message: 'Failed to delete ranker', error: err.message });
    }
};

module.exports = {
    createRanker,
    getAllRankers,
    updateRanker,
    deleteRanker
};
