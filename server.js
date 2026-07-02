const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { optionalProtect } = require('./middleware/authMiddleware');
const { startWorker } = require('./jobs/notificationWorker');
require('dotenv').config();

const app = express();

// Connect to MongoDB
connectDB();

// Start notification worker (checks every 60 seconds by default)
startWorker(parseInt(process.env.NOTIFICATION_CHECK_INTERVAL) || 60000);

// Middleware
app.use(cors());
app.use(express.json());
app.use(optionalProtect);
app.use('/uploads', express.static('uploads'));

// Routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);
const profileRoutes = require('./routes/profileRoutes');
app.use('/api/profile', profileRoutes);
const dashboardRoutes = require('./routes/dashboardRoutes');
app.use('/api/dashboard', dashboardRoutes);
const examRoutes = require('./routes/examRoutes');
app.use('/api/exam', examRoutes);
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);
const exploreRoutes = require('./routes/exploreRoutes');
app.use('/api/explore', exploreRoutes);
const paperSetRoutes = require('./routes/paperSetRoutes');
app.use('/api/paperset', paperSetRoutes);
const fiveMinTestRoutes = require('./routes/fiveMinTestRoutes');
app.use('/api/fiveMinTest', fiveMinTestRoutes);
const topRankerRoutes = require('./routes/topRankerRoutes');
app.use('/api/topRanker', topRankerRoutes);
const leaderboardRoutes = require('./routes/leaderboardRoutes');
app.use('/api/leaderboard', leaderboardRoutes);
const referralRoutes = require('./routes/referralRoutes');
app.use('/api/referral', referralRoutes);
const eventRoutes = require('./routes/eventRoutes');
app.use('/api/event', eventRoutes);
const gameRoutes = require('./routes/gameRoutes');
app.use('/api/games', gameRoutes);
const paymentRoutes = require('./routes/paymentRoutes');
app.use('/api/payment', paymentRoutes);
const mediaRoutes = require('./routes/mediaRoutes');
app.use('/api/media', mediaRoutes);
const materialRoutes = require('./routes/materialRoutes');
app.use('/api/material', materialRoutes);
const mindMapRoutes = require('./routes/mindMapRoutes');
app.use('/api/mindmap', mindMapRoutes);
const oneLinerExamRoutes = require('./routes/oneLinerExamRoutes');
app.use('/api/onelinerexam', oneLinerExamRoutes);
const trueFalseExamRoutes = require('./routes/trueFalseExamRoutes');
app.use('/api/truefalseexam', trueFalseExamRoutes);
const matchFollowingExamRoutes = require('./routes/matchFollowingExamRoutes');
app.use('/api/matchfollowingexam', matchFollowingExamRoutes);
const superAdminRoutes = require('./routes/superAdminRoutes');
app.use('/api/superadmin', superAdminRoutes);
const redeemRoutes = require('./routes/redeemRoutes');
app.use('/api/redeem', redeemRoutes);
const invoiceRoutes = require('./routes/invoiceRoutes');
app.use('/api/invoice', invoiceRoutes);
const supportRoutes = require('./routes/supportRoutes');
app.use('/api/support', supportRoutes);
const planRoutes = require('./routes/planRoutes');
app.use('/api/plans', planRoutes);

// Basic health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// App Config Open Routes
const configCtrl = require('./controllers/superAdminController');
app.get('/api/config/app', (req, res, next) => {
    req.params.type = 'app';
    next();
}, configCtrl.getPublicConfig);

app.get('/api/config/payment', (req, res, next) => {
    req.params.type = 'payment';
    next();
}, configCtrl.getPublicConfig);

app.get('/api/config/referral', (req, res, next) => {
    req.params.type = 'referral';
    next();
}, configCtrl.getPublicConfig);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        error: err.toString(),
        stack: err.stack
    });
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
