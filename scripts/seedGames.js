const mongoose = require('mongoose');
const GameQuestion = require('../models/GameQuestion');
require('dotenv').config();

const wordBridgeQuestions = [
    // Science
    { q: "Photosynthesis : Chlorophyll :: Respiration : ?", a: "Mitochondria", opts: ["Mitochondria", "Nucleus", "Ribosome", "Cell Wall"], diff: "Medium" },
    { q: "Solid : Melting :: Liquid : ?", a: "Evaporation", opts: ["Evaporation", "Freezing", "Sublimation", "Condensation"], diff: "Easy" },
    { q: "Newton : Force :: Joule : ?", a: "Energy", opts: ["Energy", "Power", "Pressure", "Mass"], diff: "Easy" },
    { q: "Acid : Litmus Red :: Base : ?", a: "Litmus Blue", opts: ["Litmus Blue", "Litmus Green", "No Color", "Yellow"], diff: "Easy" },
    { q: "Amphibian : Frog :: Reptile : ?", a: "Snake", opts: ["Snake", "Fish", "Whale", "Bat"], diff: "Easy" },
    { q: "Sun : Star :: Moon : ?", a: "Satellite", opts: ["Satellite", "Planet", "Comet", "Meteor"], diff: "Easy" },
    { q: "H2O : Water :: NaCl : ?", a: "Salt", opts: ["Salt", "Sugar", "Acid", "Oxygen"], diff: "Easy" },
    { q: "Liver : Bile :: Pancreas : ?", a: "Insulin", opts: ["Insulin", "Saliva", "Blood", "Thyroxine"], diff: "Medium" },
    { q: "DNA : Nucleus :: Hemoglobin : ?", a: "Red Blood Cells", opts: ["Red Blood Cells", "White Blood Cells", "Plasma", "Platelets"], diff: "Medium" },
    { q: "Concave : Diverging :: Convex : ?", a: "Converging", opts: ["Converging", "Bending", "Reflecting", "Diverging"], diff: "Medium" },

    // Maths
    { q: "Square : Area :: Cube : ?", a: "Volume", opts: ["Volume", "Length", "Surface", "Perimeter"], diff: "Easy" },
    { q: "Circle : Diameter :: Sphere : ?", a: "Surface Area", opts: ["Radius", "Surface Area", "Circumference", "Volume"], diff: "Medium" },
    { q: "Sum : Addition :: Product : ?", a: "Multiplication", opts: ["Multiplication", "Subtraction", "Division", "Power"], diff: "Easy" },
    { q: "90 Degree : Right Angle :: 180 Degree : ?", a: "Straight Angle", opts: ["Straight Angle", "Acute Angle", "Obtuse Angle", "Reflex Angle"], diff: "Easy" },
    { q: "Triangle : 3 :: Hexagon : ?", a: "6", opts: ["6", "5", "8", "4"], diff: "Easy" },
    { q: "Radius : Half :: Diameter : ?", a: "Full", opts: ["Full", "Quarter", "Double", "Triple"], diff: "Easy" },
    { q: "Numerator : Top :: Denominator : ?", a: "Bottom", opts: ["Bottom", "Side", "Middle", "Total"], diff: "Easy" },
    { q: "2 : 4 :: 5 : ?", a: "25", opts: ["25", "10", "15", "20"], diff: "Easy" },
    { q: "Protractor : Angle :: Ruler : ?", a: "Length", opts: ["Length", "Weight", "Volume", "Area"], diff: "Easy" },
    { q: "Positive : Gain :: Negative : ?", a: "Loss", opts: ["Loss", "Zero", "Double", "Add"], diff: "Easy" }
];

const emojiDecoderQuestions = [
    { q: "🦁👑", a: "Lion King", diff: "Easy" },
    { q: "⚡👓", a: "Harry Potter", diff: "Easy" },
    { q: "🍎💻", a: "Apple", diff: "Easy" },
    { q: "❄️👸", a: "Frozen", diff: "Easy" },
    { q: "🔨⚡", a: "Thor", diff: "Easy" },
    { q: "🕷️👨", a: "Spider Man", diff: "Easy" },
    { q: "🦇👨", a: "Batman", diff: "Easy" },
    { q: "🧸📖", a: "Pooh", diff: "Easy" },
    { q: "🐠🔎", a: "Finding Nemo", diff: "Easy" },
    { q: "🐭🥖", a: "Ratatouille", diff: "Easy" },
    { q: "🥊🐯", a: "Rocky", diff: "Medium" },
    { q: "🧙‍♂️💍", a: "Lord of the Rings", diff: "Medium" },
    { q: "🐒🚢🗽", a: "King Kong", diff: "Medium" },
    { q: "🦖🏝️", a: "Jurassic Park", diff: "Medium" },
    { q: "🏠🎈🎈", a: "Up", diff: "Easy" },
    { q: "👻🚫", a: "Ghostbusters", diff: "Easy" },
    { q: "🏹🍎", a: "Robin Hood", diff: "Medium" },
    { q: "🛳️🧊", a: "Titanic", diff: "Easy" },
    { q: "🎭👻", a: "Phantom of the Opera", diff: "Hard" },
    { q: "🍫🏭", a: "Charlie and the Chocolate Factory", diff: "Medium" }
];

const grammarQuestions = [
    { q: "The capital of France is ___.", a: "Paris", opts: ["Paris", "London", "Berlin", "Rome"], diff: "Easy" },
    { q: "She ___ her homework already.", a: "has done", opts: ["has done", "did", "does", "done"], diff: "Medium" },
    { q: "We ___ to the beach last Sunday.", a: "went", opts: ["went", "go", "gone", "going"], diff: "Easy" },
    { q: "He is the ___ person I know.", a: "tallest", opts: ["tallest", "taller", "tall", "most tall"], diff: "Easy" },
    { q: "___ you like some coffee?", a: "Would", opts: ["Would", "Could", "Should", "Will"], diff: "Easy" },
    { q: "The book ___ on the table.", a: "is", opts: ["is", "are", "am", "be"], diff: "Easy" },
    { q: "I have ___ friends in this city.", a: "a few", opts: ["a few", "a little", "much", "any"], diff: "Medium" },
    { q: "You ___ smoke here.", a: "mustn't", opts: ["mustn't", "don't have to", "can", "needn't"], diff: "Medium" },
    { q: "If it rains, we ___ at home.", a: "will stay", opts: ["will stay", "stayed", "stay", "would stay"], diff: "Medium" },
    { q: "This is the car ___ my father bought.", a: "which", opts: ["which", "who", "whom", "whose"], diff: "Easy" }
];

const sentenceBuilderQuestions = [
    { q: "The Earth revolves around the Sun", a: "The Earth revolves around the Sun", diff: "Easy" },
    { q: "Plants produce oxygen through photosynthesis", a: "Plants produce oxygen through photosynthesis", diff: "Medium" },
    { q: "Water consists of two hydrogen atoms", a: "Water consists of two hydrogen atoms", diff: "Medium" },
    { q: "She walks to school every day", a: "She walks to school every day", diff: "Easy" },
    { q: "Mitochondria is the powerhouse of cell", a: "Mitochondria is the powerhouse of cell", diff: "Medium" },
    { q: "Gravity keeps our feet on ground", a: "Gravity keeps our feet on ground", diff: "Easy" },
    { q: "Light travels faster than sound waves", a: "Light travels faster than sound waves", diff: "Medium" },
    { q: "Proper nouns always start with capitals", a: "Proper nouns always start with capitals", diff: "Medium" },
    { q: "A triangle has three interior angles", a: "A triangle has three interior angles", diff: "Easy" },
    { q: "Shakespeare wrote many famous plays", a: "Shakespeare wrote many famous plays", diff: "Medium" }
];

const oddOneOutQuestions = [
    { q: "Which one does not belong?", a: "Cow", opts: ["Lion", "Tiger", "Wolf", "Cow"], reason: "Cow is a domestic herbivore, others are wild carnivores.", diff: "Easy" },
    { q: "Which one is not like the others?", a: "Iron", opts: ["Oxygen", "Nitrogen", "Hydrogen", "Iron"], reason: "Iron is a solid metal, others are gases.", diff: "Medium" },
    { q: "Pick the odd one out:", a: "27", opts: ["9", "16", "25", "27"], reason: "27 is not a perfect square.", diff: "Easy" },
    { q: "Which one is different?", a: "Carrot", opts: ["Mango", "Apple", "Banana", "Carrot"], reason: "Carrot is a vegetable, others are fruits.", diff: "Easy" },
    { q: "Find the odd one:", a: "Picasso", opts: ["Newton", "Einstein", "Galileo", "Picasso"], reason: "Picasso was an artist, others were scientists.", diff: "Medium" },
    { q: "Identify the different shape:", a: "Cube", opts: ["Triangle", "Square", "Circle", "Cube"], reason: "Cube is 3D, others are 2D shapes.", diff: "Easy" },
    { q: "Which of these is not a planet?", a: "Moon", opts: ["Mars", "Venus", "Jupiter", "Moon"], reason: "The Moon is a satellite, others are planets.", diff: "Easy" },
    { q: "Pick the different instrument:", a: "Drums", opts: ["Piano", "Guitar", "Violin", "Drums"], reason: "Drums are percussion, others are string/key instruments.", diff: "Medium" },
    { q: "Which one is not a flower?", a: "Oak", opts: ["Rose", "Lily", "Daisy", "Oak"], reason: "Oak is a tree, others are flowers.", diff: "Easy" },
    { q: "Find the odd mammal:", a: "Shark", opts: ["Whale", "Dolphin", "Seal", "Shark"], reason: "Shark is a fish, others are mammals.", diff: "Medium" }
];

const seedGames = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        // Clear and Seed Word Bridge
        await GameQuestion.deleteMany({ gameType: 'Word Bridge' });
        console.log(`Adding Word Bridge questions...`);
        for (const item of wordBridgeQuestions) {
            await new GameQuestion({
                gameType: 'Word Bridge',
                questionText: item.q,
                options: item.opts,
                correctAnswer: item.a,
                difficulty: item.diff,
                meta: { hint: "Complete the analogy!" }
            }).save();
        }

        // Clear and Seed Emoji Decoder
        await GameQuestion.deleteMany({ gameType: 'Emoji Decoder' });
        console.log(`Adding Emoji Decoder questions...`);
        for (const item of emojiDecoderQuestions) {
            await new GameQuestion({
                gameType: 'Emoji Decoder',
                questionText: item.q,
                options: [],
                correctAnswer: item.a,
                difficulty: item.diff,
                meta: { hint: "What does this emoji set represent?" }
            }).save();
        }

        // Clear and Seed Grammar Guardian
        await GameQuestion.deleteMany({ gameType: 'Grammar Guardian' });
        console.log(`Adding Grammar Guardian questions...`);
        for (const item of grammarQuestions) {
            await new GameQuestion({
                gameType: 'Grammar Guardian',
                questionText: item.q,
                options: item.opts,
                correctAnswer: item.a,
                difficulty: item.diff,
                meta: { category: "English Grammar" }
            }).save();
        }

        // Clear and Seed Sentence Builder
        await GameQuestion.deleteMany({ gameType: 'Sentence Builder' });
        console.log(`Adding Sentence Builder questions...`);
        for (const item of sentenceBuilderQuestions) {
            await new GameQuestion({
                gameType: 'Sentence Builder',
                questionText: item.q,
                options: [],
                correctAnswer: item.a,
                difficulty: item.diff,
                meta: { hint: "Arrange the words correctly!" }
            }).save();
        }

        // Clear and Seed Odd One Out
        await GameQuestion.deleteMany({ gameType: 'Odd One Out' });
        console.log(`Adding Odd One Out questions...`);
        for (const item of oddOneOutQuestions) {
            await new GameQuestion({
                gameType: 'Odd One Out',
                questionText: item.q,
                options: item.opts,
                correctAnswer: item.a,
                difficulty: item.diff,
                meta: { reason: item.reason }
            }).save();
        }

        console.log('Game seeding completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Game Seeding Error:', err);
        process.exit(1);
    }
};

seedGames();
