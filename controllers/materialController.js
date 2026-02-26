const Material = require('../models/Material');

exports.uploadBoardPaper = async (req, res) => {
    try {
        const { title, medium, standard, stream, year, subject } = req.body;

        if (!req.files || !req.files['file']) {
            return res.status(400).json({ message: 'File is required' });
        }

        const fileUrl = req.files['file'][0].path;

        const newMaterial = new Material({
            type: 'BoardPaper',
            title,
            medium,
            standard,
            stream: stream || 'None',
            year,
            subject,
            file: fileUrl
        });

        await newMaterial.save();
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

        const fileUrl = req.files['file'][0].path;

        const newMaterial = new Material({
            type: 'SchoolPaper',
            title,
            subject,
            medium,
            standard,
            year,
            schoolName,
            file: fileUrl
        });

        await newMaterial.save();
        res.status(201).json({ message: 'School Paper uploaded successfully', material: newMaterial });
    } catch (error) {
        console.error('Error uploading school paper:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.uploadImageMaterial = async (req, res) => {
    try {
        const { title, subject, unit, medium, standard, year, schoolName } = req.body;

        if (!req.files || !req.files['file']) {
            return res.status(400).json({ message: 'File is required' });
        }

        const fileUrl = req.files['file'][0].path;

        const newMaterial = new Material({
            type: 'ImageMaterial',
            title,
            subject,
            unit,
            medium,
            standard,
            year,
            schoolName,
            file: fileUrl
        });

        await newMaterial.save();
        res.status(201).json({ message: 'Image Material uploaded successfully', material: newMaterial });
    } catch (error) {
        console.error('Error uploading image material:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getAllMaterials = async (req, res) => {
    try {
        const { type } = req.query;
        const filter = type ? { type } : {};
        const materials = await Material.find(filter).sort({ createdAt: -1 });
        res.status(200).json(materials);
    } catch (error) {
        console.error('Error fetching materials:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.deleteMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const material = await Material.findByIdAndDelete(id);

        if (!material) {
            return res.status(404).json({ message: 'Material not found' });
        }

        // Note: For production, we should also delete the file from Cloudinary here.
        // cloudinary.uploader.destroy(public_id);

        res.status(200).json({ message: 'Material deleted successfully' });
    } catch (error) {
        console.error('Error deleting material:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
