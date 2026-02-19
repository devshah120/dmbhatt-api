const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
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

// Basic health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
