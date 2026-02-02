const Exam = require('../models/Exam');
const Question = require('../models/Question');
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
    const cleanText = text.replace(/\r\n/g, '\n');
    // Pre-processing: Split by newline
    const rawLines = cleanText.split('\n');

    // Flatten multi-column lines:
    // "1 Q1...   10 Q10..." -> ["1 Q1...", "10 Q10..."]
    const lines = [];
    rawLines.forEach(l => {
        const trimmed = l.trim();
        if (!trimmed) return;

        // Split by 3 or more spaces, BUT treat it carefully.
        // Check if the parts look like valid independent blocks (start with Number or Option)
        // Simple Split:
        const parts = trimmed.split(/\s{3,}/);
        parts.forEach(p => lines.push(p.trim()));
    });

    console.log(`[DEBUG] Total lines to parse (after splitting columns): ${lines.length}`);

    // Regex patterns
    // Relaxed Question Start: Matches "1. Text", "1) Text", "1 Text"
    const questionStart = /^[\W]*(\d{1,3})[\.\)\s]\s+(.*)/;

    // Answer Regex: Matches "Ans. (C)", "Answer: C", "Ans: C", "Ans (A)"
    const answerPattern = /(?:Answer|Ans|Right Answer)[\s\.\:\-\(\[]*([A-D])/i;

    let currentQuestion = null;

    lines.forEach((line, index) => {
        if (index < 10) console.log(`[DEBUG] Line ${index}: "${line}"`);

        // 1. Check for Answer (Highest Priority)
        const ansMatch = line.match(answerPattern);
        if (ansMatch) {
            console.log(`[DEBUG] Answer detected at line ${index}: ${ansMatch[1]}`);
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
            // Check if it's really a question. E.g. "55 multiple-choice" matches "55 multiple..."
            // Heuristic: If we are already in a question, and this line starts with a number?
            // "1 I come..." matches.

            // To reduce false positives (like "55 multiple..."), ensure the number is roughly sequential or small? 
            // Or just verify it looks like a question structure.

            console.log(`[DEBUG] Question start detected at line ${index}: ID=${qMatch[1]} Text="${qMatch[2].substring(0, 30)}..."`);
            // Push pending question
            if (currentQuestion) {
                questions.push(currentQuestion);
            }
            currentQuestion = {
                id: Date.now() + Math.random(),
                questionText: qMatch[2],
                options: [],
                correctAnswer: ''
            };
            return;
        }

        // 3. Check for Options
        if (currentQuestion) {
            // Option Regex: "A. Text", "A) Text", "A Text"
            // We split lines, so usually one option per line now?
            // Unlikely to have "A ... B ..." if we split by space.

            // Regex for single option at start:
            const optionMatch = line.match(/^([A-D])[\.\)\s]\s+(.*)/i);

            if (optionMatch) {
                console.log(`[DEBUG] Option detected at line ${index}: Key=${optionMatch[1]} Text="${optionMatch[2].substring(0, 20)}..."`);
                currentQuestion.options.push({
                    key: optionMatch[1].toUpperCase(),
                    text: optionMatch[2].trim()
                });
            } else {
                // Append to previous
                if (currentQuestion.options.length === 0) {
                    currentQuestion.questionText += " " + line;
                } else {
                    currentQuestion.options[currentQuestion.options.length - 1].text += " " + line;
                }
            }
        }
    });

    // Push last one
    if (currentQuestion) {
        questions.push(currentQuestion);
    }

    console.log(`[DEBUG] Parsed ${questions.length} questions.`);
    return questions;
};

/**
 * Save Exam
 */
const saveExam = async (req, res) => {
    const { name, subject, totalMarks, duration, questions } = req.body;

    try {
        // 1. Create Question Docs
        const questionIds = [];

        // Create Exam first to get ID? Or Questions first?
        // Questions need examId.
        const exam = new Exam({
            name,
            subject,
            totalMarks,
            durationMinutes: duration,
            // createdBy: req.user.id // If auth middleware used
        });

        const savedExam = await exam.save();

        for (const q of questions) {
            const newQ = new Question({
                examId: savedExam._id,
                questionText: q.questionText,
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
    try {
        const exams = await Exam.find().sort({ createdAt: -1 });
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

        // Delete exam
        await Exam.findByIdAndDelete(id);

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
    const { name, subject, totalMarks, duration, questions } = req.body;

    try {
        // 1. Update Exam Metadata
        const exam = await Exam.findByIdAndUpdate(
            id,
            {
                name,
                subject,
                totalMarks,
                durationMinutes: duration
            },
            { new: true }
        );

        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        // 2. Update Questions
        // We assume 'questions' is a list of objects.
        // If question object has _id, update it.
        // Note: This simple loop updates one by one. For bulk, bulkWrite is better but this is fine for now.
        if (questions && Array.isArray(questions)) {
            for (const q of questions) {
                if (q._id) {
                    await Question.findByIdAndUpdate(q._id, {
                        questionText: q.questionText,
                        options: q.options,
                        correctAnswer: q.correctAnswer,
                        marks: q.marks
                    });
                } else {
                    // Handle new questions if necessary, or ignore
                    // For now, focusing on updating existing ones as per request
                }
            }
        }

        res.status(200).json({ message: 'Exam updated successfully', exam });
    } catch (err) {
        console.error('Update Exam Error:', err);
        res.status(500).json({ message: 'Failed to update exam', error: err.message });
    }
};

module.exports = {
    uploadExamPdf,
    saveExam,
    getAllExams,
    deleteExam,
    getExamById,
    updateExam
};
