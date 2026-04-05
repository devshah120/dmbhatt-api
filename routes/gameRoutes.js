const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const multer = require('multer');

// Excel Upload (Memory Storage)
const uploadExcel = multer({ storage: multer.memoryStorage() });

const { protect } = require('../middleware/authMiddleware');

// Define API routes
router.get('/types', gameController.getGameTypes);
router.post('/add', protect, gameController.addGameQuestion);
router.post('/import', protect, uploadExcel.single('file'), gameController.importGameQuestions);
router.get('/:gameType', gameController.getGameQuestions);
router.get('/', gameController.getAllGameQuestions);
router.put('/edit/:id', protect, gameController.editGameQuestion);
router.delete('/delete/:id', protect, gameController.deleteGameQuestion);

module.exports = router;
