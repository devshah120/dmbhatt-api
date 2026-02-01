const express = require('express');
const router = express.Router();
const paperSetController = require('../controllers/paperSetController');

router.post('/create', paperSetController.createPaperSet);
router.get('/all', paperSetController.getAllPaperSets);
router.put('/update-status/:id', paperSetController.updatePaperSetStatus);
router.get('/logs', paperSetController.getPaperSetLogs);
router.put('/edit-paperset/:id', paperSetController.editPaperSet);
router.delete('/delete-paperset/:id', paperSetController.deletePaperSet);

module.exports = router;
