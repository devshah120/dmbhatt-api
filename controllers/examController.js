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
                'eng+guj',
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
    const cleanText = text.replace(/\r\n/g, '\n');
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l);

    // Regex patterns
    const questionStart = /^(\d{1,3})[\.\)]\s*(.*)/; // Matches "01. Text", "1) Text"

    // Answer Regex: Matches "Ans. (C)", "Answer: C", "Ans: C", "Ans (A)"
    const answerPattern = /(?:Answer|Ans|Right Answer)[\s\.\:\-\(\[]*([A-D])/i;

    let currentQuestion = null;

    for (const line of lines) {
        // 1. Check for Answer (Highest Priority if it ends a block)
        const ansMatch = line.match(answerPattern);
        if (ansMatch) {
            if (currentQuestion) {
                currentQuestion.correctAnswer = ansMatch[1].toUpperCase();
                questions.push(currentQuestion);
                currentQuestion = null;
            }
            continue;
        }

        // 2. Check for New Question Start
        const qMatch = line.match(questionStart);
        if (qMatch) {
            // Push pending question if exists
            if (currentQuestion) {
                questions.push(currentQuestion);
            }
            currentQuestion = {
                id: Date.now() + Math.random(),
                questionText: qMatch[2],
                options: [],
                correctAnswer: ''
            };
            continue;
        }

        // 3. Check for Options (Handle multiple per line)
        if (currentQuestion) {
            // Regex to find options: "A. Text", " A) Text", " (A) Text"
            // Look for [A-D] followed by dot/paren/space
            // Safe pattern: Start of line or whitespace -> Letter -> dot/paren -> whitespace

            const optionRegex = /(?:^|\s{2,})([A-D])[\.\)]\s+(.*?)(?=\s{2,}[A-D][\.\)]|$)/gi;

            // If the line *starts* with an option characteristic
            const startsWithOption = /^([A-D])[\.\)]\s/.test(line);

            if (startsWithOption || optionRegex.test(line)) {
                // Reset regex lastIndex
                optionRegex.lastIndex = 0;
                let foundOption = false;
                let match;

                // Try parsing multiple options on one line
                while ((match = optionRegex.exec(line)) !== null) {
                    foundOption = true;
                    currentQuestion.options.push({
                        key: match[1].toUpperCase(),
                        text: match[2].trim()
                    });
                }

                // Fallback: If regex failed but line starts with Option (simple case)
                if (!foundOption && startsWithOption) {
                    const parts = line.match(/^([A-D])[\.\)]\s+(.*)/);
                    if (parts) {
                        currentQuestion.options.push({
                            key: parts[1].toUpperCase(),
                            text: parts[2].trim()
                        });
                    }
                }
            } else {
                // Continuation of Question Text OR Previous Option
                if (currentQuestion.options.length === 0) {
                    // Still part of question text
                    currentQuestion.questionText += " " + line;
                } else {
                    // Append to last option
                    currentQuestion.options[currentQuestion.options.length - 1].text += " " + line;
                }
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
