const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

/**
 * Generate JWT token for authenticated user
 */
const generateToken = (userId, role) => {
    return jwt.sign(
        { userId, role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' } // Token expires in 7 days
    );
};

/**
 * Hash login code
 */
const hashLoginCode = async (loginCode) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(loginCode, salt);
};

/**
 * Compare login code with hash
 */
const compareLoginCode = async (loginCode, hash) => {
    return await bcrypt.compare(loginCode, hash);
};

/**
 * Parse address string into components
 * Format: "Street, City, State, Pincode"
 */
const parseAddress = (addressString) => {
    if (!addressString) return null;

    const parts = addressString.split(',').map(part => part.trim());
    return {
        street: parts[0] || '',
        city: parts[1] || '',
        state: parts[2] || '',
        pincode: parts[3] || ''
    };
};

module.exports = {
    generateToken,
    hashLoginCode,
    compareLoginCode,
    parseAddress
};
