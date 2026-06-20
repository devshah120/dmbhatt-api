require('dotenv').config();
const mongoose = require('mongoose');
const MatchFollowingExamResult = require('./models/MatchFollowingExamResult');

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dmbhatt')
  .then(async () => {
    console.log("Connected");
    
    const doc = new MatchFollowingExamResult({
        studentId: new mongoose.Types.ObjectId(),
        examId: new mongoose.Types.ObjectId(),
        title: "Test",
        obtainedMarks: 0,
        totalMarks: 5,
        answers: [{
            left: "test_left",
            studentMatch: "test_student",
            isCorrect: false,
            correctMatch: "test_correct"
        }]
    });
    
    await doc.save();
    console.log("Saved Doc:", JSON.stringify(doc.toObject(), null, 2));
    
    mongoose.disconnect();
  });
