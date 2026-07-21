const mongoose = require('mongoose');
const ExamAttempt = require('../models/ExamAttempt');

const GUEST_ID = '000000000000000000000000';

/**
 * Should this request get a per-student shuffled paper?
 *
 * Only real students do. The admin React app sends its own Bearer token, so
 * without this check an admin would see reshuffled question lists in the
 * management screens and think the data had been reordered.
 */
const shouldShuffleFor = (req) => {
    const user = req?.user;
    if (!user || !user._id) return false;
    if (String(user._id) === GUEST_ID) return false;
    if (req?.query?.original === 'true') return false;
    if (user.role && user.role !== 'student') return false;
    return true;
};

/**
 * Record one submitted attempt against the student's rolling history for an exam.
 *
 * Called from every exam type's submitResult. Never throws — a bookkeeping
 * failure must not lose the student's actual result, which the caller has
 * already saved to its own collection.
 *
 * @returns {Object|null} { attemptNumber, totalAttempts, bestMarks } or null
 */
const recordAttempt = async ({
    studentId,
    examId,
    examType,
    title,
    obtainedMarks,
    totalMarks,
    accuracy,
    violationCount
}) => {
    try {
        if (!studentId || !examId) return null;
        if (String(studentId) === GUEST_ID) return null;

        const marks = Number(obtainedMarks) || 0;
        const total = Number(totalMarks) || 0;

        // Derive accuracy when the client did not send it.
        const resolvedAccuracy = accuracy !== undefined && accuracy !== null
            ? Number(accuracy)
            : (total > 0 ? Math.round((marks / total) * 100) : 0);

        let record = await ExamAttempt.findOne({ studentId, examId, examType });

        if (!record) {
            record = new ExamAttempt({
                studentId,
                examId,
                examType,
                title: title || 'Untitled Exam',
                totalAttempts: 0,
                bestMarks: 0
            });
        }

        const attemptNumber = record.totalAttempts + 1;

        record.attempts.push({
            attemptNumber,
            obtainedMarks: marks,
            totalMarks: total,
            accuracy: resolvedAccuracy,
            violationCount: Number(violationCount) || 0,
            // Attempt 1 is served in the admin's order; everything after is shuffled.
            wasShuffled: attemptNumber > 1,
            submittedAt: new Date()
        });

        record.totalAttempts = attemptNumber;
        record.lastMarks = marks;
        record.bestMarks = Math.max(record.bestMarks || 0, marks);
        if (title) record.title = title;

        await record.save();

        return {
            attemptNumber,
            totalAttempts: record.totalAttempts,
            bestMarks: record.bestMarks
        };
    } catch (err) {
        console.error('[ExamAttempt] Failed to record attempt:', err.message);
        return null;
    }
};

/**
 * Attempt the student is about to START (1 = never taken before).
 * Falls back to the per-type result collection so students who submitted before
 * this feature shipped are not handed the admin order a second time.
 */
const getNextAttemptNumber = async ({ studentId, examId, examType, ResultModel, skipShuffle }) => {
    try {
        // Review/history/PDF screens pass ?original=true because they render a
        // paper the student has ALREADY sat - it must match what they saw then,
        // not the order of the attempt they are about to start.
        if (skipShuffle) return 1;

        if (!studentId || !examId) return 1;
        if (String(studentId) === GUEST_ID) return 1;
        if (!mongoose.Types.ObjectId.isValid(studentId)) return 1;

        const record = await ExamAttempt.findOne({ studentId, examId, examType });
        if (record) return record.totalAttempts + 1;

        if (ResultModel) {
            const legacyCount = await ResultModel.countDocuments({ studentId, examId });
            return legacyCount + 1;
        }

        return 1;
    } catch (err) {
        console.error('[ExamAttempt] Failed to resolve attempt number:', err.message);
        return 1; // Safe default: show the admin order.
    }
};

module.exports = { recordAttempt, getNextAttemptNumber, shouldShuffleFor };
