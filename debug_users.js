const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const debugUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const users = await User.find({}, 'phoneNum role firstName');
        console.log('Total users:', users.length);
        console.log('Users list:');
        users.forEach(u => {
            console.log(`- Role: ${u.role}, Phone: ${u.phoneNum}, Name: ${u.firstName}`);
        });

        const admin = await User.findOne({ phoneNum: '9876543210' });
        if (admin) {
            console.log('Admin found with phone 9876543210:');
            console.log(admin);
        } else {
            console.log('Admin NOT found with phone 9876543210');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
};

debugUsers();
