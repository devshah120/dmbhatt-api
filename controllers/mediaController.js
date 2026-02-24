const { cloudinary } = require('../config/uploadConfig');

/**
 * Upload Image to Cloudinary and return URL
 * This is a generic endpoint used by Exam and FiveMinTest modules
 */
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided' });
        }

        // Multer-storage-cloudinary automatically uploads the file and puts the URL in req.file.path
        const imageUrl = req.file.path;

        res.status(200).json({
            message: 'Image uploaded successfully',
            imageUrl: imageUrl
        });
    } catch (err) {
        console.error('Media Upload Error:', err);
        res.status(500).json({ message: 'Failed to upload image', error: err.message });
    }
};

module.exports = {
    uploadImage
};
