const GameQuestion = require('../models/GameQuestion');
const xlsx = require('xlsx');

// Get all possible game types from the schema
exports.getGameTypes = async (req, res) => {
    try {
        const gameTypes = GameQuestion.schema.path('gameType').enumValues;
        res.status(200).json(gameTypes);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

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

// Import game questions from Excel
exports.importGameQuestions = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        const { gameType: paramGameType } = req.body; 
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        const validGameTypes = GameQuestion.schema.path('gameType').enumValues;

        for (const row of data) {
            try {
                const gameType = row['Game Type'] || row['GameType'] || row['gameType'] || paramGameType;
                if (!gameType || !validGameTypes.includes(gameType)) {
                    results.failed++;
                    results.errors.push(`Invalid or missing Game Type: ${gameType}`);
                    continue;
                }

                let questionText = row['Question Text'] || row['QuestionText'] || row['Question'] || row['question'] || 
                                   row['Emojis'] || row['Statement'] || row['Correct Sentence'] || row['Title'] || row['First Word'] || row['Correct Word'];
                
                let correctAnswer = row['Correct Answer'] || row['CorrectAnswer'] || row['Answer'] || row['answer'] || 
                                    row['Correct Phrase'] || row['Fact or Fiction'] || row['The Odd One'] || row['Second Word'];
                
                const difficulty = row['Difficulty'] || row['difficulty'] || 'Medium';
                const options = [];
                const meta = {};

                // 1. MCQ Category (Speed Math, GK Quiz, etc.)
                if ([
                    'Speed Math', 'Grammar Guardian', 'GK Quiz', 'Spelling Master', 
                    'Capital City Quest', 'Flag Explorer', 'Stroop Effect Challenge', 
                    'Memory Match', 'Spot The Difference', 'Code Breaker', 
                    'Number Mastermind', 'Mental Math Speedrun', 'Sequence Memory'
                ].includes(gameType)) {
                    const opt1 = row['Option 1'] || row['Option1'];
                    const opt2 = row['Option 2'] || row['Option2'];
                    const opt3 = row['Option 3'] || row['Option3'];
                    const opt4 = row['Option 4'] || row['Option4'];
                    if (opt1 !== undefined) options.push(String(opt1));
                    if (opt2 !== undefined) options.push(String(opt2));
                    if (opt3 !== undefined) options.push(String(opt3));
                    if (opt4 !== undefined) options.push(String(opt4));
                    
                    if (gameType === 'Memory Match' || gameType === 'Spot The Difference') {
                        if (!questionText) questionText = "Find the matching pairs or differences.";
                    }
                }

                // 2. Emoji Decoder
                if (gameType === 'Emoji Decoder') {
                    meta.hint = String(row['Hint'] || row['hint'] || "");
                }

                // 3. Fact or Fiction
                if (gameType === 'Fact or Fiction') {
                    meta.fact = String(row['Fact'] || row['Explanation Fact'] || row['fact'] || "");
                }

                // 4. Odd One Out
                if (gameType === 'Odd One Out') {
                    const opt1 = row['Option 1'] || row['Option1'];
                    const opt2 = row['Option 2'] || row['Option2'];
                    const opt3 = row['Option 3'] || row['Option3'];
                    const opt4 = row['Option 4'] || row['Option4'];
                    if (opt1 !== undefined) options.push(String(opt1));
                    if (opt2 !== undefined) options.push(String(opt2));
                    if (opt3 !== undefined) options.push(String(opt3));
                    if (opt4 !== undefined) options.push(String(opt4));
                    meta.reason = String(row['Reason'] || row['reason'] || "");
                    if (!questionText) questionText = "Find the odd one out.";
                }

                // 5. Word Scramble
                if (gameType === 'Word Scramble') {
                    if (!questionText) questionText = String(correctAnswer); // Auto-scramble fallback
                }

                // 6. Sentence Builder
                if (gameType === 'Sentence Builder') {
                    correctAnswer = questionText;
                }

                // 7. Short Answer Category (Math Riddles, etc.)
                if ([
                    'Math Riddles', 'Number Series', 'Magic Square', 'Algebra Balancer', 
                    'Syllable Scramble', 'Proverb Completer', 'Direction Sense', 
                    'Logic Gates Quest'
                ].includes(gameType)) {
                    meta.hint = String(row['Hint'] || row['hint'] || "");
                }

                // 8. List Based Category
                if (['Subject Word Search', 'Grammar Sorter', 'Word Chain'].includes(gameType)) {
                    meta.wordsList = String(row['Words List'] || row['WordsList'] || row['wordsList'] || "");
                    if (!correctAnswer) correctAnswer = "Dynamic List";
                }

                if (!questionText || !correctAnswer) {
                    results.failed++;
                    results.errors.push(`Missing required fields for ${gameType}. Row: ${JSON.stringify(row)}`);
                    continue;
                }

                const newQuestion = new GameQuestion({
                    gameType,
                    questionText: String(questionText),
                    options,
                    correctAnswer: String(correctAnswer),
                    difficulty,
                    meta
                });

                await newQuestion.save();
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push(`Error processing row: ${err.message}`);
            }
        }

        res.status(200).json({ message: 'Import processed', results });

    } catch (error) {
        console.error('Import Games Error:', error);
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

// Edit a game question
exports.editGameQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const updatedQuestion = await GameQuestion.findByIdAndUpdate(id, updates, { new: true });

        if (!updatedQuestion) {
            return res.status(404).json({ message: "Question not found" });
        }

        res.status(200).json({ message: "Game question updated successfully", question: updatedQuestion });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Delete a game question
exports.deleteGameQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedQuestion = await GameQuestion.findByIdAndDelete(id);

        if (!deletedQuestion) {
            return res.status(404).json({ message: "Question not found" });
        }

        res.status(200).json({ message: "Game question deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

