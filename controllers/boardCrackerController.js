const mongoose = require('mongoose');
const BoardCracker = require('../models/BoardCracker');
const BoardCrackerResult = require('../models/BoardCrackerResult');
const ActivityLog = require('../models/ActivityLog');
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
    return await BoardCracker.findOne(filter);
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
    if (questions.length > BoardCracker.MAX_QUESTIONS) {
        return `A Board Cracker paper can have at most ${BoardCracker.MAX_QUESTIONS} questions.`;
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

        const top = await BoardCracker.findOne({
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
const parseBoardCrackerFormat = (text) => {
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
        questions: questions.slice(0, BoardCracker.MAX_QUESTIONS),
        totalFound: questions.length
    };
};

const uploadBoardCrackerPdf = async (req, res) => {
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
            console.log('Starting OCR for Board Cracker PDF...');
            const outputImages = await pdfImgConvert.convert(pdfBuffer);
            for (let i = 0; i < outputImages.length; i++) {
                const result = await Tesseract.recognize(outputImages[i], 'eng');
                extractedText += result.data.text + '\n';
            }
        }

        const parsed = parseBoardCrackerFormat(extractedText);

        res.status(200).json({
            message: 'PDF processed successfully',
            description: parsed.description,
            questions: parsed.questions,
            totalFound: parsed.totalFound,
            rawText: extractedText
        });
    } catch (err) {
        console.error('Board Cracker PDF processing error:', err);
        res.status(500).json({ message: 'Failed to process PDF', error: err.message });
    }
};

const createExam = async (req, res) => {
    try {
        const { title, description, std, medium, stream, board, subject, duration, orderIndex } = req.body;
        const questions = sanitizeQuestions(req.body.questions);

        if (!title || !std || !medium || !subject) {
            return res.status(400).json({ message: 'Title, standard, medium and subject are required.' });
        }
        const questionError = validateQuestions(questions);
        if (questionError) return res.status(400).json({ message: questionError });

        const duplicate = await checkDuplicateOrderIndex({ std, subject, medium, board, stream, orderIndex });
        if (duplicate) {
            return res.status(400).json({ message: `Display Order ${orderIndex || 1} is already assigned to another Board Cracker paper in this subject.` });
        }

        const saved = await BoardCracker.create({
            title,
            description: description || '',
            std,
            medium,
            stream: normalizeStream(stream),
            board: board || 'GSEB',
            subject,
            duration: duration !== undefined ? Number(duration) || 0 : 60,
            orderIndex: parseInt(orderIndex) || 1,
            questions
        });

        await ActivityLog.create({
            entityType: 'Exam',
            action: 'Added',
            targetName: saved.title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(201).json(saved);
    } catch (error) {
        console.error('Error creating board cracker:', error);
        res.status(500).json({ message: 'Failed to create Board Cracker paper', error: error.message });
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

        const exams = await BoardCracker.aggregate([
            { $match: match },
            { $sort: { orderIndex: 1, createdAt: -1 } },
            { $addFields: { questionCount: { $size: { $ifNull: ['$questions', []] } } } },
            { $project: { questions: 0 } }
        ]);

        res.status(200).json(exams);
    } catch (err) {
        console.error('Get All Board Crackers Error:', err);
        res.status(500).json({ message: 'Failed to fetch Board Cracker papers', error: err.message });
    }
};

const updateExam = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await BoardCracker.findById(id);
        if (!existing) {
            return res.status(404).json({ message: 'Paper not found' });
        }

        const { title, description, std, medium, stream, board, subject, duration, orderIndex } = req.body;
        const questions = sanitizeQuestions(req.body.questions);
        const questionError = validateQuestions(questions);
        if (questionError) return res.status(400).json({ message: questionError });

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
            return res.status(400).json({ message: `Display Order ${newOrderIndex} is already assigned to another Board Cracker paper in this subject.` });
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
            orderIndex: newOrderIndex,
            questions
        });
        const exam = await existing.save();

        await ActivityLog.create({
            entityType: 'Exam',
            action: 'Updated',
            targetName: exam.title,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Admin App',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(200).json(exam);
    } catch (err) {
        console.error('Update Board Cracker Error:', err);
        res.status(500).json({ message: 'Failed to update Board Cracker paper', error: err.message });
    }
};

const deleteExam = async (req, res) => {
    const { id } = req.params;
    try {
        const deleted = await BoardCracker.findByIdAndDelete(id);

        if (deleted) {
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
        console.error('Delete Board Cracker Error:', err);
        res.status(500).json({ message: 'Failed to delete Board Cracker paper', error: err.message });
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
        const exam = await BoardCracker.findById(id);
        if (!exam) {
            return res.status(404).json({ message: 'Paper not found' });
        }

        const payload = exam.toObject();
        if (isAdminUser(req.user)) {
            return res.status(200).json(payload);
        }

        const studentId = req.user?._id;
        const attemptNumber = await getNextAttemptNumber({
            studentId,
            examId: id,
            examType: 'BOARD_CRACKER',
            ResultModel: BoardCrackerResult,
            skipShuffle: !shouldShuffleFor(req)
        });

        payload.questions = shuffleQuestions(payload.questions, { attemptNumber, studentId, examId: id })
            .map(({ correctAnswer, explanation, ...q }) => q);
        payload.attemptNumber = attemptNumber;
        payload.isShuffled = attemptNumber > 1;

        res.status(200).json(payload);
    } catch (err) {
        console.error('Get Board Cracker By ID Error:', err);
        res.status(500).json({ message: 'Failed to fetch Board Cracker paper', error: err.message });
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
        const exam = await BoardCracker.findById(examId);
        if (!exam) {
            return res.status(404).json({ message: 'Paper not found' });
        }

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

        let attemptInfo = null;
        if (!isGuest) {
            await BoardCrackerResult.create({
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
                timeTakenSeconds: Number(timeTakenSeconds) || 0,
                violationCount: Number(violationCount) || 0,
                violations: Array.isArray(req.body.violations)
                    ? req.body.violations.slice(0, 20).map(v => String(v).slice(0, 200))
                    : [],
                submitReason: ['MANUAL', 'TIME_UP', 'VIOLATIONS'].includes(req.body.submitReason)
                    ? req.body.submitReason
                    : 'MANUAL',
                answers: review.map(({ explanation, ...a }) => a)
            });

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
            attemptNumber: attemptInfo?.attemptNumber,
            totalAttempts: attemptInfo?.totalAttempts,
            bestMarks: attemptInfo?.bestMarks
        });
    } catch (err) {
        console.error('Submit Board Cracker Result Error:', err);
        res.status(500).json({ message: 'Failed to submit result', error: err.message });
    }
};

const getMyResults = async (req, res) => {
    try {
        const results = await BoardCrackerResult.find({ studentId: req.user._id })
            .select('-answers')
            .sort({ createdAt: -1 });
        res.status(200).json(results);
    } catch (err) {
        console.error('Get Board Cracker Results Error:', err);
        res.status(500).json({ message: 'Failed to fetch results', error: err.message });
    }
};

module.exports = {
    uploadBoardCrackerPdf,
    createExam,
    getAllExams,
    updateExam,
    deleteExam,
    getExamById,
    submitResult,
    getMyResults,
    getNextOrderIndex,
    parseBoardCrackerFormat
};
