const RedeemCode = require('../models/RedeemCode');
const StudentProfile = require('../models/StudentProfile');
// const Student = require('../models/Student'); // Assuming Student model is needed based on the change

/**
 * Validate Redeem Code (Student)
 */
exports.validateRedeemCode = async (req, res) => {
    try {
        const { code: codeString, targetBoard, targetStd, targetMedium, targetStream } = req.body;
        // const studentId = req.user.id; // This line is removed as req.user._id is used directly

        if (!codeString) {
            return res.status(400).json({ message: 'Redeem code is required' });
        }

        const code = await RedeemCode.findOne({ code: codeString.toUpperCase() });

        if (!code) {
            return res.status(404).json({ message: 'Invalid redeem code' });
        }

        if (code.isRevoked()) {
            return res.status(400).json({ message: 'This redeem code is no longer valid' });
        }

        if (code.isExhausted()) {
            return res.status(400).json({ message: 'This redeem code has already been used' });
        }

        if (code.isExpired()) {
            return res.status(400).json({ message: 'This redeem code has expired' });
        }

        // Fetch student profile to check eligibility
        const student = await StudentProfile.findOne({ userId: req.user._id });
        if (!student) {
            return res.status(404).json({ message: 'Student profile not found' });
        }

        // Use provided target criteria (for upgrades) or fall back to student profile
        const board = targetBoard || student.board;
        const std = targetStd || student.std; // Changed from profile.std to student.std
        const medium = targetMedium || student.medium;
        const stream = targetStream || student.stream;

        // Check if code is restricted by criteria
        if (code.board && code.board !== board) {
            return res.status(400).json({ message: `This code is only valid for ${code.board} board` });
        }
        if (code.std && code.std !== std) {
            return res.status(400).json({ message: `This code is only valid for standard ${code.std}` });
        }
        if (code.medium && code.medium !== medium) {
            return res.status(400).json({ message: `This code is only valid for ${code.medium} medium` });
        }
        // Specific stream check condition
        if (code.stream && code.stream !== stream && (code.std === '11' || code.std === '12')) {
            // The provided snippet had a nested if, but it seems redundant if the outer condition already checks code.stream && code.stream !== stream
            // Replicating the exact structure from the instruction, which implies the inner if is always true if the outer is.
            // If the intent was different, this might need adjustment.
            if (code.stream && code.stream !== stream) {
                return res.status(400).json({ message: `This code is only valid for ${code.stream} stream` });
            }
        } else if (code.stream && code.stream !== stream) { // This handles cases where std is not 11 or 12 but stream still needs to match
             return res.status(400).json({ message: `This code is only valid for ${code.stream} stream` });
        }


        const discountType = code.discountType === 'flat' ? 'flat' : 'percentage';
        const discountLabel = discountType === 'flat'
            ? `₹${code.discount}`
            : `${code.discount}%`;

        res.status(200).json({
            valid: true,
            discount: code.discount,
            discountType,
            message: `Success! You get a ${discountLabel} discount.`
        });

    } catch (error) {
        console.error('Validate Redeem Code Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
