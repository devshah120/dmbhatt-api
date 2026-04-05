const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Check if session is active in database
            const Session = require('../models/Session');
            const session = await Session.findOne({ token, isActive: true });

            if (!session) {
                return res.status(401).json({ message: 'Session expired or logged out' });
            }

            // Get user from the token
            req.user = await User.findById(decoded.userId).select('-loginCodeHash');

            if (!req.user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            return next();
        } catch (error) {
            console.error(error);
            return res.status(401).json({ message: 'Not authorized' });
        }
    }

    // Check for Guest Token
    const guestTokenHeader = req.headers['x-guest-token'];
    if (guestTokenHeader === 'DMBHATT_GUEST_ACCESS_TOKEN_2024') {
        req.user = {
            _id: '000000000000000000000000', // Mock ObjectId
            role: 'guest',
            firstName: 'Guest',
            lastName: 'User',
            phoneNum: 'Guest'
        };
        return next();
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

// Optional auth - populates req.user if token present, but doesn't block
const optionalProtect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const Session = require('../models/Session');
            const session = await Session.findOne({ token, isActive: true });
            if (session) {
                req.user = await User.findById(decoded.userId).select('-loginCodeHash');
            }
        } catch (error) {
            // Token invalid - continue without user
        }
    }

    next();
};

module.exports = { protect, optionalProtect };
