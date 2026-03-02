const express = require('express');
const router = express.Router();
const mindMapController = require('../controllers/mindMapController');

router.post('/add', mindMapController.createMindMap);
router.get('/all', mindMapController.getAllMindMaps);
router.delete('/:id', mindMapController.deleteMindMap);
router.put('/:id', mindMapController.updateMindMap);

module.exports = router;
