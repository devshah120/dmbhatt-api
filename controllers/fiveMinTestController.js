const FiveMinTest = require('../models/FiveMinTest');
const FiveMinTestResult = require('../models/FiveMinTestResult');
const StudentProfile = require('../models/StudentProfile');
const pdfImgConvert = require('pdf-img-convert');
const Tesseract = require('tesseract.js');
const { PDFParse } = require('pdf-parse'); // Check if this is the correct import based on examController.js
const { shuffleQuestions, shuffleFlatOptions } = require('../utils/examShuffleService');
const { recordAttempt, getNextAttemptNumber, shouldShuffleFor } = require('../utils/examAttemptService');

const normalizeStream = (stream) => {
    if (!stream || stream === 'None' || stream === '-') {
        return 'None';
    }
    return stream;
};

const checkDuplicateOrderIndex = async (query, excludeId = null) => {
    const filter = {
        isDeleted: { $ne: true },
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
    return await FiveMinTest.findOne(filter);
};

// Helper to parse the specialized 5 Min Test format
const parseFiveMinTestFormat = (text) => {
    let overview = "";
    const questions = [];

    // Normalize text
    const cleanText = text.replace(/\r\n/g, '\n');
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let currentSection = "NONE"; // NONE, OVERVIEW, QUESTIONS
    let currentQuestion = null;
    let currentQuestionType = "MCQ";

    lines.forEach((line) => {
        const lowerLine = line.toLowerCase();
        // Section detection
        if (lowerLine === "overview") {
            currentSection = "OVERVIEW";
            return;
        }
        if (lowerLine.includes("true / false") || lowerLine.includes("true/false")) {
            currentSection = "QUESTIONS";
            currentQuestionType = "True/False";
            return;
        }
        if (lowerLine.includes("fill in the blanks") || lowerLine.includes("fill in the blank")) {
            currentSection = "QUESTIONS";
            currentQuestionType = "Fill in the Blanks";
            return;
        }

        if (currentSection === "OVERVIEW") {
            overview += line + " ";
        } else if (currentSection === "QUESTIONS") {
            // Match question start: "01.", "1.", etc.
            const qMatch = line.match(/^(\d{1,3})[\.\)\s]+\s*(.*)/);
            if (qMatch) {
                if (currentQuestion) questions.push(currentQuestion);
                currentQuestion = {
                    questionText: qMatch[2],
                    options: [],
                    correctAnswer: "",
                    type: currentQuestionType
                };
                return;
            }

            // Match options: "A. True", "B. False" (Only for T/F or MCQ)
            if (currentQuestionType !== "Fill in the Blanks") {
                const optMatch = line.match(/^([A-D])[\.\)\s]\s*(.*)/i);
                if (optMatch && currentQuestion) {
                    currentQuestion.options.push({
                        key: optMatch[1].toUpperCase(),
                        text: optMatch[2].trim()
                    });
                    return;
                }
            }

            // Match answer: "Ans. value", "Ans (value)", "Answer: value"
            const ansMatch = line.match(/(?:Answer|Ans|Right Answer)[\s\.\:\-\(\[]*\s*(.*)/i);
            if (ansMatch && currentQuestion) {
                let answerValue = ansMatch[1].trim();

                // If T/F or MCQ, it might be just a letter mapping
                if (currentQuestionType !== "Fill in the Blanks") {
                    const letterMatch = answerValue.match(/^([A-D])/i);
                    if (letterMatch) {
                        currentQuestion.correctAnswer = "Option " + letterMatch[1].toUpperCase();
                    } else {
                        currentQuestion.correctAnswer = answerValue;
                    }
                } else {
                    // For Fill in the Blanks, take the whole string
                    currentQuestion.correctAnswer = answerValue;
                }
                return;
            }

            // If none of the above, append to question text or previous option
            if (currentQuestion) {
                if (currentQuestion.options.length === 0) {
                    currentQuestion.questionText += " " + line;
                } else {
                    currentQuestion.options[currentQuestion.options.length - 1].text += " " + line;
                }
            }
        }
    });

    if (currentQuestion) questions.push(currentQuestion);

    return {
        overview: overview.trim(),
        questions: questions
    };
};

const uploadFiveMinTestPdf = async (req, res) => {
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: 'No PDF file uploaded' });
    }

    try {
        const pdfBuffer = req.file.buffer;
        let extractedText = '';

        // 1. Try Direct Text Extraction
        try {
            const parser = new PDFParse({ data: pdfBuffer });
            const pdfData = await parser.getText();
            await parser.destroy();
            extractedText = pdfData.text?.trim() || '';
        } catch (err) {
            console.error('PDF Parse Error:', err.message);
        }

        // 2. Fallback to OCR if text is too short
        if (extractedText.length < 50) {
            console.log('Starting OCR for 5 Min Test PDF...');
            const outputImages = await pdfImgConvert.convert(pdfBuffer);
            for (let i = 0; i < outputImages.length; i++) {
                const result = await Tesseract.recognize(outputImages[i], 'eng');
                extractedText += result.data.text + '\n';
            }
        }

        const parsedData = parseFiveMinTestFormat(extractedText);

        res.status(200).json({
            message: 'PDF processed successfully',
            overview: parsedData.overview,
            questions: parsedData.questions,
            rawText: extractedText // For debugging
        });

    } catch (err) {
        console.error('5 Min Test PDF processing error:', err);
        res.status(500).json({ message: 'Failed to process PDF', error: err.message });
    }
};

// Create Test
const createTest = async (req, res) => {
    try {
        const { std, subject, medium, board, stream, orderIndex } = req.body;

        const duplicate = await checkDuplicateOrderIndex({
            std,
            subject,
            medium,
            board: board || 'GSEB',
            stream: normalizeStream(stream),
            orderIndex
        });

        if (duplicate) {
            return res.status(400).json({ message: `Display Order / Chapter No. ${orderIndex || 1} is already assigned to another quiz in this subject.` });
        }

        const test = new FiveMinTest({
            ...req.body,
            stream: normalizeStream(req.body.stream)
        });
        await test.save();
        res.status(201).json(test);
    } catch (err) {
        console.error('Create 5 Min Test Error:', err);
        res.status(500).json({ message: 'Failed to create test', error: err.message });
    }
};

const getAllTests = async (req, res) => {
    try {
        const { std, medium, board, stream, subject } = req.query;
        let query = {};
        if (std) query.std = std;
        if (medium) query.medium = medium;
        if (board) query.board = board;
        if (stream) query.stream = stream;
        if (subject) query.subject = subject;

        const tests = await FiveMinTest.find(query)
            .sort({ orderIndex: 1, createdAt: -1 });

        // The student app starts a quiz straight from this list payload rather
        // than re-fetching by id, so the per-attempt shuffle has to happen here
        // too. ?original=true (admin app / review screens) opts out.
        if (!shouldShuffleFor(req)) {
            return res.status(200).json(tests);
        }
        const studentId = req.user._id;

        const payload = await Promise.all(tests.map(async (test) => {
            const obj = test.toObject();
            const attemptNumber = await getNextAttemptNumber({
                studentId,
                examId: obj._id,
                examType: 'FIVE_MIN',
                ResultModel: FiveMinTestResult
            });

            obj.questions = shuffleQuestions(obj.questions, {
                attemptNumber,
                studentId,
                examId: obj._id,
                shuffleOptions: shuffleFlatOptions
            });
            obj.attemptNumber = attemptNumber;
            obj.isShuffled = attemptNumber > 1;
            return obj;
        }));

        res.status(200).json(payload);
    } catch (err) {
        console.error('Get All 5 Min Tests Error:', err);
        res.status(500).json({ message: 'Failed to fetch tests', error: err.message });
    }
};

// Update Test
const updateTest = async (req, res) => {
    const { id } = req.params;
    try {
        const existingTest = await FiveMinTest.findById(id);
        if (!existingTest) {
            return res.status(404).json({ message: 'Test not found' });
        }

        const { std, subject, medium, board, stream, orderIndex } = req.body;
        const newOrderIndex = orderIndex !== undefined ? orderIndex : existingTest.orderIndex;

        const duplicate = await checkDuplicateOrderIndex({
            std: std || existingTest.std,
            subject: subject || existingTest.subject,
            medium: medium || existingTest.medium,
            board: board || existingTest.board || 'GSEB',
            stream: normalizeStream(stream || existingTest.stream),
            orderIndex: newOrderIndex
        }, id);

        if (duplicate) {
            return res.status(400).json({ message: `Display Order / Chapter No. ${newOrderIndex} is already assigned to another quiz in this subject.` });
        }

        const test = await FiveMinTest.findByIdAndUpdate(id, {
            ...req.body,
            stream: normalizeStream(req.body.stream)
        }, { new: true });
        res.status(200).json(test);
    } catch (err) {
        console.error('Update 5 Min Test Error:', err);
        res.status(500).json({ message: 'Failed to update test', error: err.message });
    }
};

// Delete Test
const deleteTest = async (req, res) => {
    const { id } = req.params;
    try {
        await FiveMinTest.findByIdAndDelete(id);
        res.status(200).json({ message: 'Test deleted successfully' });
    } catch (err) {
        console.error('Delete 5 Min Test Error:', err);
        res.status(500).json({ message: 'Failed to delete test', error: err.message });
    }
};

// Get Test By ID
const getTestById = async (req, res) => {
    const { id } = req.params;
    try {
        const test = await FiveMinTest.findById(id);
        if (!test) {
            return res.status(404).json({ message: 'Test not found' });
        }

        // Attempt 1 shows the admin's order; retakes get a reshuffled paper.
        const studentId = req.user?._id;
        const attemptNumber = await getNextAttemptNumber({
            studentId,
            examId: id,
            examType: 'FIVE_MIN',
            ResultModel: FiveMinTestResult,
            skipShuffle: !shouldShuffleFor(req)
        });

        const payload = test.toObject();
        payload.questions = shuffleQuestions(payload.questions, {
            attemptNumber,
            studentId,
            examId: id,
            shuffleOptions: shuffleFlatOptions
        });
        payload.attemptNumber = attemptNumber;
        payload.isShuffled = attemptNumber > 1;

        res.status(200).json(payload);
    } catch (err) {
        console.error('Get 5 Min Test By ID Error:', err);
        res.status(500).json({ message: 'Failed to fetch test', error: err.message });
    }
};

// Submit Result
const submitResult = async (req, res) => {
    try {
        console.log('[DEBUG] Submit 5-Min Test Request Body:', req.body);
        console.log('[DEBUG] User ID:', req.user._id);
        const { examId, obtainedMarks, totalMarks } = req.body;
        const title = req.body.title || 'Untitled Test';
        const studentId = req.user._id;

        // 1. Check for duplicate
        // DISABLED: students may now retake a test any number of times
        // const existing = await FiveMinTestResult.findOne({ studentId, examId });
        // if (existing) {
        //     return res.status(400).json({ message: 'You have already submitted this test.' });
        // }

        // 2. Points (1 per 10 marks)
        // DISABLED: reward points are no longer awarded for tests
        // const earnedPoints = Math.floor(obtainedMarks / 10);
        // const profile = await StudentProfile.findOne({ userId: studentId });
        // if (profile) {
        //     profile.totalRewardPoints = (profile.totalRewardPoints || 0) + earnedPoints;
        //     await profile.save();
        // }
        const earnedPoints = 0;

        // 3. Save
        const result = new FiveMinTestResult({
            studentId,
            examId,
            title,
            obtainedMarks,
            totalMarks,
            type: req.body.type || 'QUIZ',
            isOnline: req.body.isOnline !== undefined ? req.body.isOnline : true
        });

        await result.save();

        const attemptInfo = await recordAttempt({
            studentId,
            examId,
            examType: 'FIVE_MIN',
            title,
            obtainedMarks,
            totalMarks,
            violationCount: req.body.violationCount
        });

        res.status(201).json({
            message: 'Test result submitted successfully',
            result,
            earnedPoints,
            attemptNumber: attemptInfo?.attemptNumber,
            totalAttempts: attemptInfo?.totalAttempts,
            bestMarks: attemptInfo?.bestMarks
        });
    } catch (err) {
        console.error('Submit 5 Min Test Result Error:', err);
        res.status(500).json({ message: 'Failed to submit test result', error: err.message });
    }
};

module.exports = {
    uploadFiveMinTestPdf,
    createTest,
    getAllTests,
    updateTest,
    deleteTest,
    getTestById,
    submitResult
};
