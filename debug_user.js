const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkUser() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const user = await User.findOne({ phoneNum: '9638527410' });
        if (user) {
            console.log('User found:');
            console.log('firstName:', user.firstName);
            console.log('phoneNum:', user.phoneNum);
            console.log('email:', user.email);
            console.log('photoPath:', user.photoPath);
        } else {
            console.log('User not found');
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkUser();
