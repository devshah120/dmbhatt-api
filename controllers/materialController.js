const Material = require('../models/Material');
const ActivityLog = require('../models/ActivityLog');

exports.uploadBoardPaper = async (req, res) => {
    try {
        const { title, medium, standard, stream, year, subject } = req.body;

        if (!req.files || !req.files['file']) {
            return res.status(400).json({ message: 'File is required' });
        }

        const fileUrl = req.files['file'][0].path.replace(/\\/g, '/');

        const newMaterial = new Material({
            type: 'BoardPaper',
            title,
            medium,
            standard,
            board: req.body.board || 'GSEB',
            stream: stream || 'None',
            year,
            subject,
            file: fileUrl,
            createdBy: req.user?._id
        });

        await newMaterial.save();

        await ActivityLog.create({
            entityType: 'Material',
            action: 'Added',
            targetName: title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(201).json({ message: 'Board Paper uploaded successfully', material: newMaterial });
    } catch (error) {
        console.error('Error uploading board paper:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.uploadSchoolPaper = async (req, res) => {
    try {
        const { title, subject, medium, standard, year, schoolName } = req.body;

        if (!req.files || !req.files['file']) {
            return res.status(400).json({ message: 'File is required' });
        }

        const fileUrl = req.files['file'][0].path.replace(/\\/g, '/');

        const newMaterial = new Material({
            type: 'SchoolPaper',
            title,
            subject,
            medium,
            standard,
            board: req.body.board || 'GSEB',
            stream: req.body.stream || 'None',
            year,
            schoolName,
            file: fileUrl,
            createdBy: req.user?._id
        });

        await newMaterial.save();

        await ActivityLog.create({
            entityType: 'Material',
            action: 'Added',
            targetName: title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(201).json({ message: 'School Paper uploaded successfully', material: newMaterial });
    } catch (error) {
        console.error('Error uploading school paper:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.uploadNotes = async (req, res) => {
    try {
        const { title, board, standard, medium, stream, subject, year } = req.body;

        if (!req.files || !req.files['file']) {
            return res.status(400).json({ message: 'File is required' });
        }

        const fileUrl = req.files['file'][0].path.replace(/\\/g, '/');

        const newMaterial = new Material({
            type: 'Notes',
            title,
            board: board || 'GSEB',
            standard,
            medium,
            stream: stream || 'None',
            subject,
            year,
            file: fileUrl,
            createdBy: req.user?._id
        });

        await newMaterial.save();

        await ActivityLog.create({
            entityType: 'Material',
            action: 'Added',
            targetName: title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(201).json({ message: 'Notes uploaded successfully', material: newMaterial });
    } catch (error) {
        console.error('Error uploading notes:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.uploadImageMaterial = async (req, res) => {
    try {
        const { title, subject, unit, medium, standard, year, schoolName } = req.body;

        if (!req.files || !req.files['file']) {
            return res.status(400).json({ message: 'File is required' });
        }

        const fileUrl = req.files['file'][0].path.replace(/\\/g, '/');

        const newMaterial = new Material({
            type: 'ImageMaterial',
            title,
            subject,
            unit,
            medium,
            standard,
            board: req.body.board || 'GSEB',
            stream: req.body.stream || 'None',
            year,
            schoolName,
            file: fileUrl,
            createdBy: req.user?._id
        });

        await newMaterial.save();

        await ActivityLog.create({
            entityType: 'Material',
            action: 'Added',
            targetName: title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(201).json({ message: 'Image Material uploaded successfully', material: newMaterial });
    } catch (error) {
        console.error('Error uploading image material:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getAllMaterials = async (req, res) => {
    try {
        const { type, standard, std, medium, board, stream, subject, year, skip = 0, limit = 10 } = req.query;
        let filter = { isDeleted: { $ne: true } };

        if (type) filter.type = type;
        if (standard || std) filter.standard = standard || std;

        // If medium is not provided explicitly, use the logged-in user's medium
        let userMedium = medium;
        if (!userMedium && req.user) {
            const StudentProfile = require('../models/StudentProfile');
            const profile = await StudentProfile.findOne({ userId: req.user._id });
            if (profile) {
                userMedium = profile.medium;
            }
        }
        if (userMedium) filter.medium = userMedium;

        if (board) filter.board = board;
        if (stream && stream !== 'None' && stream !== '-') filter.stream = stream;
        if (subject) filter.subject = subject;
        if (year) filter.year = year;

        const skipNum = parseInt(skip) || 0;
        const limitNum = parseInt(limit) || 10;

        const materials = await Material.find(filter)
            .populate('createdBy', 'firstName email phoneNum')
            .populate('updatedBy', 'firstName email phoneNum')
            .sort({ createdAt: -1 });

        res.status(200).json(materials);
    } catch (error) {
        console.error('Error fetching materials:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.deleteMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const material = await Material.findByIdAndUpdate(id, { 
            isDeleted: true, 
            deletedBy: req.user._id,
            deletedAt: Date.now()
        });

        if (!material) {
            return res.status(404).json({ message: 'Material not found' });
        }

        await ActivityLog.create({
            entityType: 'Material',
            action: 'Deleted',
            targetName: material.title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        // Note: For production, we should also delete the file from Cloudinary here.
        // cloudinary.uploader.destroy(public_id);

        res.status(200).json({ message: 'Material deleted successfully' });
    } catch (error) {
        console.error('Error deleting material:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.updateMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subject, medium, standard, board, stream, year, schoolName, unit, type } = req.body;

        let updateData = {
            title,
            subject,
            medium,
            standard,
            board: board || 'GSEB',
            stream: stream || 'None',
            year,
            schoolName,
            unit,
            updatedBy: req.user._id,
            updatedAt: Date.now()
        };

        if (req.files && req.files['file']) {
            updateData.file = req.files['file'][0].path.replace(/\\/g, '/');
        }

        const material = await Material.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

        if (!material) {
            return res.status(404).json({ message: 'Material not found' });
        }

        await ActivityLog.create({
            entityType: 'Material',
            action: 'Updated',
            targetName: material.title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(200).json({ message: 'Material updated successfully', material });
    } catch (error) {
        console.error('Error updating material:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
