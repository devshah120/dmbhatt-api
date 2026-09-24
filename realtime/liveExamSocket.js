const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('../models/User');
const Session = require('../models/Session');
const StudentProfile = require('../models/StudentProfile');
const LiveExam = require('../models/LiveExam');
const LiveExamQueue = require('../models/LiveExamQueue');
const liveExamService = require('../utils/liveExamService');

/**
 * Socket.IO layer for Live Arena.
 *
 * Clients join one room per exam they are looking at ({ examId, watch? }). The server pushes:
 *   liveExam:stats        { examId, queueCount, onlineCount, status, startAt, endAt, serverTime }
 *   liveExam:status       { examId, status, startAt, endAt, serverTime }   (phase changed)
 *   liveExam:leaderboard  { examId, total, entries }                        (top 10)
 *
 * ONLINE COUNT: the number of distinct students with at least one open socket
 * in the exam room. It is derived from live connections, never from anything a
 * client reports; a dropped connection is removed by Socket.IO's ping timeout.
 * (Held in process memory: running several API instances would need the
 * socket.io Redis adapter.)
 */

const STAFF_ROLES = ['admin', 'super admin'];
const MAX_ROOMS_PER_SOCKET = 20;
const STATS_THROTTLE_MS = 1000;
const LEADERBOARD_THROTTLE_MS = 2000;
const STATUS_TICK_MS = 3000;
const SWEEP_EVERY_TICKS = 10; // ~30s
const EXAM_CACHE_TTL_MS = 30 * 1000;

let io = null;
let ticker = null;

// examId -> Map(studentId -> Set(socketId))
const presence = new Map();
// examId -> { exam, at }
const examCache = new Map();
// examId -> last phase pushed to the room
const lastStatus = new Map();
const statsTimers = new Map();
const leaderboardTimers = new Map();

const roomOf = (examId) => `liveExam:${examId}`;

const getExamCached = async (examId, { fresh = false } = {}) => {
    const hit = examCache.get(examId);
    if (!fresh && hit && Date.now() - hit.at < EXAM_CACHE_TTL_MS) return hit.exam;
    const exam = await LiveExam.findById(examId)
        .select('status startAt endAt queueOpensBeforeMinutes std board medium stream isDeleted')
        .lean();
    examCache.set(examId, { exam, at: Date.now() });
    return exam;
};

const getOnlineCount = (examId) => presence.get(String(examId))?.size || 0;
const isOnline = (examId, studentId) => !!presence.get(String(examId))?.has(String(studentId));

const addPresence = (examId, studentId, socketId) => {
    if (!presence.has(examId)) presence.set(examId, new Map());
    const students = presence.get(examId);
    if (!students.has(studentId)) students.set(studentId, new Set());
    students.get(studentId).add(socketId);
};

const removePresence = (examId, studentId, socketId) => {
    const students = presence.get(examId);
    const sockets = students?.get(studentId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) students.delete(studentId);
    if (students.size === 0) presence.delete(examId);
};

const buildStats = async (examId, exam) => {
    const queueCount = await LiveExamQueue.countDocuments({ liveExamId: examId });
    return {
        examId,
        queueCount,
        onlineCount: getOnlineCount(examId),
        status: liveExamService.getEffectiveStatus(exam),
        startAt: exam.startAt,
        endAt: exam.endAt,
        serverTime: new Date()
    };
};

/** Coalesce bursts (e.g. 500 students joining at once) into one push per second. */
const scheduleStats = (examId) => {
    if (!io) return;
    const id = String(examId);
    if (statsTimers.has(id)) return;

    const timer = setTimeout(async () => {
        statsTimers.delete(id);
        try {
            const exam = await getExamCached(id);
            if (!exam) return;
            io.to(roomOf(id)).emit('liveExam:stats', await buildStats(id, exam));
        } catch (err) {
            console.error('[LiveExam socket] stats push failed:', err.message);
        }
    }, STATS_THROTTLE_MS);
    timer.unref?.();
    statsTimers.set(id, timer);
};

const scheduleLeaderboard = (examId) => {
    if (!io) return;
    const id = String(examId);
    if (leaderboardTimers.has(id)) return;

    const timer = setTimeout(async () => {
        leaderboardTimers.delete(id);
        try {
            const board = await liveExamService.getLeaderboard(id, { page: 1, limit: 10 });
            io.to(roomOf(id)).emit('liveExam:leaderboard', {
                examId: id,
                total: board.total,
                entries: board.entries
            });
        } catch (err) {
            console.error('[LiveExam socket] leaderboard push failed:', err.message);
        }
    }, LEADERBOARD_THROTTLE_MS);
    timer.unref?.();
    leaderboardTimers.set(id, timer);
};

/** Called after an admin edits / publishes / cancels an exam. */
const notifyExamChanged = async (examId) => {
    if (!io) return;
    const id = String(examId);
    try {
        const exam = await getExamCached(id, { fresh: true });
        if (!exam) return;
        const status = exam.isDeleted ? liveExamService.PHASE.CANCELLED : liveExamService.getEffectiveStatus(exam);
        lastStatus.set(id, status);
        io.to(roomOf(id)).emit('liveExam:status', {
            examId: id,
            status,
            startAt: exam.startAt,
            endAt: exam.endAt,
            serverTime: new Date()
        });
        scheduleStats(id);
    } catch (err) {
        console.error('[LiveExam socket] exam change push failed:', err.message);
    }
};

const authenticate = async (socket, next) => {
    try {
        const header = socket.handshake.headers?.authorization || '';
        const token = socket.handshake.auth?.token || (header.startsWith('Bearer ') ? header.slice(7) : null);
        if (!token) return next(new Error('UNAUTHORIZED'));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const session = await Session.findOne({ token, isActive: true }).select('_id').lean();
        if (!session) return next(new Error('SESSION_REVOKED'));

        const user = await User.findById(decoded.userId).select('role firstName').lean();
        if (!user) return next(new Error('UNAUTHORIZED'));

        socket.data.user = user;
        socket.data.isStaff = STAFF_ROLES.includes(user.role);
        socket.data.liveExams = new Set();
        if (user.role === 'student') {
            socket.data.profile = await StudentProfile.findOne({ userId: user._id })
                .select('std board medium stream')
                .lean();
        }
        next();
    } catch (err) {
        next(new Error('UNAUTHORIZED'));
    }
};

const handleConnection = (socket) => {
    const userId = String(socket.data.user._id);

    socket.on('liveExam:join', async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
            const examId = String(payload?.examId || '');
            if (!liveExamService.isValidId(examId)) return reply({ ok: false, message: 'Invalid exam' });

            const already = socket.data.liveExams.has(examId);
            if (!already && socket.data.liveExams.size >= MAX_ROOMS_PER_SOCKET) {
                return reply({ ok: false, message: 'Too many exams open' });
            }

            const exam = await getExamCached(examId);
            if (!exam || exam.isDeleted) return reply({ ok: false, message: 'Exam not found' });

            if (!socket.data.isStaff) {
                const allowed = socket.data.user.role === 'student'
                    && exam.status !== 'DRAFT'
                    && liveExamService.isEligible(exam, socket.data.profile);
                if (!allowed) return reply({ ok: false, message: 'Not available for your class' });
            }

            socket.join(roomOf(examId));
            socket.data.liveExams.add(examId);
            // `watch` = just following the numbers (e.g. the list screen); only the
            // waiting room and the exam itself count the student as online.
            if (!socket.data.isStaff) {
                if (payload?.watch) removePresence(examId, userId, socket.id);
                else addPresence(examId, userId, socket.id);
            }
            if (!lastStatus.has(examId)) lastStatus.set(examId, liveExamService.getEffectiveStatus(exam));

            reply({ ok: true, ...(await buildStats(examId, exam)) });
            scheduleStats(examId);
        } catch (err) {
            console.error('[LiveExam socket] join failed:', err.message);
            reply({ ok: false, message: 'Could not join' });
        }
    });

    socket.on('liveExam:leave', (payload) => {
        const examId = String(payload?.examId || '');
        if (!socket.data.liveExams.has(examId)) return;
        socket.leave(roomOf(examId));
        socket.data.liveExams.delete(examId);
        if (!socket.data.isStaff) removePresence(examId, userId, socket.id);
        scheduleStats(examId);
    });

    socket.on('disconnect', () => {
        for (const examId of socket.data.liveExams) {
            if (!socket.data.isStaff) removePresence(examId, userId, socket.id);
            scheduleStats(examId);
        }
        socket.data.liveExams.clear();
    });
};

let tickCount = 0;
let ticking = false;
const tick = async () => {
    if (ticking) return; // a slow sweep must not overlap the next tick
    ticking = true;
    tickCount++;
    try {
        // Push phase changes (QUEUE_OPEN -> LIVE -> COMPLETED) to rooms that have viewers.
        for (const room of io.sockets.adapter.rooms.keys()) {
            if (!room.startsWith('liveExam:')) continue;
            const examId = room.slice('liveExam:'.length);
            const exam = await getExamCached(examId);
            if (!exam) continue;

            const status = liveExamService.getEffectiveStatus(exam);
            if (lastStatus.get(examId) !== status) {
                lastStatus.set(examId, status);
                io.to(room).emit('liveExam:status', {
                    examId,
                    status,
                    startAt: exam.startAt,
                    endAt: exam.endAt,
                    serverTime: new Date()
                });
                scheduleStats(examId);
            }
        }
        for (const examId of lastStatus.keys()) {
            if (!io.sockets.adapter.rooms.has(roomOf(examId))) lastStatus.delete(examId);
        }

        // Close attempts whose deadline passed without a submit.
        if (tickCount % SWEEP_EVERY_TICKS === 0) {
            const changed = await liveExamService.autoSubmitExpired();
            changed.forEach((examId) => scheduleLeaderboard(examId));
        }
    } catch (err) {
        console.error('[LiveExam socket] tick failed:', err.message);
    } finally {
        ticking = false;
    }
};

const init = (httpServer) => {
    io = new Server(httpServer, { cors: { origin: '*' } });
    io.use(authenticate);
    io.on('connection', handleConnection);

    ticker = setInterval(tick, STATUS_TICK_MS);
    ticker.unref?.();

    console.log('✓ Live Arena realtime ready');
    return io;
};

module.exports = {
    init,
    getOnlineCount,
    isOnline,
    scheduleStats,
    scheduleLeaderboard,
    notifyExamChanged
};
