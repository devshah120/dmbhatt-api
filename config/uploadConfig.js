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

// Storage configuration
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        // Determine folder based on field name
        let folder = 'others';
        if (file.fieldname === 'photo') {
            folder = 'photos';
        } else if (file.fieldname === 'aadharFile') {
            folder = 'aadhar';
        }

        return {
            folder: folder,
            allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
            public_id: Date.now() + '-' + path.parse(file.originalname).name
        };
    }
});

// File filter (optional redundant check as CloudinaryStorage has allowed_formats)
const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type'), false);
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
    cloudinary // Export specific instance if needed elsewhere
};
