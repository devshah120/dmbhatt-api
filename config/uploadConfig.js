const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('[DEBUG] Cloudinary Configured with Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);

// Storage configuration
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        try {
            // Determine folder based on field name
            let folder = 'others';
            if (file.fieldname === 'photo') {
                folder = 'photos';
            } else if (file.fieldname === 'aadharFile') {
                folder = 'aadhar';
            } else if (file.fieldname === 'image') {
                folder = 'exam_images';
            }

            // Clean filename to avoid issues with special characters
            const cleanName = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9]/g, '_');
            const publicId = `${Date.now()}-${cleanName}`;

            return {
                folder: folder,
                allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'webp', 'gif'],
                public_id: publicId
            };
        } catch (error) {
            console.error('Cloudinary Storage Param Error:', error);
            throw error;
        }
    }
});

// File filter (optional redundant check as CloudinaryStorage has allowed_formats)
const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type: ' + file.mimetype), false);
    }
};

const uploadUniversal = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).fields([
    { name: 'photo', maxCount: 1 },
    { name: 'aadharFile', maxCount: 5 }
]);

module.exports = {
    uploadUniversal,
    storage, // Exported storage for use in other routes (e.g., eventRoutes)
    cloudinary
};
