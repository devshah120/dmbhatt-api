const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/superAdminController');
const adminController = require('../controllers/adminController');

// Reports
router.get('/reports/exams', adminController.getExamReports);
router.get('/reports/students', adminController.getStudentWiseReports);

// Dashboard
router.get('/dashboard', ctrl.getSuperAdminDashboard);

// Students
router.get('/students/export', ctrl.getStudentsExport);
router.get('/students', ctrl.getStudents);
router.post('/students', ctrl.createStudent);
router.put('/students/:id', ctrl.updateStudent);
router.delete('/students/:id', ctrl.deleteStudent);

// Admins
router.get('/admins', ctrl.getAdmins);
router.post('/admins', ctrl.createAdmin);
router.put('/admins/:id', ctrl.updateAdmin);
router.delete('/admins/:id', ctrl.deleteAdmin);

// Standards
router.get('/standards', ctrl.getStandards);
router.post('/standards', ctrl.createStandard);
router.put('/standards/:id', ctrl.updateStandard);
router.delete('/standards/:id', ctrl.deleteStandard);

// Subjects
router.get('/subjects', ctrl.getSubjects);
router.post('/subjects', ctrl.createSubject);
router.put('/subjects/:id', ctrl.updateSubject);
router.delete('/subjects/:id', ctrl.deleteSubject);

// Chapters
router.get('/chapters', ctrl.getChapters);
router.post('/chapters', ctrl.createChapter);
router.put('/chapters/:id', ctrl.updateChapter);
router.delete('/chapters/:id', ctrl.deleteChapter);

// Payment Views
router.get('/payments', ctrl.getPayments);
router.get('/product-purchases', ctrl.getProductPurchases);
router.get('/plan-upgrades', ctrl.getPlanUpgrades);

// Config
router.get('/config/:type', ctrl.getConfig);
router.post('/config/:type', ctrl.saveConfig);

// Push Notifications
router.post('/push-notifications', ctrl.sendPushNotification);
router.post('/push-notifications/schedule', ctrl.scheduleNotification);
router.get('/scheduled-notifications', ctrl.getScheduledNotifications);
router.delete('/scheduled-notifications/:id', ctrl.deleteScheduledNotification);

// Birthday Notifications
router.get('/config/birthday-notification', ctrl.getBirthdayNotificationConfig);
router.post('/config/birthday-notification', ctrl.saveBirthdayNotificationConfig);

// Logs
router.get('/logs', ctrl.getLogs);

const { uploadUniversal } = require('../config/uploadConfig');

// Product Management
router.get('/products', ctrl.getProducts);
router.post('/products', uploadUniversal, ctrl.createProduct);
router.put('/products/:id', uploadUniversal, ctrl.updateProduct);
router.delete('/products/:id', ctrl.deleteProduct);

module.exports = router;
