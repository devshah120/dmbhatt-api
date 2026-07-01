const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public routes (for student app) - must come first to avoid route conflicts
router.get('/active', planController.getActivePlans);

// Admin routes - specific routes before /:standard to avoid conflicts
router.post('/bulk-update', protect, adminOnly, planController.bulkUpdatePlans);
router.post('/initialize-default', protect, adminOnly, planController.initializeDefaultPlans);

// General admin routes
router.get('/', planController.getAllPlans);
router.post('/', protect, adminOnly, planController.createOrUpdatePlan);

// Single standard routes - must come last
router.get('/:standard', planController.getPlanByStandard);
router.delete('/:standard', protect, adminOnly, planController.deletePlan);

module.exports = router;
