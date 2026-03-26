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
const { createDiskStorage } = require('../config/uploadConfig');
const path = require('path');

const storage = createDiskStorage('students');
const uploadStudent = multer({ storage: storage }).fields([{ name: 'image', maxCount: 1 }]);

// Excel Upload (Memory Storage)
const uploadExcel = multer({ storage: multer.memoryStorage() });

router.post('/add-student', uploadStudent, adminController.addStudent);
router.post('/import-students', uploadExcel.single('file'), adminController.importStudents);
router.get('/all-students', adminController.getAllStudents);
router.put('/edit-student/:id', uploadStudent, adminController.editStudent);
router.delete('/delete-student/:id', adminController.deleteStudent);
router.get('/dashboard-stats', adminController.getDashboardStats);
router.get('/dashboard/standard-stats/:standard', adminController.getStandardDetailedStats);
router.get('/exam-reports', adminController.getExamReports);
router.get('/student-reports', adminController.getStudentWiseReports);
router.get('/refer-earn-report', adminController.getReferEarnReport);
router.get('/upgrade-plan-report', adminController.getUpgradePlanReport);

// Redeem Codes
router.post('/generate-redeem-code', adminController.generateRedeemCode);
router.get('/redeem-codes', adminController.getRedeemCodes);
router.delete('/delete-redeem-code/:id', adminController.deleteRedeemCode);

// Leaderboard
router.get('/leaderboard', adminController.getAdminLeaderboard);
router.post('/toggle-gift-status', adminController.toggleStudentGiftStatus);

module.exports = router;
