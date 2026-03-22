const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/superAdminController');

// Dashboard
router.get('/dashboard', ctrl.getSuperAdminDashboard);

// Students
router.get('/students', ctrl.getStudents);

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

module.exports = router;
