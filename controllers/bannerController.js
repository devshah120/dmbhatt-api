const Banner = require('../models/Banner');
const fs = require('fs');

const toPath = (file) => file.path.replace(/\\/g, '/');

// Removes a previously uploaded local file; Cloudinary/absolute URLs are left alone.
const removeFile = (filePath) => {
    if (!filePath || /^https?:\/\//i.test(filePath)) return;
    fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') console.error('Failed to delete banner image:', err);
    });
};

// Multipart form values arrive as strings.
const parseBool = (value) => value === true || value === 'true';

// Get active banners (student app)
exports.getActiveBanners = async (req, res) => {
    try {
        const banners = await Banner.find({ isActive: true }).sort({ createdAt: -1 });
        res.status(200).json(banners);
    } catch (error) {
        console.error('Error fetching active banners:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get all banners (admin)
exports.getAllBanners = async (req, res) => {
    try {
        const banners = await Banner.find().sort({ createdAt: -1 });
        res.status(200).json(banners);
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Create banner
exports.createBanner = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Banner image is required' });
        }

        const { title, link, isActive } = req.body;
        const banner = new Banner({
            title: title || '',
            link: link || '',
            isActive: isActive === undefined ? true : parseBool(isActive),
            image: toPath(req.file)
        });

        await banner.save();
        res.status(201).json({ message: 'Banner created successfully', banner });
    } catch (error) {
        console.error('Error creating banner:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update banner (image optional)
exports.updateBanner = async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) {
            if (req.file) removeFile(toPath(req.file));
            return res.status(404).json({ message: 'Banner not found' });
        }

        const { title, link, isActive } = req.body;
        if (title !== undefined) banner.title = title;
        if (link !== undefined) banner.link = link;
        if (isActive !== undefined) banner.isActive = parseBool(isActive);

        if (req.file) {
            removeFile(banner.image);
            banner.image = toPath(req.file);
        }

        await banner.save();
        res.status(200).json({ message: 'Banner updated successfully', banner });
    } catch (error) {
        console.error('Error updating banner:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Delete banner
exports.deleteBanner = async (req, res) => {
    try {
        const banner = await Banner.findByIdAndDelete(req.params.id);
        if (!banner) {
            return res.status(404).json({ message: 'Banner not found' });
        }
        removeFile(banner.image);
        res.status(200).json({ message: 'Banner deleted successfully' });
    } catch (error) {
        console.error('Error deleting banner:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
