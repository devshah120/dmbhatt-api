const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

// Define API routes
router.post('/add', gameController.addGameQuestion);
router.get('/:gameType', gameController.getGameQuestions);
router.get('/', gameController.getAllGameQuestions);

module.exports = router;
