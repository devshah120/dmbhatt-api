/**
 * Live Arena realtime tests. Boots the real server.js (all existing routes +
 * Socket.IO) against an in-memory MongoDB and drives it with socket clients.
 */
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: connect } = require('socket.io-client');

const User = require('../models/User');
const Session = require('../models/Session');
const StudentProfile = require('../models/StudentProfile');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const LiveExam = require('../models/LiveExam');

jest.setTimeout(180000);

const SECRET = 'live-exam-socket-secret';
const PORT = 5000 + Math.floor(Math.random() * 1000) + 1000;
const BASE = `http://127.0.0.1:${PORT}`;

let mongod;
let server;
let exam;
let phone = 8000000000;
const sockets = [];

const makeUser = async (role, profile) => {
    const user = await User.create({ role, firstName: role, phoneNum: String(phone++), loginCodeHash: 'x' });
    const token = jwt.sign({ userId: user._id }, SECRET);
    await Session.create({ userId: user._id, token, isActive: true, expiresAt: new Date(Date.now() + 86400000) });
    if (profile) await StudentProfile.create({ userId: user._id, ...profile });
    return { user, token };
};

const open = (token) => new Promise((resolve, reject) => {
    const s = connect(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', (err) => reject(err));
});

const join = (s, examId, extra = {}) => new Promise((resolve) => s.emit('liveExam:join', { examId, ...extra }, resolve));

const nextEvent = (s, event, predicate = () => true, ms = 15000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    const handler = (payload) => {
        if (!predicate(payload)) return;
        clearTimeout(timer);
        s.off(event, handler);
        resolve(payload);
    };
    s.on(event, handler);
});

const http = async (method, url, token, body) => {
    const res = await fetch(`${BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json() };
};

const waitForServer = async () => {
    for (let i = 0; i < 240; i++) {
        try {
            const r = await fetch(`${BASE}/health`);
            if (r.ok) return;
        } catch (_) { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('server did not start');
};

beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    const uri = mongod.getUri('dmbhatt_socket_test');
    await mongoose.connect(uri);

    server = spawn(process.execPath, ['-r', './tests/helpers/stubMissingCanvas.js', 'server.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), MONGODB_URI: uri, JWT_SECRET: SECRET },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stderr.on('data', (d) => {
        const text = String(d);
        if (/Error|ERR/.test(text) && !/Firebase|firebase/.test(text)) process.stderr.write(`[server] ${text}`);
    });
    await waitForServer();

    const bank = await Exam.create({ subject: 'Science', title: 'Bank', totalMarks: 2, std: '10', medium: 'English', board: 'GSEB', unit: '1' });
    const qs = await Question.insertMany([1, 2].map((n) => ({
        examId: bank._id, questionText: `Q${n}`, correctAnswer: 'A', marks: 1,
        options: ['A', 'B'].map((key) => ({ key, text: key }))
    })));
    exam = await LiveExam.create({
        title: 'Socket Exam', subject: 'Science', std: '10', board: 'GSEB', medium: 'English',
        questions: qs.map((q) => q._id), questionCount: 2, totalMarks: 2,
        startAt: new Date(Date.now() + 5 * 1000), endAt: new Date(Date.now() + 30 * 60 * 1000),
        durationMinutes: 30, queueOpensBeforeMinutes: 30, status: 'SCHEDULED'
    });
});

afterAll(async () => {
    sockets.forEach((s) => s.connected && s.disconnect());
    if (server) server.kill();
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

test('existing routes still respond on the same server', async () => {
    const r = await fetch(`${BASE}/health`);
    expect(r.status).toBe(200);
    const exams = await fetch(`${BASE}/api/exam/all`);
    expect(exams.status).toBe(200);
});

test('connections without a valid session are refused', async () => {
    await expect(open('not-a-token')).rejects.toThrow('UNAUTHORIZED');
    const orphan = jwt.sign({ userId: new mongoose.Types.ObjectId() }, SECRET);
    await expect(open(orphan)).rejects.toThrow('SESSION_REVOKED');
});

test('presence: tabs count once, other classes are refused, disconnect is removed, status + leaderboard pushed', async () => {
    const admin = await makeUser('admin');
    const a = await makeUser('student', { std: '10', board: 'GSEB', medium: 'English' });
    const b = await makeUser('student', { std: '10', board: 'GSEB', medium: 'English' });
    const other = await makeUser('student', { std: '9', board: 'GSEB', medium: 'English' });
    const examId = String(exam._id);

    const monitor = await open(admin.token);
    const joinedMonitor = await join(monitor, examId);
    expect(joinedMonitor.ok).toBe(true);
    expect(joinedMonitor.onlineCount).toBe(0); // staff are not counted

    const denied = await join(await open(other.token), examId);
    expect(denied.ok).toBe(false);

    // Watching (list screen) receives numbers but is not "online".
    const watcher = await open((await makeUser('student', { std: '10', board: 'GSEB', medium: 'English' })).token);
    const watched = await join(watcher, examId, { watch: true });
    expect(watched.ok).toBe(true);
    expect(watched.onlineCount).toBe(0);
    // Entering the waiting room counts; going back to watching stops counting.
    expect((await join(watcher, examId)).onlineCount).toBe(1);
    expect((await join(watcher, examId, { watch: true })).onlineCount).toBe(0);

    const a1 = await open(a.token);
    const a2 = await open(a.token); // same student, second tab
    expect((await join(a1, examId)).ok).toBe(true);
    const second = await join(a2, examId);
    expect(second.onlineCount).toBe(1);

    const b1 = await open(b.token);
    const statsTwo = nextEvent(monitor, 'liveExam:stats', (p) => p.onlineCount === 2);
    await join(b1, examId);
    expect((await statsTwo).onlineCount).toBe(2);

    // Queue count is pushed after a join through the REST API.
    const statsQueue = nextEvent(monitor, 'liveExam:stats', (p) => p.queueCount === 1);
    const q = await http('POST', `/api/liveexam/${examId}/queue`, a.token);
    expect(q.status).toBe(200);
    expect((await statsQueue).queueCount).toBe(1);

    // Closing one of A's tabs keeps A online; closing the last removes A.
    a2.disconnect();
    await new Promise((r) => setTimeout(r, 1500));
    const statsOne = nextEvent(monitor, 'liveExam:stats', (p) => p.onlineCount === 1);
    a1.disconnect();
    expect((await statsOne).onlineCount).toBe(1);

    // The ticker announces LIVE once the server clock passes startAt.
    const live = await nextEvent(b1, 'liveExam:status', (p) => p.status === 'LIVE', 20000);
    expect(live.examId).toBe(examId);

    // A first-attempt submit pushes the leaderboard to the room.
    const board = nextEvent(monitor, 'liveExam:leaderboard', (p) => p.total === 1);
    const started = await http('POST', `/api/liveexam/${examId}/start`, b.token);
    expect(started.status).toBe(201);
    const qids = started.body.questions.map((x) => x._id);
    const sub = await http('POST', `/api/liveexam/attempt/${started.body.attempt._id}/submit`, b.token, {
        answers: [{ questionId: qids[0], selectedKey: 'A' }, { questionId: qids[1], selectedKey: 'B' }]
    });
    expect(sub.body.attempt.obtainedMarks).toBe(1);
    const pushed = await board;
    expect(pushed.entries[0].obtainedMarks).toBe(1);
    expect(pushed.entries[0].rank).toBe(1);

    // Admin cancelling is pushed immediately.
    const cancelled = nextEvent(b1, 'liveExam:status', (p) => p.status === 'CANCELLED');
    await http('PUT', `/api/liveexam/admin/${examId}/cancel`, admin.token, {});
    expect((await cancelled).status).toBe('CANCELLED');
});
