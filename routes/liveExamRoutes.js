const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/liveExamController');
const { protect } = require('../middleware/authMiddleware');

const STAFF_ROLES = ['admin', 'super admin'];

const staffOnly = (req, res, next) => {
    if (!STAFF_ROLES.includes(req.user?.role)) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

// Guests share one mock identity, so they cannot hold a queue place or an attempt.
const studentOnly = (req, res, next) => {
    if (req.user?.role !== 'student') {
        return res.status(403).json({ message: 'Live Arena is available to registered students only' });
    }
    next();
};

// Admin / assistant management
router.get('/admin/all', protect, staffOnly, ctrl.getAllLiveExamsAdmin);
router.post('/admin/create', protect, staffOnly, ctrl.createLiveExam);
router.put('/admin/update/:id', protect, staffOnly, ctrl.updateLiveExam);
router.put('/admin/:id/publish', protect, staffOnly, ctrl.publishLiveExam);
router.put('/admin/:id/cancel', protect, staffOnly, ctrl.cancelLiveExam);
router.delete('/admin/delete/:id', protect, staffOnly, ctrl.deleteLiveExam);
router.get('/admin/:id/queue', protect, staffOnly, ctrl.getQueueAdmin);
router.get('/admin/:id/participants', protect, staffOnly, ctrl.getParticipantsAdmin);
router.get('/admin/:id', protect, staffOnly, ctrl.getLiveExamAdmin);

// Student
router.get('/student/list', protect, studentOnly, ctrl.listForStudent);
router.put('/attempt/:attemptId/answers', protect, studentOnly, ctrl.saveAnswers);
router.post('/attempt/:attemptId/submit', protect, studentOnly, ctrl.submitAttempt);
router.post('/:id/queue', protect, studentOnly, ctrl.joinQueue);
router.delete('/:id/queue', protect, studentOnly, ctrl.leaveQueue);
router.post('/:id/start', protect, studentOnly, ctrl.startAttempt);
router.get('/:id/my-result', protect, studentOnly, ctrl.getMyResult);

// Both (student access is limited to exams for their class)
router.get('/:id/leaderboard', protect, ctrl.getLeaderboard);
router.get('/:id', protect, studentOnly, ctrl.getForStudent);

module.exports = router;
