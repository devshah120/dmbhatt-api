const mongoose = require('mongoose');
const ObjectivesTestSeries = require('../models/ObjectivesTestSeries');
const ObjectivesTestSeriesResult = require('../models/ObjectivesTestSeriesResult');
const ObjectivesTestSeriesAttemptStart = require('../models/ObjectivesTestSeriesAttemptStart');
const ActivityLog = require('../models/ActivityLog');
const ScheduledNotification = require('../models/ScheduledNotification');
const pdfImgConvert = require('pdf-img-convert');
const Tesseract = require('tesseract.js');
const { PDFParse } = require('pdf-parse');
const { shuffleQuestions } = require('../utils/examShuffleService');
const { recordAttempt, getNextAttemptNumber, shouldShuffleFor } = require('../utils/examAttemptService');

const GUEST_ID = '000000000000000000000000';
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

const normalizeStream = (stream) => {
    if (!stream || stream === 'None' || stream === '-') {
        return 'None';
    }
    return stream;
};

const isAdminUser = (user) => !!user && (user.role === 'admin' || user.role === 'super admin');

/** Accepts an ISO string / timestamp; empty or invalid means "no schedule". */
const parseScheduleDate = (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
};

const isNotStarted = (exam, now = new Date()) => !!exam.startAt && new Date(exam.startAt) > now;

const notStartedResponse = (res, exam) => res.status(403).json({
    code: 'NOT_STARTED',
    message: 'This paper has not started yet.',
    startAt: exam.startAt,
    secondsUntilStart: Math.ceil((new Date(exam.startAt) - new Date()) / 1000)
});

const hasEnded = (exam, now = new Date()) => !!exam.endAt && new Date(exam.endAt) < now;

/** UPCOMING (locked) -> LIVE (ranked window) -> ENDED (practice only). */
const getScheduleStatus = (exam, now = new Date()) => {
    if (isNotStarted(exam, now)) return 'UPCOMING';
    if (hasEnded(exam, now)) return 'ENDED';
    return 'LIVE';
};

const validateSchedule = (startAt, endAt) => {
    if (startAt && endAt && endAt <= startAt) return 'End date & time must be after the start date & time.';
    return null;
};

const NOTIFICATION_SOURCE = 'ObjectivesTestSeries';

/**
 * Queues a push to the paper's standard for the moment it unlocks, replacing
 * any not-yet-sent one so reschedules and edits stay in sync. The notification
 * worker sends it to the std_<std> topic once startAt passes. Papers that open
 * immediately get no push. Failures are logged, not thrown, so a notification
 * problem never blocks saving the paper.
 */
const syncStartNotification = async (exam) => {
    try {
        await ScheduledNotification.deleteMany({
            sourceType: NOTIFICATION_SOURCE,
            sourceId: exam._id,
            status: 'pending'
        });

        if (!exam.startAt || new Date(exam.startAt) <= new Date()) return;

        await ScheduledNotification.create({
            title: 'New Test Series paper is live!',
            body: `${exam.title} (${exam.subject}) is now open. Attempt it now!`,
            std: exam.std,
            scheduledTime: exam.startAt,
            sourceType: NOTIFICATION_SOURCE,
            sourceId: exam._id
        });
    } catch (err) {
        console.error(`Failed to schedule start notification for paper ${exam._id}:`, err);
    }
};

const cancelStartNotification = async (examId) => {
    try {
        await ScheduledNotification.deleteMany({
            sourceType: NOTIFICATION_SOURCE,
            sourceId: examId,
            status: 'pending'
        });
    } catch (err) {
        console.error(`Failed to cancel start notification for paper ${examId}:`, err);
    }
};

// Slack for network latency between the app's timer running out and the
// submit reaching the server.
const RANKED_GRACE_MS = 2 * 60 * 1000;

/**
 * Latest moment a ranked attempt that began at startedAt can be submitted
 * and still count. Timed papers get their full time limit even if the
 * window closes mid-attempt; untimed papers must finish by endAt.
 */
const rankedDeadline = (exam, startedAt) => {
    if (exam.duration > 0) {
        return new Date(new Date(startedAt).getTime() + exam.duration * 60 * 1000 + RANKED_GRACE_MS);
    }
    return exam.endAt ? new Date(new Date(exam.endAt).getTime() + RANKED_GRACE_MS) : null;
};

/**
 * Whether this student's attempt at this paper counts on the leaderboard.
 * Only the first attempt can be ranked, and only if it was opened inside the
 * ranked window. Returns { ranked, startedAt?, reason? } where reason explains
 * a practice attempt: GUEST | ALREADY_ATTEMPTED | RANKED_TIME_EXPIRED | ENDED.
 */
const getRankedState = async (exam, studentId, now = new Date()) => {
    if (!studentId || String(studentId) === GUEST_ID) return { ranked: false, reason: 'GUEST' };

    const alreadySubmitted = await ObjectivesTestSeriesResult.exists({ studentId, examId: exam._id });
    if (alreadySubmitted) return { ranked: false, reason: 'ALREADY_ATTEMPTED' };

    const start = await ObjectivesTestSeriesAttemptStart.findOne({ studentId, examId: exam._id });
    if (start) {
        const deadline = rankedDeadline(exam, start.startedAt);
        if (!deadline || now <= deadline) return { ranked: true, startedAt: start.startedAt };
        // Opened the ranked attempt but never submitted it in time.
        return { ranked: false, reason: 'RANKED_TIME_EXPIRED' };
    }

    if (hasEnded(exam, now)) return { ranked: false, reason: 'ENDED' };
    return { ranked: true, startedAt: null };
};

/**
 * Position of a ranked result: better marks first, then less time, then the
 * earlier submission.
 */
const getRankOf = async (examId, result) => 1 + await ObjectivesTestSeriesResult.countDocuments({
    examId,
    isRanked: true,
    $or: [
        { obtainedMarks: { $gt: result.obtainedMarks } },
        { obtainedMarks: result.obtainedMarks, timeTakenSeconds: { $lt: result.timeTakenSeconds } },
        {
            obtainedMarks: result.obtainedMarks,
            timeTakenSeconds: result.timeTakenSeconds,
            submittedAt: { $lt: result.submittedAt }
        }
    ]
});

const checkDuplicateOrderIndex = async (query, excludeId = null) => {
    const filter = {
        std: query.std,
        subject: query.subject,
        medium: query.medium,
        board: query.board || 'GSEB',
        stream: normalizeStream(query.stream),
        orderIndex: parseInt(query.orderIndex) || 1
    };
    if (excludeId) {
        filter._id = { $ne: excludeId };
    }
    return await ObjectivesTestSeries.findOne(filter);
};

/**
 * Keeps only well-formed MCQs and normalises the answer to an option letter,
 * so the app never has to guess whether "correctAnswer" is a letter or text.
 */
const sanitizeQuestions = (questions) => {
    if (!Array.isArray(questions)) return [];
    return questions.map((q) => {
        let answer = (q.correctAnswer || '').toString().trim();
        const letterMatch = answer.match(/^(?:option\s*)?([A-D])$/i);
        if (letterMatch) {
            answer = letterMatch[1].toUpperCase();
        } else {
            // Answer given as option text - resolve it to its letter.
            const idx = OPTION_LETTERS.findIndex((l) =>
                (q[`option${l}`] || '').toString().trim().toLowerCase() === answer.toLowerCase());
            answer = idx >= 0 ? OPTION_LETTERS[idx] : '';
        }

        return {
            question: q.question || '',
            questionImage: q.questionImage || null,
            optionA: q.optionA || '',
            optionAImage: q.optionAImage || null,
            optionB: q.optionB || '',
            optionBImage: q.optionBImage || null,
            optionC: q.optionC || '',
            optionCImage: q.optionCImage || null,
            optionD: q.optionD || '',
            optionDImage: q.optionDImage || null,
            correctAnswer: answer,
            explanation: q.explanation || ''
        };
    });
};

const validateQuestions = (questions) => {
    if (questions.length === 0) return 'Please add at least one question.';
    if (questions.length > ObjectivesTestSeries.MAX_QUESTIONS) {
        return `An Objectives Test Series paper can have at most ${ObjectivesTestSeries.MAX_QUESTIONS} questions.`;
    }
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question && !q.questionImage) return `Question ${i + 1} must have text or an image.`;
        if ((!q.optionA && !q.optionAImage) || (!q.optionB && !q.optionBImage)) {
            return `Question ${i + 1} must have at least options A and B.`;
        }
        if (!OPTION_LETTERS.includes(q.correctAnswer)) return `Question ${i + 1} must have a correct answer (A-D).`;
        const answerKey = `option${q.correctAnswer}`;
        if (!q[answerKey] && !q[`${answerKey}Image`]) {
            return `Question ${i + 1}: the correct answer points at an empty option.`;
        }
    }
    return null;
};

/**
 * Suggests the next free Display Order for a given
 * std + subject + medium + board + stream group.
 */
const getNextOrderIndex = async (req, res) => {
    try {
        const { std, subject, medium, board, stream } = req.query;

        if (!std || !subject || !medium) {
            return res.status(200).json({ nextOrderIndex: 1 });
        }

        const top = await ObjectivesTestSeries.findOne({
            std,
            subject,
            medium,
            board: board || 'GSEB',
            stream: normalizeStream(stream)
        }).sort({ orderIndex: -1 });
        const nextOrderIndex = top && top.orderIndex ? top.orderIndex + 1 : 1;

        res.status(200).json({ nextOrderIndex });
    } catch (error) {
        console.error('Error computing next order index:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

/**
 * Parses a board-style MCQ paper. Handles:
 *   - "1." / "1)" / "Q1." / "Q.1" question numbering
 *   - options on their own lines ("A. ...", "(a) ...") or all on one line
 *   - per-question answers ("Ans: B", "Answer - (c)", "Ans. <option text>")
 *   - an "Answer Key" section at the end ("1. B  2. D  3-A ...")
 *   - "Explanation:" lines
 * Anything before the first question becomes the paper description.
 */
const parseObjectivesTestSeriesFormat = (text) => {
    const questions = [];
    const answerKey = {};
    let description = '';

    const rawLines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);

    // Split "A) x  B) y  C) z  D) w" into one line per option.
    const lines = [];
    rawLines.forEach((line) => {
        if (/^\(?[Aa][\.\)]\s/.test(line)) {
            line.split(/\s+(?=\(?[B-Db-d][\.\)]\s)/).forEach(part => lines.push(part.trim()));
        } else {
            lines.push(line);
        }
    });

    let inAnswerKey = false;
    let current = null;
    let lastField = 'question'; // where continuation lines are appended

    const pushCurrent = () => {
        if (current) questions.push(current);
        current = null;
    };

    lines.forEach((line) => {
        if (/^answer\s*key\b|^answers\s*:?$/i.test(line)) {
            pushCurrent();
            inAnswerKey = true;
            return;
        }

        if (inAnswerKey) {
            const pairs = line.matchAll(/(\d{1,3})\s*[\.\)\-:]\s*\(?([A-Da-d])\)?(?![A-Za-z])/g);
            for (const [, num, letter] of pairs) {
                answerKey[parseInt(num)] = letter.toUpperCase();
            }
            return;
        }

        // "Q.1 text" / "Q1: text" (prefix makes the separator optional) or "1. text" / "1) text".
        const qMatch = line.match(/^Q(?:ue(?:stion)?)?\.?\s*(\d{1,3})\s*[\.\):\-]?\s+(.*)$/i)
            || line.match(/^(\d{1,3})[\.\)]\s*(.*)$/);
        if (qMatch) {
            pushCurrent();
            current = {
                number: parseInt(qMatch[1]),
                questionText: qMatch[2].trim(),
                options: [],
                correctAnswer: '',
                explanation: ''
            };
            lastField = 'question';
            return;
        }

        if (!current) {
            description += line + ' ';
            return;
        }

        const optMatch = line.match(/^\(?([A-Da-d])[\.\)]\s*(.*)$/);
        if (optMatch && current.options.length < 4) {
            current.options.push({ key: optMatch[1].toUpperCase(), text: optMatch[2].trim() });
            lastField = 'option';
            return;
        }

        const ansMatch = line.match(/^(?:correct\s+answer|right\s+answer|answer|ans)\b[\s\.\:\-]*(.*)$/i);
        if (ansMatch) {
            const value = ansMatch[1].trim();
            const letter = value.match(/^\(?(?:option\s*)?([A-Da-d])\)?(?:[\.\s]|$)/i);
            if (letter) {
                current.correctAnswer = letter[1].toUpperCase();
            } else {
                const idx = current.options.findIndex(o => o.text.toLowerCase() === value.toLowerCase());
                if (idx >= 0) current.correctAnswer = current.options[idx].key;
            }
            lastField = 'answer';
            return;
        }

        const expMatch = line.match(/^(?:explanation|exp|solution)\b[\s\.\:\-]*(.*)$/i);
        if (expMatch) {
            current.explanation = expMatch[1].trim();
            lastField = 'explanation';
            return;
        }

        // Continuation of whatever was last being written.
        if (lastField === 'option' && current.options.length > 0) {
            current.options[current.options.length - 1].text += ' ' + line;
        } else if (lastField === 'explanation') {
            current.explanation += ' ' + line;
        } else if (lastField === 'question') {
            current.questionText += ' ' + line;
        }
    });
    pushCurrent();

    questions.forEach((q) => {
        if (!q.correctAnswer && answerKey[q.number]) q.correctAnswer = answerKey[q.number];
        delete q.number;
    });

    return {
        description: description.trim().slice(0, 1000),
        questions: questions.slice(0, ObjectivesTestSeries.MAX_QUESTIONS),
        totalFound: questions.length
    };
};

const uploadObjectivesTestSeriesPdf = async (req, res) => {
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: 'No PDF file uploaded' });
    }

    try {
        const pdfBuffer = req.file.buffer;
        let extractedText = '';

        try {
            const parser = new PDFParse({ data: pdfBuffer });
            const pdfData = await parser.getText();
            await parser.destroy();
            extractedText = pdfData.text?.trim() || '';
        } catch (err) {
            console.error('PDF Parse Error:', err.message);
        }

        // Scanned PDFs have no text layer - fall back to OCR.
        if (extractedText.length < 50) {
            console.log('Starting OCR for Objectives Test Series PDF...');
            const outputImages = await pdfImgConvert.convert(pdfBuffer);
            for (let i = 0; i < outputImages.length; i++) {
                const result = await Tesseract.recognize(outputImages[i], 'eng');
                extractedText += result.data.text + '\n';
            }
        }

        const parsed = parseObjectivesTestSeriesFormat(extractedText);

        res.status(200).json({
            message: 'PDF processed successfully',
            description: parsed.description,
            questions: parsed.questions,
            totalFound: parsed.totalFound,
            rawText: extractedText
        });
    } catch (err) {
        console.error('Objectives Test Series PDF processing error:', err);
        res.status(500).json({ message: 'Failed to process PDF', error: err.message });
    }
};

const createExam = async (req, res) => {
    try {
        const { title, description, std, medium, stream, board, subject, duration, orderIndex } = req.body;
        const questions = sanitizeQuestions(req.body.questions);
        const startAt = parseScheduleDate(req.body.startAt) ?? null;
        const endAt = parseScheduleDate(req.body.endAt) ?? null;

        if (!title || !std || !medium || !subject) {
            return res.status(400).json({ message: 'Title, standard, medium and subject are required.' });
        }
        const questionError = validateQuestions(questions);
        if (questionError) return res.status(400).json({ message: questionError });
        const scheduleError = validateSchedule(startAt, endAt);
        if (scheduleError) return res.status(400).json({ message: scheduleError });

        const duplicate = await checkDuplicateOrderIndex({ std, subject, medium, board, stream, orderIndex });
        if (duplicate) {
            return res.status(400).json({ message: `Display Order ${orderIndex || 1} is already assigned to another Objectives Test Series paper in this subject.` });
        }

        const saved = await ObjectivesTestSeries.create({
            title,
            description: description || '',
            std,
            medium,
            stream: normalizeStream(stream),
            board: board || 'GSEB',
            subject,
            duration: duration !== undefined ? Number(duration) || 0 : 60,
            startAt,
            endAt,
            orderIndex: parseInt(orderIndex) || 1,
            questions
        });
        await syncStartNotification(saved);

        await ActivityLog.create({
            entityType: 'Exam',
            action: 'Added',
            targetName: saved.title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(201).json(saved);
    } catch (error) {
        console.error('Error creating objectives test series:', error);
        res.status(500).json({ message: 'Failed to create Objectives Test Series paper', error: error.message });
    }
};

/**
 * Lists papers without their question bodies (a paper can hold 100 MCQs),
 * exposing questionCount instead. Fetch /:id for the full paper.
 */
const getAllExams = async (req, res) => {
    try {
        const { std, medium, board, stream, subject } = req.query;
        const match = {};
        if (std) match.std = std;
        if (medium) match.medium = medium;
        if (board) match.board = board;
        if (stream) match.stream = stream;
        if (subject) match.subject = subject;

        const exams = await ObjectivesTestSeries.aggregate([
            { $match: match },
            { $sort: { orderIndex: 1, createdAt: -1 } },
            { $addFields: { questionCount: { $size: { $ifNull: ['$questions', []] } } } },
            { $project: { questions: 0 } }
        ]);

        // Lock state comes from the server clock so a student can't unlock a
        // paper early by changing their phone's time. secondsUntilStart lets
        // the app run an accurate countdown without trusting the device clock.
        const now = new Date();
        exams.forEach((exam) => {
            exam.status = getScheduleStatus(exam, now);
            exam.isLocked = exam.status === 'UPCOMING';
            exam.secondsUntilStart = exam.isLocked
                ? Math.ceil((new Date(exam.startAt) - now) / 1000)
                : 0;
            exam.secondsUntilEnd = exam.status === 'LIVE' && exam.endAt
                ? Math.ceil((new Date(exam.endAt) - now) / 1000)
                : 0;
        });

        // For a signed-in student: whether each paper is already attempted
        // (so retakes are practice) and their ranked score if they have one.
        const studentId = req.user?._id;
        if (studentId && req.user.role === 'student' && exams.length > 0) {
            const results = await ObjectivesTestSeriesResult.find({
                studentId,
                examId: { $in: exams.map(e => e._id) }
            }).select('examId isRanked obtainedMarks totalMarks').lean();

            const byExam = new Map();
            results.forEach((r) => {
                const key = String(r.examId);
                const entry = byExam.get(key) || { ranked: null };
                if (r.isRanked) entry.ranked = { obtainedMarks: r.obtainedMarks, totalMarks: r.totalMarks };
                byExam.set(key, entry);
            });
            exams.forEach((exam) => {
                const entry = byExam.get(String(exam._id));
                exam.attempted = !!entry;
                exam.myRankedResult = entry?.ranked || null;
            });
        }

        res.status(200).json(exams);
    } catch (err) {
        console.error('Get All Objectives Test Series Error:', err);
        res.status(500).json({ message: 'Failed to fetch Objectives Test Series papers', error: err.message });
    }
};

const updateExam = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await ObjectivesTestSeries.findById(id);
        if (!existing) {
            return res.status(404).json({ message: 'Paper not found' });
        }

        const { title, description, std, medium, stream, board, subject, duration, orderIndex } = req.body;
        const questions = sanitizeQuestions(req.body.questions);
        const questionError = validateQuestions(questions);
        if (questionError) return res.status(400).json({ message: questionError });

        const parsedStart = parseScheduleDate(req.body.startAt);
        const parsedEnd = parseScheduleDate(req.body.endAt);
        const startAt = parsedStart === undefined ? existing.startAt : parsedStart;
        const endAt = parsedEnd === undefined ? existing.endAt : parsedEnd;
        const scheduleError = validateSchedule(startAt, endAt);
        if (scheduleError) return res.status(400).json({ message: scheduleError });

        const newOrderIndex = orderIndex !== undefined ? parseInt(orderIndex) || 1 : existing.orderIndex;
        const duplicate = await checkDuplicateOrderIndex({
            std: std || existing.std,
            subject: subject || existing.subject,
            medium: medium || existing.medium,
            board: board || existing.board,
            stream: stream || existing.stream,
            orderIndex: newOrderIndex
        }, id);
        if (duplicate) {
            return res.status(400).json({ message: `Display Order ${newOrderIndex} is already assigned to another Objectives Test Series paper in this subject.` });
        }

        existing.set({
            title: title || existing.title,
            description: description ?? existing.description,
            std: std || existing.std,
            medium: medium || existing.medium,
            stream: normalizeStream(stream || existing.stream),
            board: board || existing.board,
            subject: subject || existing.subject,
            duration: duration !== undefined ? Number(duration) || 0 : existing.duration,
            startAt,
            endAt,
            orderIndex: newOrderIndex,
            questions
        });
        const exam = await existing.save();
        await syncStartNotification(exam);

        await ActivityLog.create({
            entityType: 'Exam',
            action: 'Updated',
            targetName: exam.title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(200).json(exam);
    } catch (err) {
        console.error('Update Objectives Test Series Error:', err);
        res.status(500).json({ message: 'Failed to update Objectives Test Series paper', error: err.message });
    }
};

const deleteExam = async (req, res) => {
    const { id } = req.params;
    try {
        const deleted = await ObjectivesTestSeries.findByIdAndDelete(id);

        if (deleted) {
            await cancelStartNotification(deleted._id);
            await ActivityLog.create({
                entityType: 'Exam',
                action: 'Deleted',
                targetName: deleted.title,
                performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
                performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
            });
        }

        res.status(200).json({ message: 'Paper deleted successfully' });
    } catch (err) {
        console.error('Delete Objectives Test Series Error:', err);
        res.status(500).json({ message: 'Failed to delete Objectives Test Series paper', error: err.message });
    }
};

/**
 * Admins get the paper as saved. Students get it with the answers stripped -
 * scoring happens on submit - and reshuffled from their second attempt on.
 */
const getExamById = async (req, res) => {
    const { id } = req.params;
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ message: 'Paper not found' });
        }
        const exam = await ObjectivesTestSeries.findById(id);
        if (!exam) {
            return res.status(404).json({ message: 'Paper not found' });
        }

        const payload = exam.toObject();
        if (isAdminUser(req.user)) {
            return res.status(200).json(payload);
        }
        if (isNotStarted(exam)) return notStartedResponse(res, exam);

        const studentId = req.user?._id;
        const attemptNumber = await getNextAttemptNumber({
            studentId,
            examId: id,
            examType: 'BOARD_CRACKER',
            ResultModel: ObjectivesTestSeriesResult,
            skipShuffle: !shouldShuffleFor(req)
        });

        payload.questions = shuffleQuestions(payload.questions, { attemptNumber, studentId, examId: id })
            .map(({ correctAnswer, explanation, ...q }) => q);
        payload.attemptNumber = attemptNumber;
        payload.isShuffled = attemptNumber > 1;

        // Ranked or practice? Opening a ranked attempt starts its server-side
        // clock; reopening it resumes the same clock.
        const now = new Date();
        const state = await getRankedState(exam, studentId, now);
        let rankedStartedAt = state.startedAt;
        if (state.ranked && !rankedStartedAt) {
            const start = await ObjectivesTestSeriesAttemptStart.findOneAndUpdate(
                { studentId, examId: exam._id },
                { $setOnInsert: { startedAt: now } },
                { upsert: true, new: true }
            );
            rankedStartedAt = start.startedAt;
        }
        payload.attemptMode = state.ranked ? 'RANKED' : 'PRACTICE';
        payload.practiceReason = state.reason || null;
        payload.status = getScheduleStatus(exam, now);
        // Seconds already used on a resumed ranked attempt; 0 for a fresh one.
        payload.elapsedSeconds = state.ranked
            ? Math.max(0, Math.floor((now - new Date(rankedStartedAt)) / 1000))
            : 0;

        res.status(200).json(payload);
    } catch (err) {
        console.error('Get Objectives Test Series By ID Error:', err);
        res.status(500).json({ message: 'Failed to fetch Objectives Test Series paper', error: err.message });
    }
};

/**
 * Body: { examId, answers: [{ questionId, selectedAnswer }], timeTakenSeconds,
 *         violationCount, violations: [String], submitReason: MANUAL|TIME_UP|VIOLATIONS }
 * Scores against the stored key (1 mark per correct answer) and returns a
 * per-question review, since the paper the student received had no answers.
 * Guests are scored but nothing is persisted.
 */
const submitResult = async (req, res) => {
    try {
        const { examId, timeTakenSeconds, violationCount } = req.body;
        const studentId = req.user._id;
        const isGuest = String(studentId) === GUEST_ID;

        if (!mongoose.Types.ObjectId.isValid(examId)) {
            return res.status(400).json({ message: 'Invalid exam id' });
        }
        const exam = await ObjectivesTestSeries.findById(examId);
        if (!exam) {
            return res.status(404).json({ message: 'Paper not found' });
        }
        if (isNotStarted(exam)) return notStartedResponse(res, exam);

        const selections = new Map();
        (req.body.answers || []).forEach((a) => {
            if (a && a.questionId) selections.set(String(a.questionId), (a.selectedAnswer || '').toString().toUpperCase());
        });

        let correctCount = 0;
        let wrongCount = 0;
        let skippedCount = 0;
        const review = exam.questions.map((q) => {
            const selectedAnswer = selections.get(String(q._id)) || '';
            const isCorrect = !!selectedAnswer && selectedAnswer === q.correctAnswer;
            if (!selectedAnswer) skippedCount++;
            else if (isCorrect) correctCount++;
            else wrongCount++;
            return {
                questionId: q._id,
                selectedAnswer,
                correctAnswer: q.correctAnswer,
                isCorrect,
                explanation: q.explanation || ''
            };
        });

        const totalMarks = exam.questions.length;
        const obtainedMarks = correctCount;
        const accuracy = totalMarks > 0 ? Math.round((correctCount / totalMarks) * 100) : 0;

        // Ranked only if this attempt was opened inside the ranked window
        // (it has a server start record) and submitted within its time.
        const now = new Date();
        const state = await getRankedState(exam, studentId, now);
        let isRanked = state.ranked && !!state.startedAt;
        let practiceReason = isRanked ? null : (state.reason || 'NOT_STARTED_IN_WINDOW');
        // Ranked time comes from the server clock, capped at the time limit.
        let timeTaken = Number(timeTakenSeconds) || 0;
        if (isRanked) {
            timeTaken = Math.max(0, Math.round((now - new Date(state.startedAt)) / 1000));
            if (exam.duration > 0) timeTaken = Math.min(timeTaken, exam.duration * 60);
        }

        let attemptInfo = null;
        let rank = null;
        let totalRanked = null;
        if (!isGuest) {
            const resultData = {
                studentId,
                examId,
                title: exam.title,
                subject: exam.subject,
                obtainedMarks,
                totalMarks,
                correctCount,
                wrongCount,
                skippedCount,
                accuracy,
                timeTakenSeconds: timeTaken,
                violationCount: Number(violationCount) || 0,
                violations: Array.isArray(req.body.violations)
                    ? req.body.violations.slice(0, 20).map(v => String(v).slice(0, 200))
                    : [],
                submitReason: ['MANUAL', 'TIME_UP', 'VIOLATIONS'].includes(req.body.submitReason)
                    ? req.body.submitReason
                    : 'MANUAL',
                answers: review.map(({ explanation, ...a }) => a),
                isRanked,
                submittedAt: now
            };

            let saved;
            try {
                saved = await ObjectivesTestSeriesResult.create(resultData);
            } catch (err) {
                // Lost a race with another submit of the same first attempt:
                // that one holds the ranked slot, so this one is practice.
                if (err.code !== 11000 || !isRanked) throw err;
                isRanked = false;
                practiceReason = 'ALREADY_ATTEMPTED';
                saved = await ObjectivesTestSeriesResult.create({ ...resultData, isRanked: false });
            }
            if (isRanked) {
                rank = await getRankOf(exam._id, saved);
                totalRanked = await ObjectivesTestSeriesResult.countDocuments({ examId: exam._id, isRanked: true });
            }

            attemptInfo = await recordAttempt({
                studentId,
                examId,
                examType: 'BOARD_CRACKER',
                title: exam.title,
                obtainedMarks,
                totalMarks,
                accuracy,
                violationCount
            });
        }

        res.status(201).json({
            message: 'Result submitted successfully',
            obtainedMarks,
            totalMarks,
            correctCount,
            wrongCount,
            skippedCount,
            accuracy,
            review,
            timeTakenSeconds: timeTaken,
            isRanked,
            practiceReason,
            rank,
            totalRanked,
            attemptNumber: attemptInfo?.attemptNumber,
            totalAttempts: attemptInfo?.totalAttempts,
            bestMarks: attemptInfo?.bestMarks
        });
    } catch (err) {
        console.error('Submit Objectives Test Series Result Error:', err);
        res.status(500).json({ message: 'Failed to submit result', error: err.message });
    }
};

/**
 * Ranked results for one paper: top 100 plus the caller's own position.
 * Only first attempts made inside the ranked window appear here.
 */
const getLeaderboard = async (req, res) => {
    const { id } = req.params;
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ message: 'Paper not found' });
        }
        const exam = await ObjectivesTestSeries.findById(id).select('title subject std startAt endAt questions');
        if (!exam) {
            return res.status(404).json({ message: 'Paper not found' });
        }

        const LIMIT = 100;
        const [top, totalParticipants] = await Promise.all([
            ObjectivesTestSeriesResult.find({ examId: id, isRanked: true })
                .sort({ obtainedMarks: -1, timeTakenSeconds: 1, submittedAt: 1 })
                .limit(LIMIT)
                .populate('studentId', 'firstName lastName photoPath')
                .lean(),
            ObjectivesTestSeriesResult.countDocuments({ examId: id, isRanked: true })
        ]);

        const myId = req.user?._id ? String(req.user._id) : null;
        const toEntry = (r, rank) => ({
            rank,
            studentId: r.studentId?._id || r.studentId,
            name: [r.studentId?.firstName, r.studentId?.lastName].filter(Boolean).join(' ') || 'Student',
            photoPath: r.studentId?.photoPath || '',
            obtainedMarks: r.obtainedMarks,
            totalMarks: r.totalMarks,
            accuracy: r.accuracy,
            timeTakenSeconds: r.timeTakenSeconds,
            submittedAt: r.submittedAt,
            isMe: !!myId && String(r.studentId?._id || r.studentId) === myId
        });
        const entries = top.map((r, i) => toEntry(r, i + 1));

        let me = entries.find(e => e.isMe) || null;
        if (!me && myId && myId !== GUEST_ID) {
            const mine = await ObjectivesTestSeriesResult.findOne({ examId: id, studentId: myId, isRanked: true })
                .populate('studentId', 'firstName lastName photoPath')
                .lean();
            if (mine) me = toEntry(mine, await getRankOf(id, mine));
        }

        res.status(200).json({
            exam: {
                _id: exam._id,
                title: exam.title,
                subject: exam.subject,
                std: exam.std,
                totalMarks: exam.questions.length,
                startAt: exam.startAt,
                endAt: exam.endAt,
                status: getScheduleStatus(exam)
            },
            totalParticipants,
            entries,
            me
        });
    } catch (err) {
        console.error('Get Objectives Test Series Leaderboard Error:', err);
        res.status(500).json({ message: 'Failed to fetch leaderboard', error: err.message });
    }
};

/**
 * Combined standings across every currently-open Objectives Test Series
 * paper for a std/medium/board/stream: each student's total ranked marks
 * added up over those papers, not one leaderboard per paper.
 *
 * Only ranked results count (first attempt, made inside that paper's ranked
 * window) - same rule as the per-paper leaderboard. A student who has not
 * taken every paper is still included, ranked on the marks they do have.
 */
const getCombinedLeaderboard = async (req, res) => {
    try {
        const { std, medium, board, stream } = req.query;
        const match = {};
        if (std) match.std = std;
        if (medium) match.medium = medium;
        if (board) match.board = board;
        if (stream) match.stream = stream;

        const now = new Date();
        const papers = await ObjectivesTestSeries.find(match)
            .select('title std startAt endAt questions')
            .lean();
        const openPapers = papers.filter((p) => getScheduleStatus(p, now) !== 'UPCOMING');
        if (openPapers.length === 0) {
            return res.status(200).json({ papers: [], totalParticipants: 0, entries: [], me: null });
        }
        const paperIds = openPapers.map((p) => p._id);
        const totalMarksByPaper = new Map(openPapers.map((p) => [String(p._id), p.questions.length]));
        const grandTotalMarks = openPapers.reduce((sum, p) => sum + p.questions.length, 0);

        const LIMIT = 100;
        const rows = await ObjectivesTestSeriesResult.aggregate([
            { $match: { examId: { $in: paperIds }, isRanked: true } },
            {
                $group: {
                    _id: '$studentId',
                    obtainedMarks: { $sum: '$obtainedMarks' },
                    timeTakenSeconds: { $sum: '$timeTakenSeconds' },
                    papersAttempted: { $sum: 1 },
                    lastSubmittedAt: { $max: '$submittedAt' }
                }
            },
            { $sort: { obtainedMarks: -1, timeTakenSeconds: 1, lastSubmittedAt: 1 } }
        ]);

        const myId = req.user?._id ? String(req.user._id) : null;
        const populated = await ObjectivesTestSeriesResult.populate(
            rows.map((r) => ({ studentId: r._id })),
            { path: 'studentId', select: 'firstName lastName photoPath' }
        );
        const toEntry = (r, student, rank) => ({
            rank,
            studentId: student?._id || r._id,
            name: [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Student',
            photoPath: student?.photoPath || '',
            obtainedMarks: r.obtainedMarks,
            totalMarks: grandTotalMarks,
            papersAttempted: r.papersAttempted,
            papersTotal: openPapers.length,
            timeTakenSeconds: r.timeTakenSeconds,
            submittedAt: r.lastSubmittedAt,
            isMe: !!myId && String(r._id) === myId
        });

        const top = rows.slice(0, LIMIT);
        const entries = top.map((r, i) => toEntry(r, populated[i].studentId, i + 1));

        let me = entries.find((e) => e.isMe) || null;
        if (!me && myId && myId !== GUEST_ID) {
            const myIndex = rows.findIndex((r) => String(r._id) === myId);
            if (myIndex !== -1) {
                me = toEntry(rows[myIndex], populated[myIndex].studentId, myIndex + 1);
            }
        }

        res.status(200).json({
            papers: openPapers.map((p) => ({
                _id: p._id,
                title: p.title,
                totalMarks: totalMarksByPaper.get(String(p._id))
            })),
            totalParticipants: rows.length,
            entries,
            me
        });
    } catch (err) {
        console.error('Get Combined Objectives Test Series Leaderboard Error:', err);
        res.status(500).json({ message: 'Failed to fetch combined leaderboard', error: err.message });
    }
};

const getMyResults = async (req, res) => {
    try {
        const results = await ObjectivesTestSeriesResult.find({ studentId: req.user._id })
            .select('-answers')
            .sort({ createdAt: -1 });
        res.status(200).json(results);
    } catch (err) {
        console.error('Get Objectives Test Series Results Error:', err);
        res.status(500).json({ message: 'Failed to fetch results', error: err.message });
    }
};

/**
 * One of the caller's own results with the paper it was taken on, answers
 * included - the student has already submitted it, so the key is safe to
 * show. Powers the history screen's question-paper PDF.
 */
const getMyResultDetail = async (req, res) => {
    const { resultId } = req.params;
    try {
        if (!mongoose.Types.ObjectId.isValid(resultId)) {
            return res.status(404).json({ message: 'Result not found' });
        }
        const result = await ObjectivesTestSeriesResult.findOne({ _id: resultId, studentId: req.user._id }).lean();
        if (!result) {
            return res.status(404).json({ message: 'Result not found' });
        }

        const exam = await ObjectivesTestSeries.findById(result.examId)
            .select('title subject std medium duration questions')
            .lean();

        res.status(200).json({ result, exam });
    } catch (err) {
        console.error('Get Objectives Test Series Result Detail Error:', err);
        res.status(500).json({ message: 'Failed to fetch result', error: err.message });
    }
};

module.exports = {
    uploadObjectivesTestSeriesPdf,
    createExam,
    getAllExams,
    updateExam,
    deleteExam,
    getExamById,
    submitResult,
    getMyResults,
    getMyResultDetail,
    getLeaderboard,
    getCombinedLeaderboard,
    getNextOrderIndex,
    parseObjectivesTestSeriesFormat
};
