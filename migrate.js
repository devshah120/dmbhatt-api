const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load env vars
dotenv.config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

const OneLinerExam = require('./models/OneLinerExam');

const migrateExams = async () => {
    await connectDB();
    console.log("Starting Migration for Old OneLiner Exams...");

    try {
        const exams = await OneLinerExam.find({});
        let updatedCount = 0;

        for (const exam of exams) {
            let isModified = false;

            // 1. Set default totalMarks based on questions length if missing
            if (exam.totalMarks === undefined || exam.totalMarks === null) {
                exam.totalMarks = exam.questions ? exam.questions.length : 20;
                isModified = true;
            }

            // 2. Ensure every question has a mark explicitly set
            if (exam.questions && exam.questions.length > 0) {
                exam.questions.forEach(q => {
                    if (q.mark === undefined || q.mark === null) {
                        q.mark = 1;
                        isModified = true;
                    }
                });
            }

            if (isModified) {
                await exam.save();
                updatedCount++;
                console.log(`Updated Exam: ${exam.title} (ID: ${exam._id})`);
            }
        }

        console.log(`Migration Complete! Successfully updated ${updatedCount} exams.`);
    } catch (error) {
        console.error("Migration Error:", error);
    } finally {
        process.exit(0);
    }
};

migrateExams();
