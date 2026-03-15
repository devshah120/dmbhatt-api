const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Creates a disk storage object for a specific folder.
 * Ensures the folder exists within the 'uploads/' directory.
 */
const createDiskStorage = (folderName) => {
    const uploadDir = path.join('uploads', folderName);
    
    // Ensure the directory exists
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    return multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            // Clean filename to avoid issues
            const cleanName = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9]/g, '_');
            const uniqueSuffix = `${Date.now()}-${cleanName}${path.extname(file.originalname)}`;
            cb(null, uniqueSuffix);
        }
    });
};

// Generic storage that determines folder based on fieldname
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'others';
        if (file.fieldname === 'photo') {
            folder = 'photos';
        } else if (file.fieldname === 'aadharFile') {
            folder = 'aadhar';
        } else if (file.fieldname === 'image') {
            folder = 'products'; // Used by explore/media
        } else if (file.fieldname === 'file') {
            folder = 'materials';
        } else if (file.fieldname === 'images') {
            folder = 'events';
        }
        
        const uploadPath = path.join('uploads', folder);
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const cleanName = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9]/g, '_');
        const uniqueSuffix = `${Date.now()}-${cleanName}${path.extname(file.originalname)}`;
        cb(null, uniqueSuffix);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowed = [
        'image/jpeg', 
        'image/png', 
        'image/jpg', 
        'application/pdf', 
        'image/webp', 
        'image/gif', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        'application/vnd.ms-excel'
    ];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type: ' + file.mimetype), false);
    }
};

const uploadUniversal = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).fields([
    { name: 'photo', maxCount: 1 },
    { name: 'aadharFile', maxCount: 5 },
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'images', maxCount: 10 }
]);

module.exports = {
    uploadUniversal,
    storage,
    createDiskStorage
};
