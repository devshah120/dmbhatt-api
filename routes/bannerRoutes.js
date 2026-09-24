const express = require('express');
const router = express.Router();
const multer = require('multer');
const bannerController = require('../controllers/bannerController');
const { createDiskStorage } = require('../config/uploadConfig');
const { protect } = require('../middleware/authMiddleware');

const upload = multer({
    storage: createDiskStorage('banners'),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed'), false);
        }
    }
});

// Both admin roles manage banners from the admin panel.
const adminPanelOnly = (req, res, next) => {
    if (!req.user || !['admin', 'super admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

// Student app
router.get('/active', bannerController.getActiveBanners);

// Admin panel
router.get('/all', protect, adminPanelOnly, bannerController.getAllBanners);
router.post('/create', protect, adminPanelOnly, upload.single('image'), bannerController.createBanner);
router.put('/update/:id', protect, adminPanelOnly, upload.single('image'), bannerController.updateBanner);
router.delete('/delete/:id', protect, adminPanelOnly, bannerController.deleteBanner);

module.exports = router;
