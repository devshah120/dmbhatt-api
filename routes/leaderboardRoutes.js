const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const { protect } = require('../middleware/authMiddleware');

// Get leaderboard for a specific standard
router.get('/:std', protect, leaderboardController.getLeaderboardByStandard);

module.exports = router;
