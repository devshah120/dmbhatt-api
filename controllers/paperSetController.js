const PaperSet = require('../models/PaperSet');

exports.createPaperSet = async (req, res) => {
    try {
        const { examName, date, subject, medium, standard, stream } = req.body;

        const newPaperSet = new PaperSet({
            examName,
            date,
            subject,
            medium,
            standard,
            stream
        });

        await newPaperSet.save();

        res.status(201).json({ message: 'Paper Set created successfully', paperSet: newPaperSet });
    } catch (error) {
        console.error('Error creating paper set:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getAllPaperSets = async (req, res) => {
    try {
        // Sort by date descending
        const paperSets = await PaperSet.find().sort({ date: -1 });
        res.status(200).json(paperSets);
    } catch (error) {
        console.error('Error fetching paper sets:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const PaperSetLog = require('../models/PaperSetLog');

exports.updatePaperSetStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, performedBy } = req.body; // performedBy maps to createdBy

        const updatedPaperSet = await PaperSet.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!updatedPaperSet) {
            return res.status(404).json({ message: 'Paper set not found' });
        }

        // Create Log Entry
        const newLog = new PaperSetLog({
            paperSetId: updatedPaperSet._id,
            examName: updatedPaperSet.examName,
            action: `Updated Status to ${status}`,
            status: status,
            createdBy: performedBy || 'Unknown',
            updatedBy: performedBy || 'Unknown'
        });
        await newLog.save();

        res.status(200).json({ message: 'Status updated successfully', paperSet: updatedPaperSet });
    } catch (error) {
        console.error('Error updating paper set status:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getPaperSetLogs = async (req, res) => {
    try {
        // Sort by createdAt descending
        const logs = await PaperSetLog.find().sort({ createdAt: -1 });
        res.status(200).json(logs);
    } catch (error) {
        console.error('Error fetching paper set logs:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.editPaperSet = async (req, res) => {
    const { id } = req.params;
    const { examName, date, std, totalMarks, endTime, startTime, stream } = req.body;

    // Build update object
    const updateData = {};
    if (examName) updateData.examName = examName;
    if (date) updateData.date = date;
    if (std) updateData.standard = std;
    if (totalMarks) updateData.totalMarks = totalMarks;
    if (endTime) updateData.endTime = endTime;
    if (startTime) updateData.startTime = startTime;
    if (stream) updateData.stream = stream;

    try {
        const paperSet = await PaperSet.findByIdAndUpdate(id, updateData, { new: true });
        if (!paperSet) {
            return res.status(404).json({ message: 'Paper Set not found' });
        }
        res.status(200).json({ message: 'Paper Set updated successfully', paperSet });
    } catch (err) {
        console.error('Edit Paper Set Error:', err);
        res.status(500).json({ message: 'Failed to update paper set' });
    }
};

exports.deletePaperSet = async (req, res) => {
    const { id } = req.params;
    try {
        const paperSet = await PaperSet.findByIdAndDelete(id);
        if (!paperSet) {
            return res.status(404).json({ message: 'Paper Set not found' });
        }
        res.status(200).json({ message: 'Paper Set deleted successfully' });
    } catch (err) {
        console.error('Delete Paper Set Error:', err);
        res.status(500).json({ message: 'Failed to delete paper set' });
    }
};
