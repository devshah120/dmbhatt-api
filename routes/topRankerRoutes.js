const express = require('express');
const router = express.Router();
const topRankerController = require('../controllers/topRankerController');

router.post('/create', topRankerController.createRanker);
router.get('/all', topRankerController.getAllRankers);
router.put('/update/:id', topRankerController.updateRanker);
router.delete('/delete/:id', topRankerController.deleteRanker);

module.exports = router;
