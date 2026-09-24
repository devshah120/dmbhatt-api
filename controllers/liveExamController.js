const mongoose = require('mongoose');
const LiveExam = require('../models/LiveExam');
const LiveExamQueue = require('../models/LiveExamQueue');
const LiveExamAttempt = require('../models/LiveExamAttempt');
const Question = require('../models/Question');
const StudentProfile = require('../models/StudentProfile');
const ScheduledNotification = require('../models/ScheduledNotification');
const ActivityLog = require('../models/ActivityLog');
const svc = require('../utils/liveExamService');
const realtime = require('../realtime/liveExamSocket');

const { PHASE, FINISHED_STATUSES, SUBMIT_GRACE_MS } = svc;

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const logActivity = (req, action, title) => ActivityLog.create({
    entityType: 'Exam',
    action,
    targetName: `Live Exam: ${title}`,
    performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
    performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
}).catch((err) => console.error('[LiveExam] Activity log failed:', err.message));

const paging = (req, defaultLimit = 50) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || defaultLimit, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    return { page, limit, skip: (page - 1) * limit };
};

/** Public-facing shape of an exam (no questions, no answers). */
const summarize = (exam, now = new Date()) => ({
    _id: exam._id,
    title: exam.title,
    description: exam.description,
    instructions: exam.instructions,
    subject: exam.subject,
    std: exam.std,
    board: exam.board,
    medium: exam.medium,
    stream: exam.stream,
    questionCount: exam.questionCount,
    totalMarks: exam.totalMarks,
    passingMarks: exam.passingMarks,
    startAt: exam.startAt,
    endAt: exam.endAt,
    durationMinutes: exam.durationMinutes,
    queueOpensAt: svc.queueOpensAt(exam),
    status: svc.getEffectiveStatus(exam, now)
});

const countQueues = async (ids) => {
    if (ids.length === 0) return new Map();
    const rows = await LiveExamQueue.aggregate([
        { $match: { liveExamId: { $in: ids } } },
        { $group: { _id: '$liveExamId', n: { $sum: 1 } } }
    ]);
    return new Map(rows.map((r) => [String(r._id), r.n]));
};

const getStudentProfile = (userId) =>
    StudentProfile.findOne({ userId }).select('std board medium stream').lean();

/** Load an exam a student is allowed to see, or send the error response. */
const loadExamForStudent = async (req, res) => {
    const { id } = req.params;
    if (!svc.isValidId(id)) {
        res.status(400).json({ message: 'Invalid exam id' });
        return null;
    }
    const [exam, profile] = await Promise.all([
        LiveExam.findOne({ _id: id, isDeleted: { $ne: true } }).lean(),
        getStudentProfile(req.user._id)
    ]);
    if (!exam || exam.status === 'DRAFT') {
        res.status(404).json({ message: 'Live exam not found' });
        return null;
    }
    if (!svc.isEligible(exam, profile)) {
        res.status(403).json({ message: 'This live exam is not available for your class' });
        return null;
    }
    return exam;
};

// ---------------------------------------------------------------------------
// Staff (admin / super admin)
// ---------------------------------------------------------------------------

const TEXT_FIELDS = ['title', 'description', 'instructions'];

/** Validate and normalise the editable fields. Returns { values } or { error }. */
const readExamInput = async (body, existing = null) => {
    const pick = (k) => (body[k] !== undefined ? body[k] : existing?.[k]);
    const values = {};

    values.title = String(pick('title') || '').trim();
    if (!values.title) return { error: 'Exam name is required' };
    if (values.title.length > 200) return { error: 'Exam name is too long' };
    values.description = String(pick('description') || '').slice(0, 2000);
    values.instructions = String(pick('instructions') || '').slice(0, 5000);

    for (const k of ['subject', 'std', 'board', 'medium']) {
        values[k] = String(pick(k) || '').trim();
        if (!values[k]) return { error: `${k === 'std' ? 'Standard' : k[0].toUpperCase() + k.slice(1)} is required` };
    }
    values.stream = String(pick('stream') || 'None').trim() || 'None';

    const startAt = new Date(pick('startAt'));
    if (Number.isNaN(startAt.getTime())) return { error: 'A valid exam date and start time is required' };
    values.startAt = startAt;

    const duration = parseInt(pick('durationMinutes'), 10);
    if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
        return { error: 'Duration must be between 1 and 600 minutes' };
    }
    values.durationMinutes = duration;
    values.endAt = new Date(startAt.getTime() + duration * 60 * 1000);

    const queueLead = pick('queueOpensBeforeMinutes');
    const lead = queueLead === undefined || queueLead === null || queueLead === '' ? 30 : parseInt(queueLead, 10);
    if (!Number.isInteger(lead) || lead < 0 || lead > 1440) {
        return { error: 'Queue opening time must be between 0 and 1440 minutes before start' };
    }
    values.queueOpensBeforeMinutes = lead;

    const rawQuestions = body.questionIds !== undefined ? body.questionIds : existing?.questions;
    const resolved = await svc.resolveQuestions(Array.isArray(rawQuestions) ? rawQuestions : []);
    values.questions = resolved.questions;
    values.questionCount = resolved.questionCount;
    values.totalMarks = resolved.totalMarks;

    const rawSources = body.sourceExamIds !== undefined ? body.sourceExamIds : existing?.sourceExamIds;
    values.sourceExamIds = (Array.isArray(rawSources) ? rawSources : []).filter(svc.isValidId);

    const passing = Number(pick('passingMarks') || 0);
    if (!Number.isFinite(passing) || passing < 0) return { error: 'Passing marks cannot be negative' };
    if (passing > values.totalMarks) return { error: 'Passing marks cannot exceed total marks' };
    values.passingMarks = passing;

    return { values };
};

const validateForPublish = (values) => {
    if (!values.questions || values.questions.length === 0) return 'Select at least one question before scheduling';
    if (new Date(values.startAt).getTime() <= Date.now()) return 'Start time must be in the future';
    return null;
};

const createLiveExam = async (req, res) => {
    try {
        const { values, error } = await readExamInput(req.body);
        if (error) return res.status(400).json({ message: error });

        const status = req.body.status === 'SCHEDULED' ? 'SCHEDULED' : 'DRAFT';
        if (status === 'SCHEDULED') {
            const publishError = validateForPublish(values);
            if (publishError) return res.status(400).json({ message: publishError });
        }

        const exam = await LiveExam.create({ ...values, status, createdBy: req.user._id });
        if (status === 'SCHEDULED') await svc.syncReminders(exam);

        logActivity(req, 'Added', exam.title);
        res.status(201).json({ message: 'Live exam created successfully', exam });
    } catch (err) {
        console.error('Create Live Exam Error:', err);
        res.status(500).json({ message: 'Failed to create live exam', error: err.message });
    }
};

const updateLiveExam = async (req, res) => {
    try {
        const { id } = req.params;
        if (!svc.isValidId(id)) return res.status(400).json({ message: 'Invalid exam id' });

        const exam = await LiveExam.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!exam) return res.status(404).json({ message: 'Live exam not found' });

        const phase = svc.getEffectiveStatus(exam);
        if (phase === PHASE.CANCELLED || phase === PHASE.COMPLETED) {
            return res.status(400).json({ message: `A ${phase.toLowerCase()} exam cannot be edited` });
        }

        if (phase === PHASE.LIVE) {
            // The paper and the clock are frozen once students are sitting it.
            TEXT_FIELDS.forEach((k) => {
                if (req.body[k] !== undefined) exam[k] = String(req.body[k]).slice(0, k === 'instructions' ? 5000 : 2000);
            });
            if (!String(exam.title || '').trim()) return res.status(400).json({ message: 'Exam name is required' });
        } else {
            const { values, error } = await readExamInput(req.body, exam.toObject());
            if (error) return res.status(400).json({ message: error });
            if (exam.status === 'SCHEDULED') {
                const publishError = validateForPublish(values);
                if (publishError) return res.status(400).json({ message: publishError });
            }
            Object.assign(exam, values);
        }

        exam.updatedBy = req.user._id;
        await exam.save();
        if (exam.status === 'SCHEDULED' && phase !== PHASE.LIVE) await svc.syncReminders(exam);
        realtime.notifyExamChanged(exam._id);

        logActivity(req, 'Updated', exam.title);
        res.status(200).json({ message: 'Live exam updated successfully', exam });
    } catch (err) {
        console.error('Update Live Exam Error:', err);
        res.status(500).json({ message: 'Failed to update live exam', error: err.message });
    }
};

const publishLiveExam = async (req, res) => {
    try {
        const { id } = req.params;
        if (!svc.isValidId(id)) return res.status(400).json({ message: 'Invalid exam id' });

        const exam = await LiveExam.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!exam) return res.status(404).json({ message: 'Live exam not found' });
        if (exam.status !== 'DRAFT') return res.status(400).json({ message: 'Only a draft can be scheduled' });

        const publishError = validateForPublish(exam);
        if (publishError) return res.status(400).json({ message: publishError });

        exam.status = 'SCHEDULED';
        exam.updatedBy = req.user._id;
        await exam.save();
        await svc.syncReminders(exam);
        realtime.notifyExamChanged(exam._id);

        logActivity(req, 'Updated', exam.title);
        res.status(200).json({ message: 'Live exam scheduled', exam });
    } catch (err) {
        console.error('Publish Live Exam Error:', err);
        res.status(500).json({ message: 'Failed to schedule live exam', error: err.message });
    }
};

const cancelLiveExam = async (req, res) => {
    try {
        const { id } = req.params;
        if (!svc.isValidId(id)) return res.status(400).json({ message: 'Invalid exam id' });

        const exam = await LiveExam.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!exam) return res.status(404).json({ message: 'Live exam not found' });

        const phase = svc.getEffectiveStatus(exam);
        if (phase === PHASE.CANCELLED) return res.status(400).json({ message: 'Exam is already cancelled' });
        if (phase === PHASE.COMPLETED) return res.status(400).json({ message: 'A completed exam cannot be cancelled' });

        exam.status = 'CANCELLED';
        exam.cancelledAt = new Date();
        exam.cancelledBy = req.user._id;
        exam.cancelReason = String(req.body?.reason || '').slice(0, 500);
        exam.updatedBy = req.user._id;
        await exam.save();
        await svc.syncReminders(exam); // withdraws pending reminders
        realtime.notifyExamChanged(exam._id);

        logActivity(req, 'Updated', `${exam.title} (Cancelled)`);
        res.status(200).json({ message: 'Live exam cancelled', exam });
    } catch (err) {
        console.error('Cancel Live Exam Error:', err);
        res.status(500).json({ message: 'Failed to cancel live exam', error: err.message });
    }
};

const deleteLiveExam = async (req, res) => {
    try {
        const { id } = req.params;
        if (!svc.isValidId(id)) return res.status(400).json({ message: 'Invalid exam id' });

        const exam = await LiveExam.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!exam) return res.status(404).json({ message: 'Live exam not found' });

        // Results are never destroyed: an exam anyone has sat must be cancelled instead.
        const attempts = await LiveExamAttempt.countDocuments({ liveExamId: exam._id });
        if (attempts > 0) {
            return res.status(400).json({ message: 'Students have already attempted this exam. Cancel it instead of deleting.' });
        }

        if (exam.reminderNotificationIds?.length) {
            await ScheduledNotification.deleteMany({ _id: { $in: exam.reminderNotificationIds }, status: 'pending' });
        }
        exam.isDeleted = true;
        exam.deletedAt = new Date();
        exam.deletedBy = req.user._id;
        await exam.save();
        realtime.notifyExamChanged(exam._id);

        logActivity(req, 'Deleted', exam.title);
        res.status(200).json({ message: 'Live exam deleted successfully' });
    } catch (err) {
        console.error('Delete Live Exam Error:', err);
        res.status(500).json({ message: 'Failed to delete live exam', error: err.message });
    }
};

const getAllLiveExamsAdmin = async (req, res) => {
    try {
        const exams = await LiveExam.find({ isDeleted: { $ne: true } })
            .select('-questions -reminderNotificationIds')
            .populate('createdBy', 'firstName')
            .sort({ startAt: -1 })
            .lean();

        const ids = exams.map((e) => e._id);
        const [queueCounts, submittedRows] = await Promise.all([
            countQueues(ids),
            ids.length ? LiveExamAttempt.aggregate([
                { $match: { liveExamId: { $in: ids }, isFirstAttempt: true, status: { $in: FINISHED_STATUSES } } },
                { $group: { _id: '$liveExamId', n: { $sum: 1 } } }
            ]) : []
        ]);
        const submitted = new Map(submittedRows.map((r) => [String(r._id), r.n]));
        const now = new Date();

        res.status(200).json(exams.map((e) => ({
            ...e,
            adminStatus: e.status,
            status: svc.getEffectiveStatus(e, now),
            queueOpensAt: svc.queueOpensAt(e),
            queueCount: queueCounts.get(String(e._id)) || 0,
            onlineCount: realtime.getOnlineCount(e._id),
            submittedCount: submitted.get(String(e._id)) || 0
        })));
    } catch (err) {
        console.error('Get Live Exams Error:', err);
        res.status(500).json({ message: 'Failed to fetch live exams', error: err.message });
    }
};

const getLiveExamAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        if (!svc.isValidId(id)) return res.status(400).json({ message: 'Invalid exam id' });

        const exam = await LiveExam.findOne({ _id: id, isDeleted: { $ne: true } })
            .populate('questions')
            .lean();
        if (!exam) return res.status(404).json({ message: 'Live exam not found' });

        res.status(200).json({
            ...exam,
            adminStatus: exam.status,
            status: svc.getEffectiveStatus(exam),
            queueOpensAt: svc.queueOpensAt(exam),
            queueCount: await LiveExamQueue.countDocuments({ liveExamId: exam._id }),
            onlineCount: realtime.getOnlineCount(exam._id)
        });
    } catch (err) {
        console.error('Get Live Exam Error:', err);
        res.status(500).json({ message: 'Failed to fetch live exam', error: err.message });
    }
};

const getQueueAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        if (!svc.isValidId(id)) return res.status(400).json({ message: 'Invalid exam id' });
        const { page, limit, skip } = paging(req);
        const liveExamId = toObjectId(id);

        const [rows, total] = await Promise.all([
            LiveExamQueue.aggregate([
                { $match: { liveExamId } },
                { $sort: { joinedAt: 1, _id: 1 } },
                { $skip: skip },
                { $limit: limit },
                { $lookup: { from: 'users', localField: 'studentId', foreignField: '_id', as: 'u' } },
                { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 0, studentId: 1, joinedAt: 1,
                        firstName: '$u.firstName', lastName: '$u.lastName', phoneNum: '$u.phoneNum'
                    }
                }
            ]),
            LiveExamQueue.countDocuments({ liveExamId })
        ]);

        res.status(200).json({
            page, limit, total,
            onlineCount: realtime.getOnlineCount(id),
            entries: rows.map((r, i) => ({
                position: skip + i + 1,
                ...r,
                name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || 'Student',
                online: realtime.isOnline(id, r.studentId)
            }))
        });
    } catch (err) {
        console.error('Get Live Exam Queue Error:', err);
        res.status(500).json({ message: 'Failed to fetch queue', error: err.message });
    }
};

const getParticipantsAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        if (!svc.isValidId(id)) return res.status(400).json({ message: 'Invalid exam id' });
        const { page, limit, skip } = paging(req);
        const liveExamId = toObjectId(id);

        const [rows, totalRows] = await Promise.all([
            LiveExamAttempt.aggregate([
                { $match: { liveExamId } },
                { $project: { answers: 0, questionOrder: 0 } },
                { $sort: { attemptNumber: 1 } },
                {
                    $group: {
                        _id: '$studentId',
                        attempts: { $sum: 1 },
                        first: { $first: '$$ROOT' },
                        bestPracticeMarks: {
                            $max: { $cond: [{ $eq: ['$isFirstAttempt', false] }, '$obtainedMarks', null] }
                        }
                    }
                },
                { $sort: { 'first.startedAt': 1, _id: 1 } },
                { $skip: skip },
                { $limit: limit },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
                { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } }
            ]),
            LiveExamAttempt.aggregate([{ $match: { liveExamId } }, { $group: { _id: '$studentId' } }, { $count: 'n' }])
        ]);

        res.status(200).json({
            page, limit,
            total: totalRows[0]?.n || 0,
            entries: rows.map((r) => ({
                studentId: r._id,
                name: [r.u?.firstName, r.u?.lastName].filter(Boolean).join(' ').trim() || 'Student',
                phoneNum: r.u?.phoneNum,
                online: realtime.isOnline(id, r._id),
                attempts: r.attempts,
                firstAttempt: {
                    status: r.first.status,
                    obtainedMarks: r.first.obtainedMarks,
                    totalMarks: r.first.totalMarks,
                    startedAt: r.first.startedAt,
                    submittedAt: r.first.submittedAt,
                    timeTakenMs: r.first.timeTakenMs
                },
                bestPracticeMarks: r.bestPracticeMarks
            }))
        });
    } catch (err) {
        console.error('Get Live Exam Participants Error:', err);
        res.status(500).json({ message: 'Failed to fetch participants', error: err.message });
    }
};

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Per-student card state. Decided on the server so the app can't show a wrong action. */
const studentState = ({ phase, inQueue, attempts, now }) => {
    const first = attempts.find((a) => a.isFirstAttempt);
    const firstDone = !!first && FINISHED_STATUSES.includes(first.status);
    const active = attempts.find((a) => a.status === 'IN_PROGRESS'
        && new Date(a.deadlineAt).getTime() + SUBMIT_GRACE_MS > now.getTime());

    let myState;
    if (phase === PHASE.CANCELLED) myState = 'CANCELLED';
    else if (active) myState = 'IN_PROGRESS';
    else if (phase === PHASE.LIVE) myState = firstDone ? 'SUBMITTED' : 'LIVE';
    else if (phase === PHASE.COMPLETED) myState = firstDone ? 'COMPLETED' : 'EXPIRED';
    else myState = inQueue ? 'IN_QUEUE' : 'UPCOMING';

    return {
        myState,
        inQueue,
        canJoinQueue: !inQueue && !first && (phase === PHASE.QUEUE_OPEN || phase === PHASE.LIVE),
        canLeaveQueue: inQueue && phase === PHASE.QUEUE_OPEN,
        canStart: !!active || (phase === PHASE.LIVE && !first),
        canRetake: !active && firstDone && (phase === PHASE.LIVE || phase === PHASE.COMPLETED),
        activeAttemptId: active?._id || null,
        attemptsCount: attempts.length,
        firstAttempt: firstDone ? {
            _id: first._id,
            obtainedMarks: first.obtainedMarks,
            totalMarks: first.totalMarks,
            status: first.status
        } : null
    };
};

const listForStudent = async (req, res) => {
    try {
        const profile = await getStudentProfile(req.user._id);
        const now = new Date();
        if (!profile) return res.status(200).json({ serverTime: now, exams: [] });

        // Lazily close this student's timed-out attempts so their states are exact.
        await svc.autoSubmitExpired({ studentId: req.user._id, limit: 20 });

        const base = {
            isDeleted: { $ne: true },
            status: { $in: ['SCHEDULED', 'CANCELLED'] },
            std: { $in: svc.stdCandidates(profile.std) }
        };
        const fields = '-questions -sourceExamIds -reminderNotificationIds';
        // Upcoming/running (soonest first) and recent past (newest first) are
        // fetched separately so a busy week of past exams can't crowd out what's next.
        const [upcoming, recent] = await Promise.all([
            LiveExam.find({ ...base, endAt: { $gte: now } }).select(fields).sort({ startAt: 1 }).limit(50).lean(),
            LiveExam.find({ ...base, endAt: { $lt: now, $gte: new Date(now.getTime() - RECENT_WINDOW_MS) } })
                .select(fields).sort({ endAt: -1 }).limit(20).lean()
        ]);

        const exams = [...upcoming, ...recent.reverse()].filter((e) => svc.isEligible(e, profile));
        const ids = exams.map((e) => e._id);

        const [queueCounts, myQueue, myAttempts] = await Promise.all([
            countQueues(ids),
            LiveExamQueue.find({ studentId: req.user._id, liveExamId: { $in: ids } }).select('liveExamId').lean(),
            LiveExamAttempt.find({ studentId: req.user._id, liveExamId: { $in: ids } })
                .select('liveExamId attemptNumber isFirstAttempt status deadlineAt obtainedMarks totalMarks')
                .lean()
        ]);
        const queued = new Set(myQueue.map((q) => String(q.liveExamId)));

        res.status(200).json({
            serverTime: now,
            exams: exams.map((e) => {
                const summary = summarize(e, now);
                const attempts = myAttempts.filter((a) => String(a.liveExamId) === String(e._id));
                return {
                    ...summary,
                    queueCount: queueCounts.get(String(e._id)) || 0,
                    onlineCount: realtime.getOnlineCount(e._id),
                    ...studentState({ phase: summary.status, inQueue: queued.has(String(e._id)), attempts, now })
                };
            })
        });
    } catch (err) {
        console.error('Live Exam Student List Error:', err);
        res.status(500).json({ message: 'Failed to fetch live exams', error: err.message });
    }
};

const getForStudent = async (req, res) => {
    try {
        const exam = await loadExamForStudent(req, res);
        if (!exam) return;
        await svc.autoSubmitExpired({ liveExamId: exam._id, studentId: req.user._id, limit: 5 });

        const now = new Date();
        const [queueCount, inQueue, attempts] = await Promise.all([
            LiveExamQueue.countDocuments({ liveExamId: exam._id }),
            LiveExamQueue.exists({ liveExamId: exam._id, studentId: req.user._id }),
            LiveExamAttempt.find({ liveExamId: exam._id, studentId: req.user._id })
                .select('attemptNumber isFirstAttempt status deadlineAt obtainedMarks totalMarks')
                .lean()
        ]);
        const summary = summarize(exam, now);

        res.status(200).json({
            serverTime: now,
            exam: {
                ...summary,
                queueCount,
                onlineCount: realtime.getOnlineCount(exam._id),
                ...studentState({ phase: summary.status, inQueue: !!inQueue, attempts, now })
            }
        });
    } catch (err) {
        console.error('Live Exam Student Detail Error:', err);
        res.status(500).json({ message: 'Failed to fetch live exam', error: err.message });
    }
};

const joinQueue = async (req, res) => {
    try {
        const exam = await loadExamForStudent(req, res);
        if (!exam) return;

        const phase = svc.getEffectiveStatus(exam);
        if (phase === PHASE.SCHEDULED) {
            return res.status(400).json({ message: 'The queue is not open yet', queueOpensAt: svc.queueOpensAt(exam) });
        }
        if (phase !== PHASE.QUEUE_OPEN && phase !== PHASE.LIVE) {
            return res.status(400).json({ message: 'This exam is no longer accepting students' });
        }

        let alreadyInQueue = false;
        try {
            const result = await LiveExamQueue.updateOne(
                { liveExamId: exam._id, studentId: req.user._id },
                { $setOnInsert: { joinedAt: new Date() } },
                { upsert: true }
            );
            alreadyInQueue = result.upsertedCount === 0;
        } catch (err) {
            if (err.code !== 11000) throw err; // concurrent join from another tab
            alreadyInQueue = true;
        }

        const queueCount = await LiveExamQueue.countDocuments({ liveExamId: exam._id });
        realtime.scheduleStats(exam._id);

        res.status(200).json({
            message: alreadyInQueue ? 'You are already in the queue' : 'You have joined the queue',
            inQueue: true,
            alreadyInQueue,
            queueCount,
            onlineCount: realtime.getOnlineCount(exam._id),
            status: phase,
            serverTime: new Date()
        });
    } catch (err) {
        console.error('Join Live Exam Queue Error:', err);
        res.status(500).json({ message: 'Failed to join queue', error: err.message });
    }
};

const leaveQueue = async (req, res) => {
    try {
        const exam = await loadExamForStudent(req, res);
        if (!exam) return;

        if (svc.getEffectiveStatus(exam) !== PHASE.QUEUE_OPEN) {
            return res.status(400).json({ message: 'You can only leave the queue before the exam starts' });
        }
        await LiveExamQueue.deleteOne({ liveExamId: exam._id, studentId: req.user._id });
        const queueCount = await LiveExamQueue.countDocuments({ liveExamId: exam._id });
        realtime.scheduleStats(exam._id);

        res.status(200).json({ message: 'You have left the queue', inQueue: false, queueCount });
    } catch (err) {
        console.error('Leave Live Exam Queue Error:', err);
        res.status(500).json({ message: 'Failed to leave queue', error: err.message });
    }
};

/** Questions for an attempt, in its order, WITHOUT correct answers. */
const questionsForStudent = async (order) => {
    const docs = await Question.find({ _id: { $in: order } })
        .select('questionText questionImage options marks')
        .lean();
    const byId = new Map(docs.map((q) => [String(q._id), q]));
    return order.map(String).filter((id) => byId.has(id)).map((id) => {
        const q = byId.get(id);
        return {
            _id: q._id,
            questionText: q.questionText,
            questionImage: q.questionImage,
            options: (q.options || []).map((o) => ({ key: o.key, text: o.text, image: o.image })),
            marks: Number(q.marks) > 0 ? Number(q.marks) : 1
        };
    });
};

const attemptView = (a) => ({
    _id: a._id,
    attemptNumber: a.attemptNumber,
    isFirstAttempt: a.isFirstAttempt,
    status: a.status,
    startedAt: a.startedAt,
    deadlineAt: a.deadlineAt,
    submittedAt: a.submittedAt,
    answers: (a.answers || []).filter((x) => x.selectedKey).map((x) => ({
        questionId: x.questionId,
        selectedKey: x.selectedKey
    }))
});

const startAttempt = async (req, res) => {
    try {
        const exam = await loadExamForStudent(req, res);
        if (!exam) return;
        const studentId = req.user._id;
        const now = new Date();
        const phase = svc.getEffectiveStatus(exam, now);

        // Any timed-out attempt of theirs is closed first, so it can't be resumed.
        await svc.autoSubmitExpired({ liveExamId: exam._id, studentId, limit: 5 });

        const respond = async (attempt, resumed) => res.status(resumed ? 200 : 201).json({
            resumed,
            serverTime: new Date(),
            exam: summarize(exam),
            attempt: attemptView(attempt),
            questions: await questionsForStudent(attempt.questionOrder)
        });

        const last = await LiveExamAttempt.findOne({ liveExamId: exam._id, studentId }).sort({ attemptNumber: -1 });
        if (last && last.status === 'IN_PROGRESS') return respond(last, true);

        const attemptNumber = last ? last.attemptNumber + 1 : 1;

        if (phase === PHASE.CANCELLED) return res.status(400).json({ message: 'This exam has been cancelled' });
        if (attemptNumber === 1) {
            if (phase === PHASE.SCHEDULED || phase === PHASE.QUEUE_OPEN) {
                return res.status(403).json({
                    code: 'NOT_STARTED',
                    message: 'The exam has not started yet',
                    startAt: exam.startAt,
                    serverTime: now
                });
            }
            if (phase === PHASE.COMPLETED) {
                return res.status(403).json({ code: 'EXPIRED', message: 'This exam has ended' });
            }
        } else if (phase !== PHASE.LIVE && phase !== PHASE.COMPLETED) {
            return res.status(400).json({ message: 'Retakes are not available right now' });
        }
        if (!exam.questions || exam.questions.length === 0) {
            return res.status(400).json({ message: 'This exam has no questions' });
        }

        const isFirstAttempt = attemptNumber === 1;
        const durationMs = exam.durationMinutes * 60 * 1000;

        let attempt;
        try {
            attempt = await LiveExamAttempt.create({
                liveExamId: exam._id,
                studentId,
                attemptNumber,
                isFirstAttempt,
                status: 'IN_PROGRESS',
                questionOrder: svc.questionOrderFor(exam, attemptNumber, studentId),
                answers: [],
                startedAt: now,
                // The live sitting closes with the exam window; a practice retake gets the full duration.
                deadlineAt: isFirstAttempt ? new Date(exam.endAt) : new Date(now.getTime() + durationMs)
            });
        } catch (err) {
            if (err.code !== 11000) throw err;
            // Another tab created this attempt a moment ago — hand that one back.
            const existing = await LiveExamAttempt.findOne({ liveExamId: exam._id, studentId, status: 'IN_PROGRESS' });
            if (existing) return respond(existing, true);
            return res.status(409).json({ message: 'Your attempt was just started elsewhere. Please retry.' });
        }

        if (isFirstAttempt) {
            // Late arrivals who never pressed "Join queue" still count as participants.
            await LiveExamQueue.updateOne(
                { liveExamId: exam._id, studentId },
                { $setOnInsert: { joinedAt: now } },
                { upsert: true }
            ).catch((err) => { if (err.code !== 11000) throw err; });
            realtime.scheduleStats(exam._id);
        }

        return respond(attempt, false);
    } catch (err) {
        console.error('Start Live Exam Attempt Error:', err);
        res.status(500).json({ message: 'Failed to start exam', error: err.message });
    }
};

const loadOwnAttempt = async (req, res) => {
    const { attemptId } = req.params;
    if (!svc.isValidId(attemptId)) {
        res.status(400).json({ message: 'Invalid attempt id' });
        return null;
    }
    const attempt = await LiveExamAttempt.findOne({ _id: attemptId, studentId: req.user._id });
    if (!attempt) {
        res.status(404).json({ message: 'Attempt not found' });
        return null;
    }
    return attempt;
};

const saveAnswers = async (req, res) => {
    try {
        const attempt = await loadOwnAttempt(req, res);
        if (!attempt) return;
        if (attempt.status !== 'IN_PROGRESS') {
            return res.status(409).json({ code: 'ALREADY_SUBMITTED', message: 'This attempt is already submitted' });
        }
        if (Date.now() > new Date(attempt.deadlineAt).getTime() + SUBMIT_GRACE_MS) {
            return res.status(409).json({ code: 'TIME_UP', message: 'Time is up for this attempt' });
        }

        const selections = svc.sanitizeSelections(req.body?.answers, attempt.questionOrder);
        const answers = [...selections.entries()].map(([questionId, selectedKey]) => ({
            questionId: toObjectId(questionId),
            selectedKey
        }));

        const updated = await LiveExamAttempt.updateOne(
            { _id: attempt._id, status: 'IN_PROGRESS' },
            { $set: { answers } }
        );
        if (updated.matchedCount === 0) {
            return res.status(409).json({ code: 'ALREADY_SUBMITTED', message: 'This attempt is already submitted' });
        }
        res.status(200).json({ saved: answers.length, serverTime: new Date() });
    } catch (err) {
        console.error('Save Live Exam Answers Error:', err);
        res.status(500).json({ message: 'Failed to save answers', error: err.message });
    }
};

/** The result screen payload; the leaderboard part always comes from the first attempt. */
const buildResult = async (exam, attempt, studentId) => {
    const phase = svc.getEffectiveStatus(exam);
    const [first, history] = await Promise.all([
        LiveExamAttempt.findOne({ liveExamId: exam._id, studentId, isFirstAttempt: true }).lean(),
        LiveExamAttempt.find({ liveExamId: exam._id, studentId })
            .select('attemptNumber isFirstAttempt status obtainedMarks totalMarks submittedAt timeTakenMs')
            .sort({ attemptNumber: 1 })
            .lean()
    ]);

    const firstDone = first && FINISHED_STATUSES.includes(first.status);
    const [rank, totalRanked] = await Promise.all([
        firstDone ? svc.rankOf(first) : null,
        LiveExamAttempt.countDocuments({
            liveExamId: exam._id, isFirstAttempt: true, status: { $in: FINISHED_STATUSES }
        })
    ]);

    const payload = {
        serverTime: new Date(),
        exam: summarize(exam),
        attempt: {
            _id: attempt._id,
            attemptNumber: attempt.attemptNumber,
            isFirstAttempt: attempt.isFirstAttempt,
            status: attempt.status,
            obtainedMarks: attempt.obtainedMarks,
            totalMarks: attempt.totalMarks,
            correctCount: attempt.correctCount,
            wrongCount: attempt.wrongCount,
            skippedCount: attempt.skippedCount,
            startedAt: attempt.startedAt,
            submittedAt: attempt.submittedAt,
            timeTakenMs: attempt.timeTakenMs
        },
        leaderboard: {
            score: firstDone ? first.obtainedMarks : null,
            totalMarks: firstDone ? first.totalMarks : exam.totalMarks,
            rank,
            totalRanked,
            firstAttemptId: first?._id || null
        },
        passed: exam.passingMarks > 0 ? attempt.obtainedMarks >= exam.passingMarks : null,
        attempts: history,
        review: null
    };

    // Correct answers stay hidden until the exam window closes, so they can't be passed around mid-exam.
    if (phase === PHASE.COMPLETED) {
        const questions = await Question.find({ _id: { $in: attempt.questionOrder } })
            .select('questionText questionImage options correctAnswer marks')
            .lean();
        const byId = new Map(questions.map((q) => [String(q._id), q]));
        const answerById = new Map((attempt.answers || []).map((a) => [String(a.questionId), a]));
        payload.review = attempt.questionOrder.map(String).filter((id) => byId.has(id)).map((id) => {
            const q = byId.get(id);
            const a = answerById.get(id);
            return {
                questionId: q._id,
                questionText: q.questionText,
                questionImage: q.questionImage,
                options: q.options,
                correctAnswer: q.correctAnswer,
                selectedKey: a?.selectedKey || null,
                isCorrect: !!a?.isCorrect,
                marks: Number(q.marks) > 0 ? Number(q.marks) : 1
            };
        });
    }
    return payload;
};

const submitAttempt = async (req, res) => {
    try {
        const attempt = await loadOwnAttempt(req, res);
        if (!attempt) return;
        const exam = await LiveExam.findById(attempt.liveExamId).lean();
        if (!exam) return res.status(404).json({ message: 'Live exam not found' });

        let final = attempt;
        let alreadySubmitted = true;
        if (attempt.status === 'IN_PROGRESS') {
            // Only the selected option keys are read from the body; marks, flags and
            // attempt numbers a client might add are ignored.
            const selections = svc.sanitizeSelections(req.body?.answers, attempt.questionOrder);
            const result = await svc.finalizeAttempt(attempt, { selections });
            final = result.attempt;
            alreadySubmitted = !result.finalizedNow;
            if (result.finalizedNow && final.isFirstAttempt) realtime.scheduleLeaderboard(exam._id);
        }

        const payload = await buildResult(exam, final, req.user._id);
        res.status(200).json({
            message: alreadySubmitted ? 'This attempt was already submitted' : 'Exam submitted successfully',
            alreadySubmitted,
            ...payload
        });
    } catch (err) {
        console.error('Submit Live Exam Error:', err);
        res.status(500).json({ message: 'Failed to submit exam', error: err.message });
    }
};

const getMyResult = async (req, res) => {
    try {
        const exam = await loadExamForStudent(req, res);
        if (!exam) return;
        await svc.autoSubmitExpired({ liveExamId: exam._id, studentId: req.user._id, limit: 5 });

        const query = { liveExamId: exam._id, studentId: req.user._id, status: { $in: FINISHED_STATUSES } };
        if (req.query.attemptId) {
            if (!svc.isValidId(req.query.attemptId)) return res.status(400).json({ message: 'Invalid attempt id' });
            query._id = req.query.attemptId;
        }
        const attempt = await LiveExamAttempt.findOne(query).sort({ attemptNumber: -1 });
        if (!attempt) return res.status(404).json({ message: 'No submitted attempt found' });

        res.status(200).json(await buildResult(exam, attempt, req.user._id));
    } catch (err) {
        console.error('Live Exam Result Error:', err);
        res.status(500).json({ message: 'Failed to fetch result', error: err.message });
    }
};

// ---------------------------------------------------------------------------
// Leaderboard (staff and eligible students)
// ---------------------------------------------------------------------------

const getLeaderboard = async (req, res) => {
    try {
        const { id } = req.params;
        if (!svc.isValidId(id)) return res.status(400).json({ message: 'Invalid exam id' });

        const isStaff = ['admin', 'super admin'].includes(req.user?.role);
        let exam;
        if (isStaff) {
            exam = await LiveExam.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
            if (!exam) return res.status(404).json({ message: 'Live exam not found' });
        } else {
            if (req.user?.role !== 'student') return res.status(403).json({ message: 'Not authorized' });
            exam = await loadExamForStudent(req, res);
            if (!exam) return;
        }

        const board = await svc.getLeaderboard(exam._id, { page: req.query.page, limit: req.query.limit });

        let me = null;
        if (!isStaff) {
            const first = await LiveExamAttempt.findOne({
                liveExamId: exam._id, studentId: req.user._id, isFirstAttempt: true, status: { $in: FINISHED_STATUSES }
            }).lean();
            if (first) {
                me = {
                    rank: await svc.rankOf(first),
                    obtainedMarks: first.obtainedMarks,
                    totalMarks: first.totalMarks,
                    timeTakenMs: first.timeTakenMs
                };
            }
        }

        res.status(200).json({
            serverTime: new Date(),
            exam: summarize(exam),
            ...board,
            me
        });
    } catch (err) {
        console.error('Live Exam Leaderboard Error:', err);
        res.status(500).json({ message: 'Failed to fetch leaderboard', error: err.message });
    }
};

module.exports = {
    createLiveExam,
    updateLiveExam,
    publishLiveExam,
    cancelLiveExam,
    deleteLiveExam,
    getAllLiveExamsAdmin,
    getLiveExamAdmin,
    getQueueAdmin,
    getParticipantsAdmin,
    listForStudent,
    getForStudent,
    joinQueue,
    leaveQueue,
    startAttempt,
    saveAnswers,
    submitAttempt,
    getMyResult,
    getLeaderboard
};
