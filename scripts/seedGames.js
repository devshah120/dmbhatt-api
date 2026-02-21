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
    { q: "REX🏝️", a: "Jurassic Park", diff: "Medium" },
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

const factOrFictionQuestions = [
    { q: "The Great Wall of China is visible from space with the naked eye.", a: "Fiction", reason: "It's a common myth but not true without aid.", diff: "Easy" },
    { q: "Octopuses have three hearts.", a: "Fact", reason: "They have two peripheral hearts and one central heart.", diff: "Medium" },
    { q: "A strawberry is a berry.", a: "Fiction", reason: "Botanically, strawberries are not berries, but bananas are!", diff: "Medium" },
    { q: "The shortest war in history lasted 38 minutes.", a: "Fact", reason: "The Anglo-Zanzibar War of 1896.", diff: "Hard" },
    { q: "Sound travels faster in water than in air.", a: "Fact", reason: "Sound travels about 4.3 times faster in water.", diff: "Medium" },
    { q: "Goldfish only have a three-second memory.", a: "Fiction", reason: "Goldfish can remember things for months.", diff: "Easy" },
    { q: "There are more stars in the universe than grains of sand on Earth.", a: "Fact", reason: "Estimated 10^24 stars vs 7.5*10^18 sand grains.", diff: "Medium" },
    { q: "Humans use only 10% of their brains.", a: "Fiction", reason: "We use virtually every part of the brain.", diff: "Easy" },
    { q: "The Nile is the longest river in the world.", a: "Fact", reason: "Stretches 6,650 km.", diff: "Easy" },
    { q: "Monaco is the smallest country in the world.", a: "Fiction", reason: "Vatican City is the smallest.", diff: "Medium" }
];

const speedMathQuestions = [
    { q: "12 * 8 = ?", a: "96", opts: ["84", "96", "108", "116"], diff: "Easy" },
    { q: "25% of 200 is ?", a: "50", opts: ["25", "50", "75", "100"], diff: "Easy" },
    { q: "Square root of 225 is ?", a: "15", opts: ["12", "15", "18", "25"], diff: "Medium" },
    { q: "15 * 15 = ?", a: "225", opts: ["125", "225", "325", "425"], diff: "Easy" },
    { q: "3^3 + 4^2 = ?", a: "43", opts: ["31", "43", "52", "61"], diff: "Medium" },
    { q: "1/2 + 1/4 = ?", a: "3/4", opts: ["2/4", "3/4", "1/4", "5/4"], diff: "Easy" },
    { q: "1000 - 357 = ?", a: "643", opts: ["643", "743", "653", "753"], diff: "Medium" },
    { q: "12 * 12 * 0 = ?", a: "0", opts: ["144", "0", "12", "1"], diff: "Easy" },
    { q: "99 / 9 + 11 = ?", a: "22", opts: ["11", "22", "33", "44"], diff: "Medium" },
    { q: "15% of 60 = ?", a: "9", opts: ["6", "9", "12", "15"], diff: "Medium" }
];

const wordScrambleWords = [
    "SCIENCE", "VALENCY", "GRAVITY", "ALGEBRA", "GRAMMAR", "GEOLOGY", "HISTORY", "FOSSILS", "ELEMENT", "NUCLEUS",
    "GLUCOSE", "VITAMIN", "PLASTIC", "MERCURY", "PLANETS", "DIAMOND", "ENGLISH", "PYRAMID", "GEOMETRY", "SPECIES",
    "PROTEIN", "OXYGEN", "SULPHUR", "MAMMALS", "VOLTAGE", "DENSITY", "BIOLOGY", "PHYSICS", "THERMAL", "CAVITY"
];

const seedGames = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        const games = [
            { type: 'Word Bridge', data: wordBridgeQuestions },
            { type: 'Emoji Decoder', data: emojiDecoderQuestions },
            { type: 'Grammar Guardian', data: grammarQuestions },
            { type: 'Sentence Builder', data: sentenceBuilderQuestions },
            { type: 'Odd One Out', data: oddOneOutQuestions },
            { type: 'Fact or Fiction', data: factOrFictionQuestions },
            { type: 'Speed Math', data: speedMathQuestions },
        ];

        for (const game of games) {
            await GameQuestion.deleteMany({ gameType: game.type });
            console.log(`Adding ${game.type} questions...`);
            for (const item of game.data) {
                await new GameQuestion({
                    gameType: game.type,
                    questionText: item.q,
                    options: item.opts || [],
                    correctAnswer: item.a,
                    difficulty: item.diff || "Medium",
                    meta: item.reason ? { reason: item.reason } : (game.type === 'Word Bridge' ? { hint: "Complete the analogy!" } : {})
                }).save();
            }
        }

        // Word Scramble Seeding
        await GameQuestion.deleteMany({ gameType: 'Word Scramble' });
        console.log(`Adding Word Scramble words...`);
        for (const word of wordScrambleWords) {
            await new GameQuestion({
                gameType: 'Word Scramble',
                questionText: word,
                correctAnswer: word,
                difficulty: "Medium",
                options: [],
                meta: { category: "General Education" }
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
