const mongoose = require('mongoose');
const ExamResult = require('./models/ExamResult');
const FiveMinTestResult = require('./models/FiveMinTestResult');
const OneLinerExamResult = require('./models/OneLinerExamResult');
const User = require('./models/User');
require('dotenv').config();

async function checkCounts() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dmbhatt');
        console.log('Connected to MongoDB');

        const user = await User.findOne({ phoneNum: '9106315912' });
        if (!user) {
            console.log('User not found');
            return;
        }

        console.log(`User: ${user.firstName} ${user.lastName}, ID: ${user._id}, isPaid: ${user.isPaid}`);

        const mainExamCount = await ExamResult.countDocuments({ studentId: user._id });
        const fiveMinTestCount = await FiveMinTestResult.countDocuments({ studentId: user._id });
        const oneLinerCount = await OneLinerExamResult.countDocuments({ studentId: user._id });

        console.log(`Main Exam Count: ${mainExamCount}`);
        console.log(`5 Min Test Count: ${fiveMinTestCount}`);
        console.log(`One Liner Count: ${oneLinerCount}`);

        const allResults = await FiveMinTestResult.find({});
        console.log(`Total FiveMinTestResults in DB: ${allResults.length}`);
        allResults.forEach(r => {
            console.log(`- ID: ${r._id}, studentId: ${r.studentId}, Title: ${r.title}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

checkCounts();
