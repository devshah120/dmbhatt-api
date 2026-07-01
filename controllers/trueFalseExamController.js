const TrueFalseExam = require('../models/TrueFalseExam');
const TrueFalseExamResult = require('../models/TrueFalseExamResult');
const StudentProfile = require('../models/StudentProfile');
const pdfImgConvert = require('pdf-img-convert');
const Tesseract = require('tesseract.js');
const { PDFParse } = require('pdf-parse');

// Helper to parse the specialized format for True/False Exam
const parseTrueFalseExamFormat = (text) => {
    let overview = "";
    const questions = [];

    // Normalize text
    const cleanText = text.replace(/\r\n/g, '\n');
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let currentSection = "NONE"; // NONE, OVERVIEW, QUESTIONS
    let currentQuestion = null;

    lines.forEach((line) => {
        const lowerLine = line.toLowerCase();
        // Section detection
        if (lowerLine === "overview") {
            currentSection = "OVERVIEW";
            return;
        }
        if (lowerLine.includes("true / false") || lowerLine.includes("true/false")) {
            currentSection = "QUESTIONS";
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
                    correctAnswer: "",
                    type: "True/False",
                    options: [
                        { key: "A", text: "True" },
                        { key: "B", text: "False" }
                    ]
                };
                return;
            }

            // Match options: "A. True", "B. False" - Skip these for T/F as they are implied
            const optMatch = line.match(/^([A-B])[\.\)\s]\s*(.*)/i);
            if (optMatch && currentQuestion) {
                 return; // Just skip, since options are fixed to True/False
            }

            // Match answer: "Ans. True", "Ans (False)", "Answer: True"
            const ansMatch = line.match(/(?:Answer|Ans|Right Answer)[\s\.\:\-\(\[]*\s*(.*)/i);
            if (ansMatch && currentQuestion) {
                let answerValue = ansMatch[1].trim();
                
                if (answerValue.toLowerCase() === 'true' || answerValue.toLowerCase() === 'a' || answerValue.toLowerCase() === 'option a') {
                    currentQuestion.correctAnswer = "True";
                } else if (answerValue.toLowerCase() === 'false' || answerValue.toLowerCase() === 'b' || answerValue.toLowerCase() === 'option b') {
                    currentQuestion.correctAnswer = "False";
                } else {
                    currentQuestion.correctAnswer = answerValue;
                }
                return;
            }

            // If none of the above, append to question text
            if (currentQuestion) {
                currentQuestion.questionText += " " + line;
            }
        }
    });

    if (currentQuestion) questions.push(currentQuestion);

    return {
        overview: overview.trim(),
        questions: questions
    };
};

const uploadTrueFalseExamPdf = async (req, res) => {
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
            console.log('Starting OCR for True/False Exam PDF...');
            const outputImages = await pdfImgConvert.convert(pdfBuffer);
            for (let i = 0; i < outputImages.length; i++) {
                const result = await Tesseract.recognize(outputImages[i], 'eng');
                extractedText += result.data.text + '\n';
            }
        }

        const parsedData = parseTrueFalseExamFormat(extractedText);

        res.status(200).json({
            message: 'PDF processed successfully',
            overview: parsedData.overview,
            questions: parsedData.questions,
            rawText: extractedText // For debugging
        });

    } catch (err) {
        console.error('True/False Exam PDF processing error:', err);
        res.status(500).json({ message: 'Failed to process PDF', error: err.message });
    }
};

// Create Exam
const createExam = async (req, res) => {
    try {
        const { title, std, medium, stream, board, subject, unit, overview, questions, totalMarks } = req.body;
        const newExam = new TrueFalseExam({
            title, std, medium, stream, board, subject, unit, overview, questions, totalMarks: totalMarks || 20
        });
        const savedExam = await newExam.save();
        res.status(201).json(savedExam);
    } catch (error) {
        console.error('Error creating exam:', error);
        res.status(500).json({ error: 'Failed to create true/false exam' });
    }
};

const getAllExams = async (req, res) => {
    try {
        const { std, medium, board, stream, subject, skip, limit } = req.query;
        let query = {};
        if (std) query.std = std;
        if (medium) query.medium = medium;
        if (board) query.board = board;
        if (stream) query.stream = stream;
        if (subject) query.subject = subject;

        let dbQuery = TrueFalseExam.find(query).sort({ createdAt: -1 });

        if (skip) dbQuery = dbQuery.skip(parseInt(skip));
        if (limit) dbQuery = dbQuery.limit(parseInt(limit));

        const exams = await dbQuery;

        if (skip || limit) {
            const total = await TrueFalseExam.countDocuments(query);
            res.status(200).json({ data: exams, total });
        } else {
            // Backward compatibility for mobile apps
            res.status(200).json(exams);
        }
    } catch (err) {
        console.error('Get All True/False Exams Error:', err);
        res.status(500).json({ message: 'Failed to fetch exams', error: err.message });
    }
};

// Update Exam
const updateExam = async (req, res) => {
    const { id } = req.params;
    try {
        const { title, std, medium, stream, board, subject, unit, overview, questions, totalMarks } = req.body;
        const exam = await TrueFalseExam.findByIdAndUpdate(
            id, 
            { title, std, medium, stream, board, subject, unit, overview, questions, totalMarks: totalMarks || 20 }, 
            { new: true }
        );
        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }
        res.status(200).json(exam);
    } catch (err) {
        console.error('Update True/False Exam Error:', err);
        res.status(500).json({ message: 'Failed to update exam', error: err.message });
    }
};

// Delete Exam
const deleteExam = async (req, res) => {
    const { id } = req.params;
    try {
        await TrueFalseExam.findByIdAndDelete(id);
        res.status(200).json({ message: 'Exam deleted successfully' });
    } catch (err) {
        console.error('Delete True/False Exam Error:', err);
        res.status(500).json({ message: 'Failed to delete exam', error: err.message });
    }
};

// Get Exam By ID
const getExamById = async (req, res) => {
    const { id } = req.params;
    try {
        const exam = await TrueFalseExam.findById(id);
        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }
        res.status(200).json(exam);
    } catch (err) {
        console.error('Get True/False Exam By ID Error:', err);
        res.status(500).json({ message: 'Failed to fetch exam', error: err.message });
    }
};

// Submit Result
const submitResult = async (req, res) => {
    try {
        const { examId, obtainedMarks, totalMarks, accuracy, violationCount, answers } = req.body;
        const title = req.body.title || 'Untitled Exam';
        const studentId = req.user._id;

        // 1. Check for duplicate
        const existing = await TrueFalseExamResult.findOne({ studentId, examId });
        if (existing) {
            return res.status(400).json({ message: 'You have already submitted this exam.' });
        }

        // 2. Points (1 per 10 marks)
        const earnedPoints = Math.floor(obtainedMarks / 10);
        const profile = await StudentProfile.findOne({ userId: studentId });
        if (profile) {
            profile.totalRewardPoints = (profile.totalRewardPoints || 0) + earnedPoints;
            await profile.save();
        }

        // 3. Save
        const result = new TrueFalseExamResult({
            studentId,
            examId,
            title,
            obtainedMarks,
            totalMarks,
            accuracy: accuracy || 0,
            violationCount: violationCount || 0,
            answers: answers || [],
            type: req.body.type || 'TRUE_FALSE',
            isOnline: req.body.isOnline !== undefined ? req.body.isOnline : true
        });

        await result.save();
        res.status(201).json({ message: 'Exam result submitted successfully', result, earnedPoints });
    } catch (err) {
        console.error('Submit True/False Exam Result Error:', err);
        res.status(500).json({ message: 'Failed to submit exam result', error: err.message });
    }
};

module.exports = {
    uploadTrueFalseExamPdf,
    createExam,
    getAllExams,
    updateExam,
    deleteExam,
    getExamById,
    submitResult
};
