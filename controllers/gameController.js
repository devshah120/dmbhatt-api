const GameQuestion = require('../models/GameQuestion');

// Add a new game question
exports.addGameQuestion = async (req, res) => {
    try {
        const { gameType, questionText, options, correctAnswer, difficulty, meta } = req.body;

        if (!gameType || !questionText || !correctAnswer) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const newQuestion = new GameQuestion({
            gameType,
            questionText,
            options,
            correctAnswer,
            difficulty,
            meta
        });

        await newQuestion.save();
        res.status(201).json({ message: "Game question added successfully", question: newQuestion });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get game questions by game type
exports.getGameQuestions = async (req, res) => {
    try {
        const { gameType } = req.params;
        const questions = await GameQuestion.find({ gameType });

        if (!questions.length) {
            return res.status(404).json({ message: "No questions found for this game type" });
        }

        res.status(200).json(questions);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get all game questions (Optional for admin view)
exports.getAllGameQuestions = async (req, res) => {
    try {
        const questions = await GameQuestion.find();
        res.status(200).json(questions);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
