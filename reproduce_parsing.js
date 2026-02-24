const parseQuestionsErrors = (text) => {
    const questions = [];
    const cleanText = text.replace(/\r\n/g, '\n');
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l);

    console.log(`[DEBUG] Total lines to parse: ${lines.length}`);

    // Regex patterns
    // Relaxed Question Start: Allows optional non-word chars at start, e.g. "| 1. Text" or "• 1. Text"
    // CURRENT REGEX:
    const questionStart = /^[\W]*(\d{1,3})[\.\)\s]+\s*(.*)/;

    // Answer Regex: Matches "Ans. (C)", "Answer: C", "Ans: C", "Ans (A)"
    const answerPattern = /(?:Answer|Ans|Right Answer)[\s\.\:\-\(\[]*([A-D])/i;

    let currentQuestion = null;

    lines.forEach((line, index) => {
        console.log(`[DEBUG] Line ${index}: "${line}"`);

        // 1. Check for Answer
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
            console.log(`[DEBUG] Question start detected at line ${index}: ID=${qMatch[1]}`);
            if (currentQuestion) {
                questions.push(currentQuestion);
            }
            currentQuestion = {
                id: qMatch[1],
                questionText: qMatch[2],
                options: [],
                correctAnswer: ''
            };
            return;
        }

        // 3. Check for Options... (Existing logic omitted for brevity in repro, but we can verify Q match first)
    });

    return questions;
};

const sampleText = `
Name: __________________________
This English test consists of 55 multiple-choice questions. We suggest you allow 30 min. to
complete the test. Good luck.
Circle the best answer:
1 I come ..... Italy. 10 ........
A to A How often...
B from B Where...
C at C How...
D in D Why...
2 A I is a cold. 11 I like ......
`;

const result = parseQuestionsErrors(sampleText);
console.log('Result:', JSON.stringify(result, null, 2));
