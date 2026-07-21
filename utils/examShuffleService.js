const crypto = require('crypto');

/**
 * Exam attempt / shuffle service.
 *
 * Rule: a student's FIRST attempt at an exam always shows the questions in the
 * exact order the admin app saved them. Every attempt after that is reshuffled
 * so the student cannot memorise "the answer to Q3 is B".
 *
 * The attempt number is derived from how many results the student already has
 * for that exam, so this works retroactively for students who took exams before
 * this feature existed — no backfill migration needed.
 */

/**
 * Deterministic PRNG (mulberry32). Seeding it with studentId + examId + attempt
 * means one attempt always renders the same order: if the student's connection
 * drops and the exam screen refetches, they get the same paper back rather than
 * a freshly scrambled one mid-exam.
 */
const createSeededRandom = (seedString) => {
    const hash = crypto.createHash('md5').update(String(seedString)).digest();
    let a = hash.readUInt32LE(0);

    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/** Fisher-Yates against a supplied random fn. Returns a new array. */
const shuffleWith = (items, random) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
};

/**
 * How many times this student has already SUBMITTED this exam.
 * attemptNumber = that count + 1 (the attempt they are about to start).
 */
const getAttemptNumber = async (ResultModel, studentId, examId) => {
    if (!studentId || !examId) return 1;

    // Guests get the admin order every time - they have no persisted history.
    if (String(studentId) === '000000000000000000000000') return 1;

    const previous = await ResultModel.countDocuments({ studentId, examId });
    return previous + 1;
};

/**
 * Shuffle a question list for a given attempt.
 *
 * @param {Array}  questions    questions in the admin-defined order
 * @param {Object} opts
 * @param {Number} opts.attemptNumber   1 = admin order, 2+ = reshuffled
 * @param {String} opts.studentId
 * @param {String} opts.examId
 * @param {Function} [opts.shuffleOptions]  optional per-question option shuffler
 * @returns {Array} questions in the order this attempt should see them
 */
const shuffleQuestions = (questions, { attemptNumber, studentId, examId, shuffleOptions }) => {
    if (!Array.isArray(questions) || questions.length < 2) return questions || [];

    // First attempt renders exactly what the admin configured.
    if (attemptNumber <= 1) return questions;

    const random = createSeededRandom(`${studentId}:${examId}:${attemptNumber}`);
    const ordered = shuffleWith(questions, random);

    if (typeof shuffleOptions === 'function') {
        return ordered.map((q) => shuffleOptions(q, random));
    }

    return ordered;
};

/**
 * Reorder the A/B/C/D options of an MCQ and move correctAnswer to follow the
 * option it was originally pointing at.
 *
 * Used for the `Question` model shape: { options: [{key, text, image}], correctAnswer: 'A' }
 */
const shuffleMcqOptions = (question, random) => {
    const q = typeof question.toObject === 'function' ? question.toObject() : { ...question };

    if (!Array.isArray(q.options) || q.options.length < 2) return q;

    const keys = q.options.map((o) => o.key);
    const correctOption = q.options.find((o) => o.key === q.correctAnswer);

    const shuffled = shuffleWith(q.options, random);

    // Re-label in place: position 0 becomes 'A', position 1 becomes 'B', ...
    // so the student sees a normal A-D list, just with the texts moved around.
    q.options = shuffled.map((opt, i) => ({ ...opt, key: keys[i] }));

    if (correctOption) {
        const newIndex = shuffled.findIndex((o) => o === correctOption);
        if (newIndex !== -1) q.correctAnswer = keys[newIndex];
    }

    return q;
};

/**
 * Option shuffler for the flat `optionA..optionD` question shape used by
 * FiveMinTest, where correctAnswer holds the option TEXT rather than a key.
 *
 * Only true MCQs are touched: True/False keeps its natural True-then-False
 * order, and Fill in the Blanks has no options at all.
 */
const shuffleFlatOptions = (question, random) => {
    const q = typeof question.toObject === 'function' ? question.toObject() : { ...question };

    if (q.type && q.type !== 'MCQ') return q;

    const letters = ['A', 'B', 'C', 'D'];
    const present = letters
        .map((L) => ({ text: q[`option${L}`], image: q[`option${L}Image`] }))
        .filter((o) => o.text !== undefined && o.text !== null && String(o.text).trim() !== '');

    if (present.length < 2) return q;

    const shuffled = shuffleWith(present, random);

    // correctAnswer is stored as the option text, so it stays valid as the
    // options move - we only need to rewrite the slots themselves.
    shuffled.forEach((opt, i) => {
        q[`option${letters[i]}`] = opt.text;
        q[`option${letters[i]}Image`] = opt.image;
    });

    // Clear any slots the shuffle left unused (e.g. a 3-option question).
    for (let i = shuffled.length; i < letters.length; i++) {
        q[`option${letters[i]}`] = undefined;
        q[`option${letters[i]}Image`] = undefined;
    }

    return q;
};

module.exports = {
    getAttemptNumber,
    shuffleQuestions,
    shuffleMcqOptions,
    shuffleFlatOptions,
    createSeededRandom,
    shuffleWith
};
