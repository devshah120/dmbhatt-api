const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const multer = require('multer');

// Excel Upload (Memory Storage)
const uploadExcel = multer({ storage: multer.memoryStorage() });

// Define API routes
router.get('/types', gameController.getGameTypes);
router.post('/add', gameController.addGameQuestion);
router.post('/import', uploadExcel.single('file'), gameController.importGameQuestions);
router.get('/:gameType', gameController.getGameQuestions);
router.get('/', gameController.getAllGameQuestions);
router.put('/edit/:id', gameController.editGameQuestion);
router.delete('/delete/:id', gameController.deleteGameQuestion);

module.exports = router;
