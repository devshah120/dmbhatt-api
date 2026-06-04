const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config();

// Configure DNS to use Google DNS (8.8.8.8) to resolve MongoDB Atlas
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            retryWrites: true,
            w: 'majority',
            maxPoolSize: 10,
            minPoolSize: 5,
        });
        console.log('✓ Connected to MongoDB');
    } catch (err) {
        console.error('✗ Database Connection Failed!', err.message);
        console.error('  MongoDB URI:', process.env.MONGODB_URI);

        // Retry connection after 5 seconds
        console.log('  Retrying connection in 5 seconds...');
        setTimeout(connectDB, 5000);
    }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

module.exports = connectDB;
