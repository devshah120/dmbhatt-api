const mongoose = require('mongoose');
const LiveExam = require('../models/LiveExam');
const LiveExamAttempt = require('../models/LiveExamAttempt');
const Question = require('../models/Question');
const ScheduledNotification = require('../models/ScheduledNotification');
const { shuffleQuestions } = require('./examShuffleService');

/**
 * Live Arena business rules. Everything a student could try to influence —
 * exam phase, deadlines, marks, attempt number, first-attempt flag and rank —
 * is decided here from server data only.
 */

const PHASE = {
    DRAFT: 'DRAFT',
    SCHEDULED: 'SCHEDULED',
    QUEUE_OPEN: 'QUEUE_OPEN',
    LIVE: 'LIVE',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED'
};

const FINISHED_STATUSES = ['SUBMITTED', 'AUTO_SUBMITTED'];

// A submit that arrives this long after the deadline is still accepted as-is, to
// absorb network latency. Anything later is closed with the autosaved answers.
const SUBMIT_GRACE_MS = 15 * 1000;

const LEADERBOARD_MAX_PAGE = 100;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ''));

const queueOpensAt = (exam) =>
    new Date(new Date(exam.startAt).getTime() - (Number(exam.queueOpensBeforeMinutes) || 0) * 60 * 1000);

/** The phase an exam is in right now, derived from the server clock. */
const getEffectiveStatus = (exam, now = new Date()) => {
    if (!exam) return null;
    if (exam.status === 'CANCELLED') return PHASE.CANCELLED;
    if (exam.status === 'DRAFT') return PHASE.DRAFT;

    const t = now.getTime();
    if (t >= new Date(exam.endAt).getTime()) return PHASE.COMPLETED;
    if (t >= new Date(exam.startAt).getTime()) return PHASE.LIVE;
    if (t >= queueOpensAt(exam).getTime()) return PHASE.QUEUE_OPEN;
    return PHASE.SCHEDULED;
};

const norm = (v) => String(v ?? '').trim().toLowerCase();
/** "10", "Std 10" and "10th" all compare as "10". */
const stdKey = (v) => {
    const match = String(v ?? '').match(/\d+/);
    return match ? match[0] : norm(v);
};

/** Values an exam's `std` may be stored as for this student's standard. */
const stdCandidates = (std) => [...new Set([String(std ?? '').trim(), stdKey(std)].filter(Boolean))];

/** Can this student (by their server-side profile) see and sit this exam? */
const isEligible = (exam, profile) => {
    if (!exam || !profile) return false;
    if (stdKey(exam.std) !== stdKey(profile.std)) return false;
    if (norm(exam.board || 'GSEB') !== norm(profile.board || 'GSEB')) return false;
    if (norm(exam.medium) !== norm(profile.medium)) return false;

    const examStream = norm(exam.stream);
    if (examStream && examStream !== 'none' && norm(profile.stream) !== examStream) return false;
    return true;
};

/**
 * Accepts either [{ questionId, selectedKey }] or { [questionId]: key } and
 * returns a Map limited to the questions in this attempt. Anything else a client
 * sends (marks, isCorrect, ...) is ignored.
 */
const sanitizeSelections = (raw, questionOrder) => {
    const allowed = new Set((questionOrder || []).map(String));
    const out = new Map();

    const put = (qid, key) => {
        const id = String(qid || '');
        if (!allowed.has(id)) return;
        if (key === null || key === undefined || key === '') {
            out.delete(id);
            return;
        }
        const k = String(key).trim().toUpperCase();
        if (/^[A-Z]{1,2}$/.test(k)) out.set(id, k);
    };

    if (Array.isArray(raw)) {
        raw.slice(0, allowed.size).forEach((a) => a && put(a.questionId, a.selectedKey));
    } else if (raw && typeof raw === 'object') {
        Object.keys(raw).slice(0, allowed.size).forEach((qid) => put(qid, raw[qid]));
    }
    return out;
};

const selectionsFromAnswers = (answers) => {
    const out = new Map();
    (answers || []).forEach((a) => {
        if (a.selectedKey) out.set(String(a.questionId), a.selectedKey);
    });
    return out;
};

const loadQuestionsForGrading = (questionOrder) =>
    Question.find({ _id: { $in: questionOrder } }).select('correctAnswer marks options.key').lean();

/** Pure grading against the Question bank. */
const grade = (questionOrder, questions, selections) => {
    const byId = new Map(questions.map((q) => [String(q._id), q]));
    const answers = [];
    let obtainedMarks = 0;
    let totalMarks = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;

    (questionOrder || []).forEach((qid) => {
        const q = byId.get(String(qid));
        if (!q) return; // question removed from the bank after the exam was built

        const marks = Number(q.marks) > 0 ? Number(q.marks) : 1;
        totalMarks += marks;

        const validKeys = new Set((q.options || []).map((o) => String(o.key).toUpperCase()));
        let selectedKey = selections.get(String(qid)) || null;
        if (selectedKey && validKeys.size > 0 && !validKeys.has(selectedKey)) selectedKey = null;

        const isCorrect = !!selectedKey && selectedKey === String(q.correctAnswer).trim().toUpperCase();
        if (!selectedKey) skippedCount++;
        else if (isCorrect) correctCount++;
        else wrongCount++;

        const marksAwarded = isCorrect ? marks : 0;
        obtainedMarks += marksAwarded;
        answers.push({ questionId: q._id, selectedKey, isCorrect, marksAwarded });
    });

    return { answers, obtainedMarks, totalMarks, correctCount, wrongCount, skippedCount };
};

/**
 * Close an IN_PROGRESS attempt. The status guard in the update makes this safe
 * to race: whichever of submit / sweeper / second tab gets there first wins, and
 * everyone else reads that result back.
 *
 * @param {Object} attempt           LiveExamAttempt (doc or lean)
 * @param {Map|null} selections      answers from a timely submit; null = use autosave
 * @param {Array} [questions]        preloaded grading questions (sweeper batching)
 */
const finalizeAttempt = async (attempt, { selections = null, now = new Date(), questions = null } = {}) => {
    const deadline = new Date(attempt.deadlineAt).getTime();
    const late = now.getTime() > deadline + SUBMIT_GRACE_MS;

    const useSelections = (!late && selections) ? selections : selectionsFromAnswers(attempt.answers);
    const status = (!late && selections) ? 'SUBMITTED' : 'AUTO_SUBMITTED';
    const submittedAt = new Date(Math.min(now.getTime(), deadline));

    const gradingQuestions = questions || await loadQuestionsForGrading(attempt.questionOrder);
    const graded = grade(attempt.questionOrder, gradingQuestions, useSelections);

    const updated = await LiveExamAttempt.findOneAndUpdate(
        { _id: attempt._id, status: 'IN_PROGRESS' },
        {
            $set: {
                status,
                submittedAt,
                timeTakenMs: Math.max(0, submittedAt.getTime() - new Date(attempt.startedAt).getTime()),
                ...graded
            }
        },
        { new: true }
    );

    if (updated) return { attempt: updated, finalizedNow: true };
    return { attempt: await LiveExamAttempt.findById(attempt._id), finalizedNow: false };
};

/**
 * Auto-submit attempts whose deadline has passed (student closed the app, lost
 * network, server restarted mid-exam, ...). Runs from the realtime ticker and is
 * also invoked lazily by read paths, so it does not depend on uptime.
 *
 * @returns {Set<string>} exam ids whose leaderboard changed
 */
const autoSubmitExpired = async ({ liveExamId = null, studentId = null, limit = 200 } = {}) => {
    const cutoff = new Date(Date.now() - SUBMIT_GRACE_MS);
    const query = { status: 'IN_PROGRESS', deadlineAt: { $lt: cutoff } };
    if (liveExamId) query.liveExamId = liveExamId;
    if (studentId) query.studentId = studentId;

    const stale = await LiveExamAttempt.find(query).limit(limit);
    const changed = new Set();
    const questionCache = new Map();

    for (const attempt of stale) {
        try {
            const cacheKey = attempt.questionOrder.map(String).sort().join(',');
            if (!questionCache.has(cacheKey)) {
                questionCache.set(cacheKey, await loadQuestionsForGrading(attempt.questionOrder));
            }
            const { finalizedNow } = await finalizeAttempt(attempt, { questions: questionCache.get(cacheKey) });
            if (finalizedNow && attempt.isFirstAttempt) changed.add(String(attempt.liveExamId));
        } catch (err) {
            console.error('[LiveExam] Auto-submit failed for attempt', String(attempt._id), err.message);
        }
    }
    return changed;
};

/** Deterministic ranking order. Must match rankOf(). */
const LEADERBOARD_SORT = { obtainedMarks: -1, timeTakenMs: 1, submittedAt: 1, _id: 1 };

const leaderboardBaseQuery = (liveExamId) => ({
    liveExamId: new mongoose.Types.ObjectId(String(liveExamId)),
    isFirstAttempt: true,
    status: { $in: FINISHED_STATUSES }
});

/**
 * 1-based rank of a finished first attempt: the number of first attempts that
 * sort strictly ahead of it, plus one. One indexed count, no full scan in JS.
 */
const rankOf = async (attempt) => {
    if (!attempt || !attempt.isFirstAttempt || !FINISHED_STATUSES.includes(attempt.status)) return null;
    const m = attempt.obtainedMarks;
    const t = attempt.timeTakenMs;
    const s = attempt.submittedAt;

    const ahead = await LiveExamAttempt.countDocuments({
        ...leaderboardBaseQuery(attempt.liveExamId),
        $or: [
            { obtainedMarks: { $gt: m } },
            { obtainedMarks: m, timeTakenMs: { $lt: t } },
            { obtainedMarks: m, timeTakenMs: t, submittedAt: { $lt: s } },
            { obtainedMarks: m, timeTakenMs: t, submittedAt: s, _id: { $lt: attempt._id } }
        ]
    });
    return ahead + 1;
};

const getLeaderboard = async (liveExamId, { page = 1, limit = 50 } = {}) => {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), LEADERBOARD_MAX_PAGE);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (safePage - 1) * safeLimit;
    const base = leaderboardBaseQuery(liveExamId);

    const [rows, total] = await Promise.all([
        LiveExamAttempt.aggregate([
            { $match: base },
            { $sort: LEADERBOARD_SORT },
            { $skip: skip },
            { $limit: safeLimit },
            { $lookup: { from: 'users', localField: 'studentId', foreignField: '_id', as: 'u' } },
            { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    attemptId: '$_id',
                    studentId: 1,
                    firstName: '$u.firstName',
                    lastName: '$u.lastName',
                    photoPath: '$u.photoPath',
                    obtainedMarks: 1,
                    totalMarks: 1,
                    correctCount: 1,
                    timeTakenMs: 1,
                    submittedAt: 1,
                    status: 1
                }
            }
        ]),
        LiveExamAttempt.countDocuments(base)
    ]);

    return {
        page: safePage,
        limit: safeLimit,
        total,
        entries: rows.map((r, i) => ({
            rank: skip + i + 1,
            ...r,
            name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || 'Student'
        }))
    };
};

/** Question order for a new attempt: admin order first, reshuffled for retakes. */
const questionOrderFor = (exam, attemptNumber, studentId) =>
    shuffleQuestions(exam.questions.map(String), {
        attemptNumber,
        studentId: String(studentId),
        examId: String(exam._id)
    });

/** Derive questionCount / totalMarks from the actual questions. */
const resolveQuestions = async (questionIds) => {
    const ids = [...new Set((questionIds || []).map(String))].filter(isValidId);
    if (ids.length === 0) return { questions: [], questionCount: 0, totalMarks: 0 };

    const found = await Question.find({ _id: { $in: ids } }).select('marks').lean();
    const foundIds = new Set(found.map((q) => String(q._id)));
    const ordered = ids.filter((id) => foundIds.has(id));
    const marksById = new Map(found.map((q) => [String(q._id), Number(q.marks) > 0 ? Number(q.marks) : 1]));

    return {
        questions: ordered,
        questionCount: ordered.length,
        totalMarks: ordered.reduce((sum, id) => sum + marksById.get(id), 0)
    };
};

const formatIstTime = (date) => new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
});

const REMINDER_LEAD_MINUTES = 15;

/**
 * Keep this exam's push reminders in step with its schedule, through the
 * existing ScheduledNotification queue + notification worker (std topic).
 * Pending reminders are replaced; ones already sent are left alone.
 */
const syncReminders = async (exam) => {
    try {
        if (exam.reminderNotificationIds?.length) {
            await ScheduledNotification.deleteMany({
                _id: { $in: exam.reminderNotificationIds },
                status: 'pending'
            });
        }

        const ids = [];
        const phase = getEffectiveStatus(exam);
        const now = Date.now();
        const std = stdKey(exam.std);

        if (exam.status === 'SCHEDULED' && !exam.isDeleted && phase !== PHASE.COMPLETED) {
            const data = { type: 'live_exam', liveExamId: String(exam._id) };
            const reminderAt = new Date(new Date(exam.startAt).getTime() - REMINDER_LEAD_MINUTES * 60 * 1000);

            if (reminderAt.getTime() > now) {
                const n = await ScheduledNotification.create({
                    title: '⏰ Upcoming Live Exam',
                    body: `${exam.title} (${exam.subject}) starts at ${formatIstTime(exam.startAt)}. Join the queue in Live Arena.`,
                    std,
                    scheduledTime: reminderAt,
                    data
                });
                ids.push(n._id);
            }
            if (new Date(exam.startAt).getTime() > now) {
                const n = await ScheduledNotification.create({
                    title: '🟢 Your Live Exam is LIVE',
                    body: `${exam.title} has started. Enter now from Live Arena.`,
                    std,
                    scheduledTime: exam.startAt,
                    data
                });
                ids.push(n._id);
            }
        }

        await LiveExam.updateOne({ _id: exam._id }, { $set: { reminderNotificationIds: ids } });
        exam.reminderNotificationIds = ids;
    } catch (err) {
        // Reminders are best-effort; never fail the admin action over them.
        console.error('[LiveExam] Failed to sync reminders:', err.message);
    }
};

module.exports = {
    PHASE,
    FINISHED_STATUSES,
    SUBMIT_GRACE_MS,
    isValidId,
    queueOpensAt,
    getEffectiveStatus,
    stdKey,
    stdCandidates,
    isEligible,
    sanitizeSelections,
    grade,
    finalizeAttempt,
    autoSubmitExpired,
    rankOf,
    getLeaderboard,
    questionOrderFor,
    resolveQuestions,
    syncReminders
};
