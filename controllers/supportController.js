const SupportTicket = require('../models/SupportTicket');

exports.createSupportTicket = async (req, res) => {
    try {
        const { category, description } = req.body;
        const userId = req.user._id;

        if (!category || !description) {
            return res.status(400).json({ message: 'Category and description are required' });
        }

        let screenshotPath = null;
        if (req.file) {
            // Clean path separation for saving
            screenshotPath = `uploads/support/${req.file.filename}`;
        }

        const ticket = new SupportTicket({
            userId,
            category,
            description,
            screenshotPath
        });

        await ticket.save();

        res.status(201).json({
            message: 'Support ticket submitted successfully',
            ticket
        });
    } catch (error) {
        console.error('Error creating support ticket:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getSupportTickets = async (req, res) => {
    try {
        const userId = req.user._id;
        const tickets = await SupportTicket.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json(tickets);
    } catch (error) {
        console.error('Error fetching support tickets:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
