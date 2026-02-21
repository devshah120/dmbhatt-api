const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
require('dotenv').config();

const seedQuestions = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        const exams = await Exam.find();
        console.log(`Found ${exams.length} exams.`);

        for (const exam of exams) {
            console.log(`Processing Exam: ${exam.subject} (Std: ${exam.std}, Unit: ${exam.unit})`);

            // Clear existing questions for this exam if you want to start fresh 
            // OR just add more questions. The user said "add", so I will append.

            const numQuestionsToAdd = Math.floor(Math.random() * 11) + 40; // 40-50 questions
            console.log(`Adding ${numQuestionsToAdd} questions to ${exam.subject}...`);

            const questionIds = [...(exam.questions || [])];

            for (let i = 1; i <= numQuestionsToAdd; i++) {
                const questionNumber = questionIds.length + 1;
                const options = [
                    { key: 'A', text: `Option A for Q${questionNumber}` },
                    { key: 'B', text: `Option B for Q${questionNumber}` },
                    { key: 'C', text: `Option C for Q${questionNumber}` },
                    { key: 'D', text: `Option D for Q${questionNumber}` }
                ];
                const correctAnswers = ['A', 'B', 'C', 'D'];
                const correctAnswer = correctAnswers[Math.floor(Math.random() * 4)];

                const newQuestion = new Question({
                    examId: exam._id,
                    questionText: `Question ${questionNumber}: What is the correct answer for this ${exam.subject} question from Unit ${exam.unit}?`,
                    options: options,
                    correctAnswer: correctAnswer,
                    marks: 1
                });

                const savedQ = await newQuestion.save();
                questionIds.push(savedQ._id);
            }

            // Update Exam
            exam.questions = questionIds;
            exam.totalMarks = questionIds.length; // Assuming each question is 1 mark
            await exam.save();
            console.log(`Successfully updated exam: ${exam.subject}. Total questions: ${questionIds.length}`);
        }

        console.log('Seeding completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding Error:', err);
        process.exit(1);
    }
};

seedQuestions();
