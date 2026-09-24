/**
 * Live Arena API tests — run with `npm test`.
 * Uses an in-memory MongoDB (mongodb-memory-server) so no real data is touched.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'live-exam-test-secret';

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Session = require('../models/Session');
const StudentProfile = require('../models/StudentProfile');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const LiveExam = require('../models/LiveExam');
const LiveExamQueue = require('../models/LiveExamQueue');
const LiveExamAttempt = require('../models/LiveExamAttempt');
const ScheduledNotification = require('../models/ScheduledNotification');
const svc = require('../utils/liveExamService');

jest.setTimeout(60000);

let mongod;
let app;
let admin;
let questions; // 10 questions, 10 marks each, correct answer 'A'
let sourceExam;
let phoneSeq = 9000000000;

const MIN = 60 * 1000;

const makeUser = async (role, profile = null) => {
    const user = await User.create({
        role,
        firstName: `${role}-${phoneSeq}`,
        lastName: 'T',
        phoneNum: String(phoneSeq++),
        loginCodeHash: 'x'
    });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    await Session.create({ userId: user._id, token, isActive: true, expiresAt: new Date(Date.now() + 86400000) });
    if (profile) await StudentProfile.create({ userId: user._id, ...profile });
    return { user, token, auth: { Authorization: `Bearer ${token}` } };
};

const STD10 = { std: '10', board: 'GSEB', medium: 'English' };
const makeStudent = () => makeUser('student', STD10);

/** Answers with the first `nCorrect` questions right and the rest wrong. */
const answersFor = (nCorrect) => questions.map((q, i) => ({
    questionId: String(q._id),
    selectedKey: i < nCorrect ? 'A' : 'B'
}));

const createExam = async (overrides = {}) => {
    const res = await request(app)
        .post('/api/liveexam/admin/create')
        .set(admin.auth)
        .send({
            title: 'Science Challenge - Round 1',
            subject: 'Science',
            std: '10',
            board: 'GSEB',
            medium: 'English',
            startAt: new Date(Date.now() + 2 * 60 * MIN).toISOString(),
            durationMinutes: 30,
            questionIds: questions.map((q) => String(q._id)),
            sourceExamIds: [String(sourceExam._id)],
            status: 'SCHEDULED',
            ...overrides
        });
    expect(res.status).toBe(201);
    return res.body.exam;
};

/** Move an exam's clock so it is in the requested phase right now. */
const setPhase = async (examId, phase) => {
    const now = Date.now();
    const windows = {
        SCHEDULED: [now + 120 * MIN, now + 150 * MIN],
        QUEUE_OPEN: [now + 10 * MIN, now + 40 * MIN],
        LIVE: [now - 1 * MIN, now + 29 * MIN],
        COMPLETED: [now - 60 * MIN, now - 30 * MIN]
    };
    const [startAt, endAt] = windows[phase];
    await LiveExam.updateOne({ _id: examId }, { $set: { startAt: new Date(startAt), endAt: new Date(endAt) } });
};

const start = (student, examId) => request(app).post(`/api/liveexam/${examId}/start`).set(student.auth);
const submit = (student, attemptId, body) =>
    request(app).post(`/api/liveexam/attempt/${attemptId}/submit`).set(student.auth).send(body);

/** Start + submit one attempt with n correct answers. */
const sit = async (student, examId, nCorrect) => {
    const s = await start(student, examId);
    expect([200, 201]).toContain(s.status);
    const r = await submit(student, s.body.attempt._id, { answers: answersFor(nCorrect) });
    expect(r.status).toBe(200);
    return r.body;
};

const leaderboard = (who, examId, query = '') =>
    request(app).get(`/api/liveexam/${examId}/leaderboard${query}`).set(who.auth);

beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    await mongoose.connect(mongod.getUri());
    await Promise.all([LiveExam, LiveExamQueue, LiveExamAttempt, User, Session].map((m) => m.init()));

    app = express();
    app.use(express.json());
    app.use('/api/liveexam', require('../routes/liveExamRoutes'));

    admin = await makeUser('admin');
    sourceExam = await Exam.create({
        subject: 'Science', title: 'Bank', totalMarks: 100, std: '10', medium: 'English', board: 'GSEB', unit: '1'
    });
    questions = await Question.insertMany(Array.from({ length: 10 }, (_, i) => ({
        examId: sourceExam._id,
        questionText: `Q${i + 1}`,
        options: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: `opt ${key}` })),
        correctAnswer: 'A',
        marks: 10
    })));
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

describe('Admin management', () => {
    test('create as draft, edit, publish, cancel; totals come from the questions', async () => {
        const draft = await createExam({ status: 'DRAFT', totalMarks: 5, questionCount: 99 });
        expect(draft.status).toBe('DRAFT');
        expect(draft.totalMarks).toBe(100); // client-sent totals ignored
        expect(draft.questionCount).toBe(10);

        const edit = await request(app).put(`/api/liveexam/admin/update/${draft._id}`).set(admin.auth)
            .send({ title: 'Renamed', questionIds: questions.slice(0, 4).map((q) => String(q._id)), passingMarks: 20 });
        expect(edit.status).toBe(200);
        expect(edit.body.exam.title).toBe('Renamed');
        expect(edit.body.exam.totalMarks).toBe(40);

        const pub = await request(app).put(`/api/liveexam/admin/${draft._id}/publish`).set(admin.auth);
        expect(pub.status).toBe(200);
        const reminders = await ScheduledNotification.find({ _id: { $in: pub.body.exam.reminderNotificationIds } });
        expect(reminders).toHaveLength(2);
        expect(reminders[0].data.liveExamId).toBe(String(draft._id));
        expect(reminders[0].std).toBe('10');

        const cancel = await request(app).put(`/api/liveexam/admin/${draft._id}/cancel`).set(admin.auth).send({ reason: 'x' });
        expect(cancel.status).toBe(200);
        expect(await ScheduledNotification.countDocuments({ _id: { $in: pub.body.exam.reminderNotificationIds } })).toBe(0);

        const list = await request(app).get('/api/liveexam/admin/all').set(admin.auth);
        expect(list.body.find((e) => e._id === draft._id).status).toBe('CANCELLED');
    });

    test('validation: past start cannot be scheduled, passing > total rejected', async () => {
        const past = await request(app).post('/api/liveexam/admin/create').set(admin.auth).send({
            title: 'x', subject: 'Science', std: '10', board: 'GSEB', medium: 'English',
            startAt: new Date(Date.now() - MIN).toISOString(), durationMinutes: 30,
            questionIds: [String(questions[0]._id)], status: 'SCHEDULED'
        });
        expect(past.status).toBe(400);

        const passing = await request(app).post('/api/liveexam/admin/create').set(admin.auth).send({
            title: 'x', subject: 'Science', std: '10', board: 'GSEB', medium: 'English',
            startAt: new Date(Date.now() + 60 * MIN).toISOString(), durationMinutes: 30,
            questionIds: [String(questions[0]._id)], passingMarks: 50
        });
        expect(passing.status).toBe(400);
    });

    test('only staff can manage; students and anonymous users are rejected', async () => {
        const student = await makeStudent();
        expect((await request(app).post('/api/liveexam/admin/create').set(student.auth).send({})).status).toBe(403);
        expect((await request(app).get('/api/liveexam/admin/all')).status).toBe(401);
        const guest = await request(app).get('/api/liveexam/student/list')
            .set('X-Guest-Token', 'DMBHATT_GUEST_ACCESS_TOKEN_2024');
        expect(guest.status).toBe(403);
    });

    test('once live only text fields can change; exam with attempts cannot be deleted', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const before = await LiveExam.findById(exam._id).lean();

        const edit = await request(app).put(`/api/liveexam/admin/update/${exam._id}`).set(admin.auth)
            .send({ description: 'Good luck', startAt: new Date(Date.now() + 999 * MIN).toISOString(), questionIds: [] });
        expect(edit.status).toBe(200);
        const after = await LiveExam.findById(exam._id).lean();
        expect(after.description).toBe('Good luck');
        expect(after.startAt.getTime()).toBe(before.startAt.getTime());
        expect(after.questions).toHaveLength(10);

        const student = await makeStudent();
        await sit(student, exam._id, 3);
        expect((await request(app).delete(`/api/liveexam/admin/delete/${exam._id}`).set(admin.auth)).status).toBe(400);
    });
});

describe('Student visibility and queue', () => {
    test('drafts and other classes are hidden; eligible exams are listed', async () => {
        const draft = await createExam({ status: 'DRAFT' });
        const visible = await createExam();
        const std9 = await createExam({ std: '9' });
        const student = await makeStudent();

        const list = await request(app).get('/api/liveexam/student/list').set(student.auth);
        const ids = list.body.exams.map((e) => e._id);
        expect(ids).toContain(visible._id);
        expect(ids).not.toContain(draft._id);
        expect(ids).not.toContain(std9._id);
        expect(list.body.serverTime).toBeDefined();

        expect((await request(app).get(`/api/liveexam/${std9._id}`).set(student.auth)).status).toBe(403);
        expect((await request(app).post(`/api/liveexam/${std9._id}/queue`).set(student.auth)).status).toBe(403);
        expect((await leaderboard(student, std9._id)).status).toBe(403);
    });

    test('many recent past exams never crowd out an upcoming one', async () => {
        const docs = Array.from({ length: 60 }, (_, i) => ({
            title: `Past ${i}`, subject: 'Science', std: '10', board: 'GSEB', medium: 'English',
            questions: [questions[0]._id], questionCount: 1, totalMarks: 10, durationMinutes: 30,
            startAt: new Date(Date.now() - (2 * 60 + i) * MIN), endAt: new Date(Date.now() - (90 + i) * MIN),
            status: 'SCHEDULED'
        }));
        await LiveExam.insertMany(docs);
        const upcoming = await createExam({ title: 'Next one' });
        const student = await makeStudent();
        const list = await request(app).get('/api/liveexam/student/list').set(student.auth);
        expect(list.body.exams.map((e) => e._id)).toContain(upcoming._id);
        await LiveExam.deleteMany({ title: /^Past / });
    });

    test('queue: closed before window, idempotent, concurrent joins counted exactly, leave/rejoin', async () => {
        const exam = await createExam();
        const s1 = await makeStudent();

        const early = await request(app).post(`/api/liveexam/${exam._id}/queue`).set(s1.auth);
        expect(early.status).toBe(400);

        await setPhase(exam._id, 'QUEUE_OPEN');
        const joins = await Promise.all(Array.from({ length: 5 }, () =>
            request(app).post(`/api/liveexam/${exam._id}/queue`).set(s1.auth)));
        joins.forEach((r) => expect(r.status).toBe(200));
        expect(await LiveExamQueue.countDocuments({ liveExamId: exam._id })).toBe(1);

        const others = await Promise.all(Array.from({ length: 20 }, () => makeStudent()));
        await Promise.all(others.map((s) => request(app).post(`/api/liveexam/${exam._id}/queue`).set(s.auth)));
        expect(await LiveExamQueue.countDocuments({ liveExamId: exam._id })).toBe(21);

        // Reload: queue membership comes from the server.
        const detail = await request(app).get(`/api/liveexam/${exam._id}`).set(s1.auth);
        expect(detail.body.exam.myState).toBe('IN_QUEUE');
        expect(detail.body.exam.queueCount).toBe(21);
        expect(detail.body.exam.canLeaveQueue).toBe(true);

        const leave = await request(app).delete(`/api/liveexam/${exam._id}/queue`).set(s1.auth);
        expect(leave.body.queueCount).toBe(20);
        const rejoin = await request(app).post(`/api/liveexam/${exam._id}/queue`).set(s1.auth);
        expect(rejoin.body.queueCount).toBe(21);

        await setPhase(exam._id, 'LIVE');
        expect((await request(app).delete(`/api/liveexam/${exam._id}/queue`).set(s1.auth)).status).toBe(400);
    });
});

describe('Attempts', () => {
    test('cannot start before the start time (server clock)', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'QUEUE_OPEN');
        const student = await makeStudent();
        const res = await start(student, exam._id);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('NOT_STARTED');
        expect(await LiveExamAttempt.countDocuments({ liveExamId: exam._id })).toBe(0);
    });

    test('questions are served without answers; refresh / other tabs resume the same attempt', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const student = await makeStudent();

        const parallel = await Promise.all(Array.from({ length: 4 }, () => start(student, exam._id)));
        const ids = new Set(parallel.map((r) => r.body.attempt._id));
        expect(ids.size).toBe(1);
        expect(await LiveExamAttempt.countDocuments({ liveExamId: exam._id, studentId: student.user._id })).toBe(1);

        const first = parallel[0].body;
        expect(first.attempt.attemptNumber).toBe(1);
        expect(first.attempt.isFirstAttempt).toBe(true);
        expect(first.questions).toHaveLength(10);
        first.questions.forEach((q) => expect(q.correctAnswer).toBeUndefined());
        expect(first.questions.map((q) => q._id)).toEqual(questions.map((q) => String(q._id))); // admin order

        // Autosave, then "refresh": answers come back from the server.
        const save = await request(app).put(`/api/liveexam/attempt/${first.attempt._id}/answers`)
            .set(student.auth).send({ answers: answersFor(4) });
        expect(save.status).toBe(200);
        const resumed = await start(student, exam._id);
        expect(resumed.status).toBe(200);
        expect(resumed.body.resumed).toBe(true);
        expect(resumed.body.attempt.answers).toHaveLength(10);

        // Late joiner who never queued is counted in the queue.
        expect(await LiveExamQueue.exists({ liveExamId: exam._id, studentId: student.user._id })).toBeTruthy();
    });

    test('score, rank, attempt number and first-attempt flag cannot be forged', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const student = await makeStudent();
        const s = await start(student, exam._id);

        const forged = await submit(student, s.body.attempt._id, {
            answers: answersFor(2).map((a) => ({ ...a, isCorrect: true, marksAwarded: 100 })),
            obtainedMarks: 999, totalMarks: 999, rank: 1, attemptNumber: 7, isFirstAttempt: false, status: 'SUBMITTED'
        });
        expect(forged.status).toBe(200);
        expect(forged.body.attempt.obtainedMarks).toBe(20);
        expect(forged.body.attempt.totalMarks).toBe(100);
        expect(forged.body.attempt.attemptNumber).toBe(1);
        expect(forged.body.attempt.isFirstAttempt).toBe(true);
        expect(forged.body.attempt.correctCount).toBe(2);
        expect(forged.body.attempt.wrongCount).toBe(8);
        expect(forged.body.leaderboard.rank).toBe(1);

        // Resubmitting does not change anything.
        const again = await submit(student, s.body.attempt._id, { answers: answersFor(10) });
        expect(again.body.alreadySubmitted).toBe(true);
        expect(again.body.attempt.obtainedMarks).toBe(20);

        // Another student can't touch this attempt.
        const other = await makeStudent();
        expect((await submit(other, s.body.attempt._id, { answers: answersFor(10) })).status).toBe(404);

        // The database refuses a second first attempt outright.
        await expect(LiveExamAttempt.create({
            liveExamId: exam._id, studentId: student.user._id, attemptNumber: 9, isFirstAttempt: true,
            startedAt: new Date(), deadlineAt: new Date()
        })).rejects.toMatchObject({ code: 11000 });
    });

    test('concurrent submits of one attempt finalize it exactly once', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const student = await makeStudent();
        const s = await start(student, exam._id);

        const results = await Promise.all([
            submit(student, s.body.attempt._id, { answers: answersFor(6) }),
            submit(student, s.body.attempt._id, { answers: answersFor(9) }),
            submit(student, s.body.attempt._id, { answers: answersFor(1) })
        ]);
        expect(results.filter((r) => r.body.alreadySubmitted === false)).toHaveLength(1);
        const marks = new Set(results.map((r) => r.body.attempt.obtainedMarks));
        expect(marks.size).toBe(1);
    });
});

describe('FIRST ATTEMPT ONLY on the leaderboard', () => {
    test('Attempts 50 → 90 → 100 rank on 50; attempts 90 → 70 rank on 90', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const a = await makeStudent();
        const b = await makeStudent();

        const a1 = await sit(a, exam._id, 5);
        expect(a1.attempt.isFirstAttempt).toBe(true);
        const a2 = await sit(a, exam._id, 9);
        const a3 = await sit(a, exam._id, 10);
        expect(a2.attempt.attemptNumber).toBe(2);
        expect(a2.attempt.isFirstAttempt).toBe(false);
        expect(a3.attempt.obtainedMarks).toBe(100);
        expect(a3.leaderboard.score).toBe(50);

        await sit(b, exam._id, 9);
        const b2 = await sit(b, exam._id, 7);
        expect(b2.attempt.obtainedMarks).toBe(70);
        expect(b2.leaderboard.score).toBe(90);

        const board = await leaderboard(a, exam._id);
        expect(board.status).toBe(200);
        expect(board.body.total).toBe(2);
        const byStudent = Object.fromEntries(board.body.entries.map((e) => [String(e.studentId), e]));
        expect(byStudent[String(a.user._id)].obtainedMarks).toBe(50);
        expect(byStudent[String(b.user._id)].obtainedMarks).toBe(90);
        expect(board.body.entries.map((e) => e.rank)).toEqual([1, 2]);
        expect(board.body.me.obtainedMarks).toBe(50);
        expect(board.body.me.rank).toBe(2);

        // Retakes never create another leaderboard row.
        expect(await LiveExamAttempt.countDocuments({ liveExamId: exam._id, isFirstAttempt: true })).toBe(2);
    });

    test('ties are ranked deterministically: marks, then time taken, then submit time', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const students = await Promise.all(Array.from({ length: 5 }, () => makeStudent()));

        // All score 80; each started a different number of seconds ago (slowest first).
        const attemptIds = [];
        for (let i = 0; i < students.length; i++) {
            const s = await start(students[i], exam._id);
            attemptIds.push(s.body.attempt._id);
            await LiveExamAttempt.updateOne({ _id: s.body.attempt._id },
                { $set: { startedAt: new Date(Date.now() - (100 - i * 10) * 1000) } });
        }
        await Promise.all(students.map((s, i) => submit(s, attemptIds[i], { answers: answersFor(8) })));
        const top = await makeStudent();
        await sit(top, exam._id, 10);

        const boards = await Promise.all([1, 2, 3].map(() => leaderboard(admin, exam._id)));
        const orders = boards.map((b) => b.body.entries.map((e) => String(e.studentId)).join(','));
        expect(new Set(orders).size).toBe(1); // stable across reads

        const entries = boards[0].body.entries;
        expect(String(entries[0].studentId)).toBe(String(top.user._id));
        const tied = entries.slice(1);
        tied.forEach((e) => expect(e.obtainedMarks).toBe(80));
        for (let i = 1; i < tied.length; i++) {
            expect(tied[i].timeTakenMs).toBeGreaterThanOrEqual(tied[i - 1].timeTakenMs);
        }
        // Fastest of the tied group (last to start) ranks 2nd.
        expect(String(tied[0].studentId)).toBe(String(students[4].user._id));

        // Each student's own rank matches their row.
        for (const e of entries) {
            const first = await LiveExamAttempt.findOne({ liveExamId: exam._id, studentId: e.studentId, isFirstAttempt: true });
            expect(await svc.rankOf(first)).toBe(e.rank);
        }
    });

    test('identical marks AND identical time still get distinct, stable ranks', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const [x, y] = await Promise.all([makeStudent(), makeStudent()]);
        await sit(x, exam._id, 6);
        await sit(y, exam._id, 6);
        const same = { timeTakenMs: 60000, submittedAt: new Date('2026-09-25T13:40:00Z') };
        await LiveExamAttempt.updateMany({ liveExamId: exam._id }, { $set: same });

        const b = await leaderboard(admin, exam._id);
        expect(b.body.entries.map((e) => e.rank)).toEqual([1, 2]);
        const firsts = await LiveExamAttempt.find({ liveExamId: exam._id }).sort({ _id: 1 });
        expect(await svc.rankOf(firsts[0])).toBe(1);
        expect(await svc.rankOf(firsts[1])).toBe(2);
    });

    test('zero and one participant', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const empty = await leaderboard(admin, exam._id);
        expect(empty.body.total).toBe(0);
        expect(empty.body.entries).toEqual([]);

        const solo = await makeStudent();
        const r = await sit(solo, exam._id, 7);
        expect(r.leaderboard.rank).toBe(1);
        expect(r.leaderboard.totalRanked).toBe(1);
    });
});

describe('Time limits and lifecycle edge cases', () => {
    test('submit after the deadline is closed with the autosaved answers, not the late payload', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const student = await makeStudent();
        const s = await start(student, exam._id);
        await request(app).put(`/api/liveexam/attempt/${s.body.attempt._id}/answers`)
            .set(student.auth).send({ answers: answersFor(3) });

        await LiveExamAttempt.updateOne({ _id: s.body.attempt._id }, { $set: { deadlineAt: new Date(Date.now() - 5 * MIN) } });

        const late = await submit(student, s.body.attempt._id, { answers: answersFor(10) });
        expect(late.body.attempt.status).toBe('AUTO_SUBMITTED');
        expect(late.body.attempt.obtainedMarks).toBe(30);

        const saveLate = await request(app).put(`/api/liveexam/attempt/${s.body.attempt._id}/answers`)
            .set(student.auth).send({ answers: answersFor(10) });
        expect(saveLate.status).toBe(409);
    });

    test('abandoned attempt (closed app / server restart) is auto-submitted by the sweeper', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const student = await makeStudent();
        const s = await start(student, exam._id);
        await request(app).put(`/api/liveexam/attempt/${s.body.attempt._id}/answers`)
            .set(student.auth).send({ answers: answersFor(6) });
        await LiveExamAttempt.updateOne({ _id: s.body.attempt._id }, { $set: { deadlineAt: new Date(Date.now() - MIN) } });

        const changed = await svc.autoSubmitExpired();
        expect(changed.has(String(exam._id))).toBe(true);
        const a = await LiveExamAttempt.findById(s.body.attempt._id);
        expect(a.status).toBe('AUTO_SUBMITTED');
        expect(a.obtainedMarks).toBe(60);
        expect(a.isFirstAttempt).toBe(true);
    });

    test('answers are hidden while live and revealed after the exam ends', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'LIVE');
        const student = await makeStudent();
        const live = await sit(student, exam._id, 5);
        expect(live.review).toBeNull();

        await setPhase(exam._id, 'COMPLETED');
        const res = await request(app).get(`/api/liveexam/${exam._id}/my-result`).set(student.auth);
        expect(res.status).toBe(200);
        expect(res.body.review).toHaveLength(10);
        expect(res.body.review[0].correctAnswer).toBe('A');

        const list = await request(app).get('/api/liveexam/student/list').set(student.auth);
        const card = list.body.exams.find((e) => e._id === exam._id);
        expect(card.myState).toBe('COMPLETED');
        expect(card.canRetake).toBe(true);

        // Practice retake after the window: allowed, own timer, never ranked.
        const retake = await sit(student, exam._id, 10);
        expect(retake.attempt.isFirstAttempt).toBe(false);
        expect(retake.leaderboard.score).toBe(50);
    });

    test('missed exam is EXPIRED and cannot be started', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'COMPLETED');
        const student = await makeStudent();
        const list = await request(app).get('/api/liveexam/student/list').set(student.auth);
        expect(list.body.exams.find((e) => e._id === exam._id).myState).toBe('EXPIRED');
        const res = await start(student, exam._id);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('EXPIRED');
    });

    test('cancelled exam shows CANCELLED and blocks queue and start', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'QUEUE_OPEN');
        const student = await makeStudent();
        await request(app).post(`/api/liveexam/${exam._id}/queue`).set(student.auth);
        await request(app).put(`/api/liveexam/admin/${exam._id}/cancel`).set(admin.auth);

        const list = await request(app).get('/api/liveexam/student/list').set(student.auth);
        const card = list.body.exams.find((e) => e._id === exam._id);
        expect(card.myState).toBe('CANCELLED');
        expect(card.canStart).toBe(false);
        expect(card.canJoinQueue).toBe(false);

        await setPhase(exam._id, 'LIVE');
        expect((await start(student, exam._id)).status).toBe(400);
        expect((await request(app).post(`/api/liveexam/${exam._id}/queue`).set(student.auth)).status).toBe(400);
    });

    test('admin monitor: queue and participants', async () => {
        const exam = await createExam();
        await setPhase(exam._id, 'QUEUE_OPEN');
        const [p, q] = await Promise.all([makeStudent(), makeStudent()]);
        await request(app).post(`/api/liveexam/${exam._id}/queue`).set(p.auth);
        await request(app).post(`/api/liveexam/${exam._id}/queue`).set(q.auth);

        const queue = await request(app).get(`/api/liveexam/admin/${exam._id}/queue`).set(admin.auth);
        expect(queue.body.total).toBe(2);
        expect(queue.body.entries[0].position).toBe(1);

        await setPhase(exam._id, 'LIVE');
        await sit(p, exam._id, 4);
        await sit(p, exam._id, 8);
        const parts = await request(app).get(`/api/liveexam/admin/${exam._id}/participants`).set(admin.auth);
        expect(parts.body.total).toBe(1);
        expect(parts.body.entries[0].attempts).toBe(2);
        expect(parts.body.entries[0].firstAttempt.obtainedMarks).toBe(40);
        expect(parts.body.entries[0].bestPracticeMarks).toBe(80);
    });
});

describe('Service rules', () => {
    test('phases follow the server clock', () => {
        const base = { status: 'SCHEDULED', queueOpensBeforeMinutes: 30 };
        const at = (startOffsetMin) => {
            const startAt = new Date(Date.now() + startOffsetMin * MIN);
            return svc.getEffectiveStatus({ ...base, startAt, endAt: new Date(startAt.getTime() + 30 * MIN) });
        };
        expect(at(60)).toBe('SCHEDULED');
        expect(at(10)).toBe('QUEUE_OPEN');
        expect(at(-5)).toBe('LIVE');
        expect(at(-45)).toBe('COMPLETED');
        expect(svc.getEffectiveStatus({ ...base, status: 'CANCELLED', startAt: new Date(), endAt: new Date() })).toBe('CANCELLED');
    });

    test('eligibility normalises standard and compares board / medium / stream', () => {
        const exam = { std: '10', board: 'GSEB', medium: 'English', stream: 'None' };
        expect(svc.isEligible(exam, { std: 'Std 10', board: 'gseb', medium: 'english' })).toBe(true);
        expect(svc.isEligible(exam, { std: '10', board: 'CBSE', medium: 'English' })).toBe(false);
        expect(svc.isEligible(exam, { std: '10', board: 'GSEB', medium: 'Gujarati' })).toBe(false);
        expect(svc.isEligible({ ...exam, std: '11', stream: 'Science' }, { std: '11', board: 'GSEB', medium: 'English', stream: 'Commerce' })).toBe(false);
        expect(svc.isEligible(exam, null)).toBe(false);
    });

    test('answer sanitising drops unknown questions and junk keys', () => {
        const order = [String(questions[0]._id), String(questions[1]._id)];
        const map = svc.sanitizeSelections([
            { questionId: order[0], selectedKey: 'a' },
            { questionId: order[1], selectedKey: '<script>' },
            { questionId: String(new mongoose.Types.ObjectId()), selectedKey: 'A' }
        ], order);
        expect([...map.entries()]).toEqual([[order[0], 'A']]);
    });
});
