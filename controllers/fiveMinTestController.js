const FiveMinTest = require('../models/FiveMinTest');

// Create Test
const createTest = async (req, res) => {
    try {
        const test = new FiveMinTest(req.body);
        await test.save();
        res.status(201).json(test);
    } catch (err) {
        console.error('Create 5 Min Test Error:', err);
        res.status(500).json({ message: 'Failed to create test', error: err.message });
    }
};

// Get All Tests
const getAllTests = async (req, res) => {
    try {
        const tests = await FiveMinTest.find().sort({ createdAt: -1 });
        res.status(200).json(tests);
    } catch (err) {
        console.error('Get All 5 Min Tests Error:', err);
        res.status(500).json({ message: 'Failed to fetch tests', error: err.message });
    }
};

// Update Test
const updateTest = async (req, res) => {
    const { id } = req.params;
    try {
        const test = await FiveMinTest.findByIdAndUpdate(id, req.body, { new: true });
        if (!test) {
            return res.status(404).json({ message: 'Test not found' });
        }
        res.status(200).json(test);
    } catch (err) {
        console.error('Update 5 Min Test Error:', err);
        res.status(500).json({ message: 'Failed to update test', error: err.message });
    }
};

// Delete Test
const deleteTest = async (req, res) => {
    const { id } = req.params;
    try {
        await FiveMinTest.findByIdAndDelete(id);
        res.status(200).json({ message: 'Test deleted successfully' });
    } catch (err) {
        console.error('Delete 5 Min Test Error:', err);
        res.status(500).json({ message: 'Failed to delete test', error: err.message });
    }
};

module.exports = {
    createTest,
    getAllTests,
    updateTest,
    deleteTest
};
