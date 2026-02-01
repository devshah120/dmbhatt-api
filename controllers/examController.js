const Exam = require('../models/Exam');
const Question = require('../models/Question');
const pdfImgConvert = require('pdf-img-convert');
const Tesseract = require('tesseract.js');

/**
 * Upload PDF and Extract Questions (OCR)
 * Does NOT save to DB immediately. Returns parsed questions for verification.
 */
const uploadExamPdf = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No PDF file uploaded' });
    }

    try {
        console.log('Starting PDF conversion...');
        // 1. Convert PDF to Images (Array of Uint8Array)
        const pdfBuffer = req.file.buffer;
        const outputImages = await pdfImgConvert.convert(pdfBuffer);

        console.log(`Converted PDF to ${outputImages.length} images. Starting OCR...`);

        let fullText = "";

        // 2. Perform OCR on each page
        // Use mapped promise to run concurrently-ish (limit concurrency in prod, but ok for now)
        for (let i = 0; i < outputImages.length; i++) {
            const imageBuffer = outputImages[i];

            const { data: { text } } = await Tesseract.recognize(
                imageBuffer,
                'eng',
                { logger: m => console.log(`Page ${i + 1}: ${m.status} ${Math.floor(m.progress * 100)}%`) }
            );

            fullText += text + "\n";
        }

        console.log('OCR Complete. Cleaning and Parsing...');

        // 3. Clean and Parse Text
        const parsedQuestions = parseQuestionsErrors(fullText);

        res.status(200).json({
            message: 'OCR Processing Complete',
            rawText: fullText, // Debugging
            questions: parsedQuestions
        });

    } catch (err) {
        console.error('PDF Upload Error:', err);
        res.status(500).json({ message: 'Failed to process PDF', error: err.message });
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
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    // Regex patterns
    const questionStart = /^(\d+)[\.\)]\s*(.*)/; // 1. or 1) 
    const optionStart = /^([A-D])[\)\.]\s*(.*)/i; // A) or A.
    const answerStart = /^(Answer|Ans)[\s:-]*([A-D])/i; // Answer: A

    let currentQuestion = null;

    for (const line of lines) {
        // Check for Answer Line
        const ansMatch = line.match(answerStart);
        if (ansMatch) {
            if (currentQuestion) {
                currentQuestion.correctAnswer = ansMatch[2].toUpperCase();
                questions.push(currentQuestion);
                currentQuestion = null;
            }
            continue;
        }

        // Check for Option Line
        const optMatch = line.match(optionStart);
        if (optMatch) {
            if (currentQuestion) {
                currentQuestion.options.push({
                    key: optMatch[1].toUpperCase(),
                    text: optMatch[2]
                });
            }
            continue;
        }

        // Check for New Question
        const qMatch = line.match(questionStart);
        if (qMatch) {
            // If previous question was pending (no answer found), push it anyway? 
            // Or maybe it spans multiple lines.
            // For now, if we hit a new number, we assume previous is done (even if answer missing - user can fix in UI)
            if (currentQuestion) {
                questions.push(currentQuestion);
            }

            currentQuestion = {
                id: Date.now() + Math.random(), // Temp frontend ID
                questionText: qMatch[2],
                options: [],
                correctAnswer: '' // Default empty
            };
            continue;
        }

        // Continuation of previous line (Multi-line question or option)
        if (currentQuestion) {
            if (currentQuestion.options.length > 0) {
                // Append to last option
                currentQuestion.options[currentQuestion.options.length - 1].text += " " + line;
            } else {
                // Append to question text
                currentQuestion.questionText += " " + line;
            }
        }
    }

    // Push last one
    if (currentQuestion) {
        questions.push(currentQuestion);
    }

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

module.exports = {
    uploadExamPdf,
    saveExam
};
