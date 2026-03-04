const FiveMinTest = require('../models/FiveMinTest');
const pdfImgConvert = require('pdf-img-convert');
const Tesseract = require('tesseract.js');
const { PDFParse } = require('pdf-parse'); // Check if this is the correct import based on examController.js

// Helper to parse the specialized 5 Min Test format
const parseFiveMinTestFormat = (text) => {
    let overview = "";
    const questions = [];

    // Normalize text
    const cleanText = text.replace(/\r\n/g, '\n');
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let currentSection = "NONE"; // NONE, OVERVIEW, QUESTIONS
    let currentQuestion = null;

    lines.forEach((line) => {
        // Section detection
        if (line.toLowerCase() === "overview") {
            currentSection = "OVERVIEW";
            return;
        }
        if (line.toLowerCase() === "true / false" || line.toLowerCase() === "true/false") {
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
                    options: [],
                    correctAnswer: "",
                    type: "True/False"
                };
                return;
            }

            // Match options: "A. True", "B. False"
            const optMatch = line.match(/^([A-D])[\.\)\s]\s*(.*)/i);
            if (optMatch && currentQuestion) {
                currentQuestion.options.push({
                    key: optMatch[1].toUpperCase(),
                    text: optMatch[2].trim()
                });
                return;
            }

            // Match answer: "Ans. (A)", "Ans (A)", "Answer: A"
            const ansMatch = line.match(/(?:Answer|Ans|Right Answer)[\s\.\:\-\(\[]*([A-D])/i);
            if (ansMatch && currentQuestion) {
                currentQuestion.correctAnswer = "Option " + ansMatch[1].toUpperCase();
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
        const test = new FiveMinTest(req.body);
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

        const tests = await FiveMinTest.find(query).sort({ createdAt: -1 });
        res.status(200).json(tests);
    } catch (err) {
        console.error('Get All 5 Min Tests Error:', err);
        res.status(500).json({ message: 'Failed to fetch tests', error: err.message });
    }
};

// Update Test
const updateTest = async (req, res) => {
    const { id } = req.params;
    try {
        const test = await FiveMinTest.findByIdAndUpdate(id, req.body, { new: true });
        if (!test) {
            return res.status(404).json({ message: 'Test not found' });
        }
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

module.exports = {
    uploadFiveMinTestPdf,
    createTest,
    getAllTests,
    updateTest,
    deleteTest
};
