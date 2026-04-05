const Exam = require('../models/Exam');
const Question = require('../models/Question');
const ExamResult = require('../models/ExamResult');
const pdfImgConvert = require('pdf-img-convert');
const Tesseract = require('tesseract.js');
const fs = require('fs');
// Direct Text Extraction module
const { PDFParse } = require('pdf-parse');

const uploadExamPdf = async (req, res) => {
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: 'No PDF file uploaded or buffer missing' });
    }

    try {
        console.log('==============================');
        console.log('PDF Upload Started');
        console.log('File Name:', req.file.originalname);
        console.log('Buffer Size:', req.file.buffer.length);

        const pdfBuffer = req.file.buffer;

        // =====================================================
        // STEP 1: TRY DIRECT TEXT EXTRACTION (TEXT-BASED PDF)
        // =====================================================
        let extractedText = '';

        try {
            const parser = new PDFParse({ data: pdfBuffer });
            const pdfData = await parser.getText();
            await parser.destroy();

            extractedText = pdfData.text?.trim() || '';
            console.log('Direct PDF Text Length:', extractedText.length);
        } catch (parseErr) {
            console.error('PDF-Parse Error:', parseErr.message);
        }

        // =====================================================
        // STEP 2: IF TEXT EXISTS → SKIP OCR
        // =====================================================
        if (extractedText.length > 50) {
            console.log('TEXT-BASED PDF detected. Skipping OCR.');

            const parsedQuestions = parseQuestionsErrors(extractedText);

            console.log('Parsed Questions:', parsedQuestions.length);

            return res.status(200).json({
                message: 'Text-based PDF processed successfully',
                pdfType: 'TEXT',
                totalQuestions: parsedQuestions.length,
                rawTextPreview: extractedText.substring(0, 500),
                questions: parsedQuestions
            });
        }

        // =====================================================
        // STEP 3: SCANNED PDF → OCR REQUIRED
        // =====================================================
        console.log('SCANNED PDF detected. Starting OCR process...');

        const outputImages = await pdfImgConvert.convert(pdfBuffer);

        console.log(`PDF converted to ${outputImages.length} image(s)`);

        if (!outputImages || outputImages.length === 0) {
            return res.status(400).json({
                message: 'PDF conversion failed: no images generated'
            });
        }

        let fullText = '';

        for (let i = 0; i < outputImages.length; i++) {
            console.log(`OCR Processing Page ${i + 1}`);

            try {
                const result = await Tesseract.recognize(
                    outputImages[i],
                    'eng',
                    {
                        logger: m => {
                            if (m.status === 'recognizing text') {
                                console.log(
                                    `Page ${i + 1}: ${Math.floor(m.progress * 100)}%`
                                );
                            }
                        }
                    }
                );

                const pageText = result.data.text || '';
                console.log(`Page ${i + 1} Text Length:`, pageText.length);
                console.log(`Page ${i + 1} Sample:`, pageText.substring(0, 50));

                fullText += pageText + '\n';

            } catch (ocrErr) {
                console.error(`OCR Error on Page ${i + 1}:`, ocrErr.message);
            }
        }

        console.log('OCR Completed. Total OCR Text Length:', fullText.length);

        const parsedQuestions = parseQuestionsErrors(fullText);

        console.log('Parsed Questions:', parsedQuestions.length);

        return res.status(200).json({
            message: 'Scanned PDF processed using OCR',
            pdfType: 'SCANNED',
            totalQuestions: parsedQuestions.length,
            rawTextPreview: fullText.substring(0, 500),
            questions: parsedQuestions
        });

    } catch (err) {
        console.error('PDF Upload Fatal Error:', err);
        return res.status(500).json({
            message: 'Failed to process PDF',
            error: err.message
        });
    }
};


/**
 * Parsing Logic
 * Detects patterns like:
 * 1. Question text...
 * A) Option
 * B) Option
 * ...
 * Answer: A
 */
const parseQuestionsErrors = (text) => {
    const questions = [];
    // Normalize newlines
    let cleanText = text.replace(/\r\n/g, '\n');

    // IMPROVEMENT: Split lines by options AND Answers
    // Now splitting by: Space followed by A-D. or Answer/Ans
    cleanText = cleanText.replace(/(\s{1,})([A-D][\.\)]\s+)/g, '\n$2');
    cleanText = cleanText.replace(/(\s{1,})(Ans[\.\:\s]+|Answer[\.\:\s]+)/gi, '\n$2');

    // Pre-processing: Split by newline
    const rawLines = cleanText.split('\n');

    const lines = [];
    rawLines.forEach(l => {
        const trimmed = l.trim();
        if (!trimmed) return;

        // Split by 3 or more spaces
        const parts = trimmed.split(/\s{3,}/);
        parts.forEach(p => lines.push(p.trim()));
    });

    console.log(`[DEBUG] Total lines to parse: ${lines.length}`);

    // Regex patterns
    // Relaxed Question Start: Matches "01. Text", "1. Text", "1) Text", "1 Text"
    const questionStart = /^[\W]*(\d{1,3})[\.\)\s]+\s*(.*)/;

    // Answer Regex: Matches "Ans (A)", "Ans. (A)", "Answer: A", "Ans: A"
    const answerPattern = /(?:Answer|Ans|Right Answer)[\s\.\:\-\(\[]*([A-D])/i;

    let currentQuestion = null;

    lines.forEach((line, index) => {
        const lowerLine = line.toLowerCase();
        
        // Skip common headers
        if (lowerLine === 'overview' || lowerLine === 'overview:' || 
            lowerLine.includes('extract mcq') || 
            lowerLine === 'multiple choice questions' ||
            lowerLine.startsWith('---')) {
            return;
        }

        // 1. Check for Answer
        const ansMatch = line.match(answerPattern);
        if (ansMatch) {
            if (currentQuestion) {
                currentQuestion.correctAnswer = ansMatch[1].toUpperCase();
                questions.push(currentQuestion);
                currentQuestion = null;
            }
            return;
        }

        // 2. Check for New Question Start
        const qMatch = line.match(questionStart);
        if (qMatch) {
            // Push pending question if it was valid
            if (currentQuestion && currentQuestion.options.length > 0) {
                questions.push(currentQuestion);
            }
            
            currentQuestion = {
                id: Date.now() + index + Math.random(),
                questionText: qMatch[2],
                options: [],
                correctAnswer: ''
            };
            return;
        }

        // 3. Check for Options
        if (currentQuestion) {
            const optionMatch = line.match(/^([A-D])[\.\)\s]\s+(.*)/i);

            if (optionMatch) {
                currentQuestion.options.push({
                    key: optionMatch[1].toUpperCase(),
                    text: optionMatch[2].trim()
                });
            } else {
                // If it's not a new question and not an option, append to text
                if (currentQuestion.options.length === 0) {
                    currentQuestion.questionText += " " + line;
                } else {
                    currentQuestion.options[currentQuestion.options.length - 1].text += " " + line;
                }
            }
        }
    });

    // Push last one
    if (currentQuestion && currentQuestion.options.length > 0) {
        questions.push(currentQuestion);
    }

    console.log(`[DEBUG] Final Parsed ${questions.length} questions.`);
    return questions;
};

/**
 * Save Exam
 */
const saveExam = async (req, res) => {
    const { title, subject, std, medium, board, stream, unit, totalMarks, questions } = req.body;

    console.log('[DEBUG] Schema Paths:', Object.keys(Exam.schema.paths));
    console.log('[DEBUG] Name Required:', Exam.schema.path('name')?.options?.required);

    try {
        // 1. Create Question Docs
        const questionIds = [];

        // Create Exam first to get ID? Or Questions first?
        // Questions need examId.
        const exam = new Exam({
            title,
            name: title, // Map title to name for backward compatibility/history list
            subject,
            std,
            medium,
            board: board || 'GSEB',
            stream: stream || 'None',
            unit,
            totalMarks,
            createdBy: req.user._id
        });

        const savedExam = await exam.save();

        for (const q of questions) {
            const newQ = new Question({
                examId: savedExam._id,
                questionText: q.questionText,
                questionImage: q.questionImage,
                options: q.options,
                correctAnswer: q.correctAnswer,
                marks: 1 // Default per q
            });
            const savedQ = await newQ.save();
            questionIds.push(savedQ._id);
        }

        // Update Exam with question IDs
        savedExam.questions = questionIds;
        await savedExam.save();

        res.status(201).json({ message: 'Exam created successfully', examId: savedExam._id });

    } catch (err) {
        console.error('Save Exam Error:', err);
        res.status(500).json({ message: 'Failed to save exam', error: err.message });
    }
};

/**
 * Get All Exams
 */
const getAllExams = async (req, res) => {
    const { std, medium, board, stream, subject } = req.query;
    try {
        const query = { isDeleted: { $ne: true } };
        if (std) query.std = std;
        if (medium) query.medium = medium;
        if (board) query.board = board;
        if (stream) query.stream = stream;
        if (subject) query.subject = subject;

        const exams = await Exam.find(query)
            .populate('createdBy', 'firstName email phoneNum')
            .populate('updatedBy', 'firstName email phoneNum')
            .sort({ createdAt: -1 });    
        res.status(200).json(exams);
    } catch (err) {
        console.error('Get All Exams Error:', err);
        res.status(500).json({ message: 'Failed to fetch exams', error: err.message });
    }
};

/**
 * Delete Exam
 */
const deleteExam = async (req, res) => {
    const { id } = req.params;
    try {
        const exam = await Exam.findById(id);
        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        // Delete associated questions
        await Question.deleteMany({ examId: id });

        // Soft delete exam
        await Exam.findByIdAndUpdate(id, { 
            isDeleted: true, 
            deletedBy: req.user._id,
            deletedAt: Date.now()
        });

        res.status(200).json({ message: 'Exam deleted successfully' });
    } catch (err) {
        console.error('Delete Exam Error:', err);
        res.status(500).json({ message: 'Failed to delete exam', error: err.message });
    }
};

/**
 * Get Exam By ID
 */
const getExamById = async (req, res) => {
    const { id } = req.params;
    try {
        const exam = await Exam.findById(id).populate('questions');
        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }
        res.status(200).json(exam);
    } catch (err) {
        console.error('Get Exam By ID Error:', err);
        res.status(500).json({ message: 'Failed to fetch exam', error: err.message });
    }
};

/**
 * Update Exam
 */
const updateExam = async (req, res) => {
    const { id } = req.params;
    const { title, subject, std, medium, board, stream, unit, totalMarks, questions } = req.body;

    try {
        // 1. Update Exam Metadata
        const exam = await Exam.findByIdAndUpdate(
            id,
            {
                title,
                name: title,
                subject,
                std,
                medium,
                board: board || 'GSEB',
                stream: stream || 'None',
                unit,
                totalMarks,
                updatedBy: req.user._id,
                updatedAt: Date.now()
            },
            { new: true }
        );

        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        // 2. Update Questions
        if (questions && Array.isArray(questions)) {
            const questionIds = [];
            for (const q of questions) {
                if (q._id) {
                    await Question.findByIdAndUpdate(q._id, {
                        questionText: q.questionText,
                        questionImage: q.questionImage,
                        options: q.options,
                        correctAnswer: q.correctAnswer,
                        marks: q.marks || 1
                    });
                    questionIds.push(q._id);
                } else {
                    // Create new question if it doesn't have an _id
                    const newQ = new Question({
                        examId: id,
                        questionText: q.questionText,
                        questionImage: q.questionImage,
                        options: q.options,
                        correctAnswer: q.correctAnswer,
                        marks: q.marks || 1
                    });
                    const savedQ = await newQ.save();
                    questionIds.push(savedQ._id);
                }
            }
            // Update exam's question list to reflect the current state (handles additions)
            exam.questions = questionIds;
            await exam.save();
        }

        res.status(200).json({ message: 'Exam updated successfully', exam });
    } catch (err) {
        console.error('Update Exam Error:', err);
        res.status(500).json({ message: 'Failed to update exam', error: err.message });
    }
};



/**
 * Submit Exam Result
 */
const submitExam = async (req, res) => {
    const { examId, title, obtainedMarks, totalMarks, isOnline, violationCount } = req.body;
    const studentId = req.user._id;

    console.log(`[DEBUG] Received sumbitExam: studentId=${studentId}, examId=${examId}, score=${obtainedMarks}/${totalMarks}, violations=${violationCount}`);

    try {
        // 1. Check if student already gave this exam
        const existingResult = await ExamResult.findOne({ studentId, examId });
        if (existingResult) {
            return res.status(400).json({ message: 'You have already submitted this exam once.' });
        }

        // 2. Calculate Reward Points (1 point per 10 marks)
        const earnedPoints = Math.floor(obtainedMarks / 10);

        // 3. Update Student Profile
        const StudentProfile = require('../models/StudentProfile');
        const profile = await StudentProfile.findOne({ userId: studentId });
        if (profile) {
            profile.totalRewardPoints = (profile.totalRewardPoints || 0) + earnedPoints;
            await profile.save();
        }

        // 4. Save Result
        const finalIsOnline = isOnline === true || isOnline === 'true';
        const result = new ExamResult({
            studentId,
            examId,
            title,
            obtainedMarks,
            totalMarks,
            isOnline: finalIsOnline,
            earnedPoints: earnedPoints,
            type: req.body.type || (finalIsOnline ? 'REGULAR' : 'QUIZ'),
            violationCount: violationCount || 0
        });

        await result.save();
        res.status(201).json({
            message: 'Exam result submitted successfully',
            result,
            earnedPoints
        });

    } catch (err) {
        console.error('Submit Exam Error:', err);
        res.status(500).json({ message: 'Failed to submit exam result', error: err.message });
    }
};

/**
 * Update Exam Violation Count
 */
const updateViolation = async (req, res) => {
    const { examId, examType } = req.body;
    const studentId = req.user._id;

    try {
        const ExamViolation = require('../models/ExamViolation');
        let violation = await ExamViolation.findOne({ studentId, examId });

        if (!violation) {
            violation = new ExamViolation({
                studentId,
                examId,
                examType,
                count: 1
            });
        } else {
            violation.count += 1;
        }

        await violation.save();
        res.status(200).json({
            message: 'Violation recorded',
            count: violation.count
        });
    } catch (err) {
        console.error('Update Violation Error:', err);
        res.status(500).json({ message: 'Failed to record violation', error: err.message });
    }
};

module.exports = {
    uploadExamPdf,
    saveExam,
    getAllExams,
    deleteExam,
    getExamById,
    updateExam,
    submitExam,
    updateViolation
};
