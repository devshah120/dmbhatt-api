const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { uploadUniversal } = require('../config/uploadConfig');

// Add Student - with image upload support (using 'image' field)
// Note: Frontend sends 'image', uploadConfig handles 'photo'. We might need to adjust config or frontend.
// Implementation Plan said: "handles photo file". ApiService sends 'image'.
// Let's create a specific upload middleware or just use uploadUniversal but we need to match field definitions.
// uploadUniversal fields: 'photo', 'aadharFile'. 
// I will start by using uploadUniversal but I might need to tell multer to accept 'image'.
// Actually, easier to change Frontend to send 'photo' OR update backend config.
// Since I can't easily change backend config reuse without affecting others, I'll update frontend `api_service` to send 'photo' 
// OR simpler: Create a local multer middleware here matching frontend.
const multer = require('multer');
const { cloudinary } = require('../config/uploadConfig');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'students',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        public_id: (req, file) => Date.now() + '-' + path.parse(file.originalname).name
    }
});
const uploadStudent = multer({ storage: storage }).fields([{ name: 'image', maxCount: 1 }]);

// Excel Upload (Memory Storage)
const uploadExcel = multer({ storage: multer.memoryStorage() });

router.post('/add-student', uploadStudent, adminController.addStudent);
router.post('/import-students', uploadExcel.single('file'), adminController.importStudents);
router.get('/all-students', adminController.getAllStudents);
router.put('/edit-student/:id', uploadStudent, adminController.editStudent);
router.delete('/delete-student/:id', adminController.deleteStudent);
router.post('/add-assistant', express.json(), adminController.addAssistant);
router.get('/all-assistants', adminController.getAllAssistants);
router.put('/edit-assistant/:id', express.json(), adminController.editAssistant);
router.delete('/delete-assistant/:id', adminController.deleteAssistant);

module.exports = router;
