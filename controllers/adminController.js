const mongoose = require('mongoose');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const AssistantProfile = require('../models/AssistantProfile');
const { hashLoginCode, parseAddress } = require('../utils/helpers');

/**
 * Add Student (Admin)
 */
const addStudent = async (req, res) => {
    const { name, phone, parentPhone, standard, medium, stream, state, city, address, schoolName } = req.body;

    // Check required fields
    if (!name || !phone) {
        return res.status(400).json({ message: 'Name and Phone Number are required' });
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Check availability
        const existingUser = await User.findOne({ phoneNum: phone }).session(session);
        if (existingUser) {
            throw new Error('User with this Phone Number already exists');
        }

        // Generate default login code (same as phone number)
        const loginCodeHash = await hashLoginCode(phone);

        // Create User
        const user = new User({
            role: 'student',
            firstName: name, // Store full name in firstName for now usually
            phoneNum: phone,
            loginCodeHash,
            photoPath: req.files?.image?.[0]?.path,
            address: {
                street: address,
                city: city,
                state: state
            }
        });
        const savedUser = await user.save({ session });

        // Generate Roll No (Random specific logic or sequential)
        // For now, using last 4 digits of phone + random
        const rollNo = phone.substring(6) + Math.floor(Math.random() * 1000);

        // Create Profile
        const studentProfile = new StudentProfile({
            userId: savedUser._id,
            std: standard,
            medium,
            school: schoolName,
            rollNo,
            parentPhone,
            // Stream is not in schema but if needed we can add it or ignore
        });
        await studentProfile.save({ session });

        await session.commitTransaction();
        res.status(201).json({ message: 'Student added successfully', studentId: savedUser._id });

    } catch (err) {
        await session.abortTransaction();
        console.error('Add Student Error:', err);
        res.status(500).json({ message: err.message || 'Failed to add student' });
    } finally {
        session.endSession();
    }
};

/**
 * Add Assistant (Admin)
 */
const addAssistant = async (req, res) => {
    const { name, phone, aadharName, address } = req.body;

    if (!name || !phone) {
        return res.status(400).json({ message: 'Name and Phone Number are required' });
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Check availability
        const existingUser = await User.findOne({ phoneNum: phone }).session(session);
        if (existingUser) {
            throw new Error('User with this Phone Number already exists');
        }

        // Generate default login code (same as phone number)
        const loginCodeHash = await hashLoginCode(phone);

        // Create User
        // Assistant address comes as a string usually, we can store in street or parse
        const user = new User({
            role: 'assistant',
            firstName: name,
            phoneNum: phone,
            loginCodeHash,
            address: { street: address }
        });
        const savedUser = await user.save({ session });

        // Create Profile
        const assistantProfile = new AssistantProfile({
            userId: savedUser._id,
            aadharNum: aadharName || 'N/A', // Using aadharName as ID/Num
            // aadharFilePath: [] // Optional now
        });
        await assistantProfile.save({ session });

        await session.commitTransaction();
        res.status(201).json({ message: 'Assistant added successfully', assistantId: savedUser._id });

    } catch (err) {
        await session.abortTransaction();
        console.error('Add Assistant Error:', err);
        res.status(500).json({ message: err.message || 'Failed to add assistant' });
    } finally {
        session.endSession();
    }
};

module.exports = {
    addStudent,
    addAssistant
};
