const express = require('express');
const router = express.Router();
const mindMapController = require('../controllers/mindMapController');
const { protect } = require('../middleware/authMiddleware');

router.post('/add', protect, mindMapController.createMindMap);
router.get('/all', mindMapController.getAllMindMaps);
router.delete('/:id', protect, mindMapController.deleteMindMap);
router.put('/:id', protect, mindMapController.updateMindMap);

module.exports = router;
