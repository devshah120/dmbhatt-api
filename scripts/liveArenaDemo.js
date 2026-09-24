/**
 * Live Arena local demo (development only — never touches a real database).
 *
 *   node scripts/liveArenaDemo.js
 *
 * Starts a throwaway in-memory MongoDB, seeds demo accounts + exams, and runs the
 * real server.js on http://localhost:5000 so the admin web and the student app
 * can be tried end to end. Stop with Ctrl+C (all demo data is discarded).
 */
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { hashLoginCode } = require('../utils/helpers');

const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const LiveExam = require('../models/LiveExam');
const LiveExamQueue = require('../models/LiveExamQueue');
const LiveExamAttempt = require('../models/LiveExamAttempt');

const PORT = process.env.PORT || 5000;
const PIN = '1234';
const MIN = 60 * 1000;

const QUESTIONS = [
    ['What is the SI unit of force?', ['Newton', 'Joule', 'Watt', 'Pascal']],
    ['Which gas do plants absorb for photosynthesis?', ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen']],
    ['The chemical formula of water is:', ['H2O', 'CO2', 'O2', 'NaCl']],
    ['Which organ pumps blood in the human body?', ['Heart', 'Lungs', 'Liver', 'Kidney']],
    ['Speed of light is approximately:', ['3 × 10^8 m/s', '3 × 10^6 m/s', '340 m/s', '3 × 10^5 m/s']],
    ['pH of pure water is:', ['7', '0', '14', '1']],
    ['Which is a scalar quantity?', ['Distance', 'Velocity', 'Force', 'Displacement']],
    ['The powerhouse of the cell is:', ['Mitochondria', 'Nucleus', 'Ribosome', 'Golgi body']],
    ['Unit of electric current is:', ['Ampere', 'Volt', 'Ohm', 'Watt']],
    ['Which metal is liquid at room temperature?', ['Mercury', 'Iron', 'Copper', 'Silver']]
];

const seed = async () => {
    const pinHash = await hashLoginCode(PIN);

    await User.create({ role: 'super admin', firstName: 'Demo Admin', phoneNum: '9000000001', email: 'admin@demo.local', loginCodeHash: pinHash, isPaid: true });

    const student = await User.create({ role: 'student', firstName: 'Demo', lastName: 'Student', phoneNum: '9000000002', loginCodeHash: pinHash, isPaid: true });
    await StudentProfile.create({ userId: student._id, std: '10', board: 'GSEB', medium: 'English', school: 'Demo School' });

    // Question bank = an ordinary Online Exam, exactly like production.
    const bank = await Exam.create({
        title: 'Science Revision Set', name: 'Science Revision Set', subject: 'Science',
        std: '10', board: 'GSEB', medium: 'English', unit: 'Unit 1', totalMarks: QUESTIONS.length
    });
    const questions = await Question.insertMany(QUESTIONS.map(([text, opts]) => ({
        examId: bank._id,
        questionText: text,
        options: opts.map((t, i) => ({ key: 'ABCD'[i], text: t })),
        correctAnswer: 'A',
        marks: 1
    })));
    bank.questions = questions.map((q) => q._id);
    await bank.save();

    const now = Date.now();
    const common = {
        subject: 'Science', std: '10', board: 'GSEB', medium: 'English',
        questions: questions.map((q) => q._id), sourceExamIds: [bank._id],
        questionCount: questions.length, totalMarks: questions.length, passingMarks: 4,
        status: 'SCHEDULED', queueOpensBeforeMinutes: 30,
        instructions: 'Each question carries 1 mark. Only your first attempt counts on the leaderboard.'
    };

    // 1) Queue open now, goes LIVE in 3 minutes — try Join Queue + the countdown.
    await LiveExam.create({ ...common, title: 'Science Challenge - Round 1', description: 'Starts in 3 minutes',
        startAt: new Date(now + 3 * MIN), endAt: new Date(now + 13 * MIN), durationMinutes: 10 });

    // 2) LIVE right now, with a leaderboard already filling up.
    const live = await LiveExam.create({ ...common, title: 'Science Sprint (Live Now)', description: 'Already running',
        startAt: new Date(now - 2 * MIN), endAt: new Date(now + 28 * MIN), durationMinutes: 30 });

    // 3) Tomorrow — shows as UPCOMING (queue not open yet).
    await LiveExam.create({ ...common, title: 'Science Challenge - Round 2', description: 'Tomorrow',
        startAt: new Date(now + 24 * 60 * MIN), endAt: new Date(now + 24 * 60 * MIN + 30 * MIN), durationMinutes: 30 });

    // Classmates who already finished the live exam (first attempts only).
    const names = [['Rahul', 9, 312], ['Priya', 9, 355], ['Jay', 8, 290], ['Neha', 7, 402], ['Aman', 6, 250]];
    for (const [first, correct, secs] of names) {
        const u = await User.create({ role: 'student', firstName: first, phoneNum: `98000000${10 + names.findIndex((n) => n[0] === first)}`, loginCodeHash: pinHash, isPaid: true });
        await StudentProfile.create({ userId: u._id, std: '10', board: 'GSEB', medium: 'English' });
        await LiveExamQueue.create({ liveExamId: live._id, studentId: u._id });
        const startedAt = new Date(now - 2 * MIN);
        await LiveExamAttempt.create({
            liveExamId: live._id, studentId: u._id, attemptNumber: 1, isFirstAttempt: true, status: 'SUBMITTED',
            questionOrder: live.questions, startedAt, deadlineAt: live.endAt,
            submittedAt: new Date(startedAt.getTime() + secs * 1000), timeTakenMs: secs * 1000,
            answers: questions.map((q, i) => ({ questionId: q._id, selectedKey: i < correct ? 'A' : 'B', isCorrect: i < correct, marksAwarded: i < correct ? 1 : 0 })),
            obtainedMarks: correct, totalMarks: questions.length,
            correctCount: correct, wrongCount: questions.length - correct, skippedCount: 0
        });
    }
};

(async () => {
    console.log('Starting in-memory MongoDB (first run downloads it, please wait)...');
    const mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    const uri = mongod.getUri('live_arena_demo');
    await mongoose.connect(uri);
    await Promise.all([User, LiveExam, LiveExamQueue, LiveExamAttempt].map((m) => m.init()));
    await seed();
    await mongoose.disconnect();

    const server = spawn(process.execPath, ['-r', './tests/helpers/stubMissingCanvas.js', 'server.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            NODE_ENV: 'development',
            PORT: String(PORT),
            MONGODB_URI: uri,
            JWT_SECRET: process.env.JWT_SECRET || 'live-arena-demo-secret',
            JWT_EXPIRE: process.env.JWT_EXPIRE || '30d'
        },
        stdio: 'inherit'
    });

    console.log(`
=================== LIVE ARENA DEMO ===================
API:            http://localhost:${PORT}/api
Admin login:    9000000001  /  PIN ${PIN}   (super admin)
Student login:  9000000002  /  PIN ${PIN}   (Std 10, GSEB, English)

Seeded Live Exams for Std 10:
  - "Science Challenge - Round 1"  queue open, LIVE in 3 min
  - "Science Sprint (Live Now)"    LIVE now, 5 classmates on leaderboard
  - "Science Challenge - Round 2"  tomorrow (upcoming)

Ctrl+C to stop. All demo data is in memory and is discarded.
=======================================================
`);

    const stop = async () => {
        server.kill();
        await mongod.stop();
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
})().catch((err) => {
    console.error('Demo failed to start:', err);
    process.exit(1);
});
