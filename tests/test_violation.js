const axios = require('axios');

// Replace with a valid student token and examId for testing
const TOKEN = 'YOUR_TEST_TOKEN';
const BASE_URL = 'http://localhost:5000/api';
const EXAM_ID = '65e7...'; // Replace with valid ObjectId

async function testViolation() {
    try {
        console.log("Testing Violation Record...");
        const response = await axios.post(`${BASE_URL}/exam/violation`, {
            examId: EXAM_ID,
            examType: 'REGULAR'
        }, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });
        console.log("Response:", response.data);
    } catch (error) {
        console.error("Error:", error.response ? error.response.data : error.message);
    }
}

// testViolation();
console.log("Verification script created. Please update TOKEN and EXAM_ID before running.");
