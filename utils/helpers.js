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

const getUserDisplayName = (user) => {
    if (!user) return '';

    const nameParts = [];
    if (user.firstName) nameParts.push(user.firstName);
    if (user.lastName) nameParts.push(user.lastName);
    if (user.name) nameParts.push(user.name);

    const displayName = nameParts.filter(Boolean).join(' ').trim();
    return displayName || user.phoneNum || user.email || 'Admin App';
};

/**
 * Normalize an optional phone number.
 *
 * phoneNum carries a partial unique index covering non-empty strings only.
 * Blank input must become undefined so the key is omitted entirely rather than
 * stored as '' — keeping phone-less users out of the unique index.
 */
const normalizePhone = (phoneNum) => {
    if (phoneNum === null || phoneNum === undefined) return undefined;
    const trimmed = String(phoneNum).trim();
    return trimmed === '' ? undefined : trimmed;
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

// Human-readable message per uniquely-indexed field.
const DUPLICATE_FIELD_MESSAGES = {
    phoneNum: 'This mobile number is already registered. Please log in instead.',
    email: 'This email address is already registered. Please log in instead.',
    referralCode: 'This referral code is already in use.',
    rollNo: 'This roll number is already assigned to another student.'
};

/**
 * Convert a MongoDB duplicate-key error (E11000) into a message safe to show a
 * user. The driver's raw text leaks the database name, collection and index
 * ("E11000 duplicate key error collection: test.users index: phoneNum_1 ..."),
 * which is both confusing and an information disclosure.
 *
 * Returns null when `err` is not a duplicate-key error, so callers can fall
 * through to their normal error handling.
 */
const getDuplicateKeyMessage = (err) => {
    if (!err || err.code !== 11000) return null;

    // keyPattern is the reliable source; fall back to parsing the message for
    // errors that crossed a serialization boundary and lost their properties.
    let field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    if (!field && typeof err.message === 'string') {
        const match = err.message.match(/index:\s*([A-Za-z0-9_]+?)_\d+/);
        field = match && match[1];
    }

    return DUPLICATE_FIELD_MESSAGES[field] || 'This account already exists.';
};

module.exports = {
    generateToken,
    hashLoginCode,
    compareLoginCode,
    parseAddress,
    getUserDisplayName,
    normalizePhone,
    getDuplicateKeyMessage
};
