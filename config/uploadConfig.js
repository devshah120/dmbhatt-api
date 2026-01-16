const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Storage configuration for photos
const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/photos/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// Storage configuration for Aadhar documents
const aadharStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/aadhar/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// File filter for images
const imageFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, JPG, PNG) are allowed'));
    }
};

// File filter for documents (Aadhar)
const documentFilter = (req, file, cb) => {
    const allowedTypes = /pdf|jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF and image files are allowed for documents'));
    }
};

// Upload middleware configurations
const uploadPhoto = multer({
    storage: photoStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).single('photo');

const uploadAadhar = multer({
    storage: aadharStorage,
    fileFilter: documentFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).single('aadharFile');

// Combined upload for assistant (photo + aadhar)
const uploadAssistantFiles = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            if (file.fieldname === 'aadharFile') {
                cb(null, 'uploads/aadhar/');
            } else {
                cb(null, 'uploads/photos/');
            }
        },
        filename: (req, file, cb) => {
            const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        }
    }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and image files are allowed'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 }
}).single('aadharFile');

// Universal upload handler that accepts fields for any role
// This solves the issue where req.body is empty before multer runs
const uploadUniversal = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            if (file.fieldname === 'aadharFile') {
                cb(null, 'uploads/aadhar/');
            } else {
                cb(null, 'uploads/photos/');
            }
        },
        filename: (req, file, cb) => {
            const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        }
    }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and image files are allowed'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 }
}).fields([
    { name: 'photo', maxCount: 1 },
    { name: 'aadharFile', maxCount: 2 }
]);

module.exports = {
    uploadPhoto,
    uploadAadhar,
    uploadAssistantFiles,
    uploadUniversal
};
