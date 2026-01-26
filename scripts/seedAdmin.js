const mongoose = require('mongoose');
const User = require('../models/User');
const AdminProfile = require('../models/AdminProfile');
const { hashLoginCode } = require('../utils/helpers');
require('dotenv').config(); // Loads .env from current directory (project root)

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        const phoneNum = '9876543210';
        const loginCode = 'Admin%147';
        const name = 'Admin';
        const email = 'admin@dmbhatt.com'; // Dummy email

        // Check if admin already exists
        let user = await User.findOne({ phoneNum });
        if (user) {
            console.log('Admin user already exists');
            process.exit(0);
        }

        const loginCodeHash = await hashLoginCode(loginCode);

        // Create User
        user = new User({
            role: 'admin',
            firstName: name,
            email,
            phoneNum,
            loginCodeHash
        });

        const savedUser = await user.save();
        console.log('User created:', savedUser._id);

        // Create Admin Profile
        const adminProfile = new AdminProfile({
            userId: savedUser._id,
            name
        });

        await adminProfile.save();
        console.log('Admin Profile created');

        console.log('Admin seeded successfully');
        process.exit(0);
    } catch (err) {
        console.error('Seeding Error:', err);
        process.exit(1);
    }
};

seedAdmin();
