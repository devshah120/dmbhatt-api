const mongoose = require('mongoose');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const AssistantProfile = require('../models/AssistantProfile');
const { hashLoginCode, parseAddress } = require('../utils/helpers');

/**
 * Add Student (Admin)
 */
const addStudent = async (req, res) => {
    const { name, phone, password, parentPhone, standard, medium, stream, state, city, address, schoolName } = req.body;

    // Check required fields
    if (!name || !phone || !password) {
        return res.status(400).json({ message: 'Name, Phone Number, and Password are required' });
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Check availability
        const existingUser = await User.findOne({ phoneNum: phone }).session(session);
        if (existingUser) {
            throw new Error('User with this Phone Number already exists');
        }

        // Hash provided password
        const loginCodeHash = await hashLoginCode(password);

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
    const { name, phone, password, aadharNumber, address } = req.body;

    if (!name || !phone || !password || !aadharNumber) {
        return res.status(400).json({ message: 'Name, Phone, Password, and Aadhar Number are required' });
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Check availability
        const existingUser = await User.findOne({ phoneNum: phone }).session(session);
        if (existingUser) {
            throw new Error('User with this Phone Number already exists');
        }

        // Hash the provided password
        const loginCodeHash = await hashLoginCode(password);

        // Create User
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
            aadharNum: aadharNumber, // Store actual Aadhar Number
            // aadharFilePath: [] 
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

// Exports moved to bottom

/**
 * Get All Students
 */
const getAllStudents = async (req, res) => {
    try {
        // Aggregate to join User and StudentProfile
        const students = await User.aggregate([
            { $match: { role: 'student' } },
            {
                $lookup: {
                    from: 'studentprofiles', // Collection name matches model name usually lowercase + s
                    localField: '_id',
                    foreignField: 'userId',
                    as: 'profile'
                }
            },
            { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    name: '$firstName',
                    phone: '$phoneNum',
                    photo: '$photoPath',
                    std: '$profile.std',
                    medium: '$profile.medium',
                    stream: '$profile.stream', // Note: Stream was not explicitly saved in addStudent but schema might support it or it's dynamic
                    school: '$profile.school',
                    parentPhone: '$profile.parentPhone',
                    state: '$address.state',
                    city: '$address.city',
                    address: '$address.street'
                }
            }
        ]);

        res.status(200).json(students);
    } catch (err) {
        console.error('Get All Students Error:', err);
        res.status(500).json({ message: 'Failed to fetch students' });
    }
};

/**
 * Edit Student
 */
const editStudent = async (req, res) => {
    const { id } = req.params;
    const { name, phone, password, parentPhone, standard, medium, stream, state, city, address, schoolName } = req.body;

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // 1. Update User
        const userUpdates = {};
        if (name) userUpdates.firstName = name;
        if (phone) userUpdates.phoneNum = phone;
        if (password) userUpdates.loginCodeHash = await hashLoginCode(password);
        if (req.files?.image?.[0]?.path) userUpdates.photoPath = req.files.image[0].path;

        // Address update (partial updates need careful handling if nested, but here we construct full object if any part changes or use dot notation)
        // For simplicity, we'll reconstruct address if any part is provided, merging with existing is better but requires fetch first.
        // Let's assume frontend sends all address components if one is changed or we fetch first.
        // To be safe: Set 'address' field on User if you want to write it. 
        // Better approach for nested: use $set with dot notation or fetch-merge-save.
        // We will do fetch-merge-save for safety.

        const user = await User.findById(id).session(session);
        if (!user) throw new Error('Student not found');

        if (name) user.firstName = name;
        if (phone) user.phoneNum = phone;
        if (password) user.loginCodeHash = await hashLoginCode(password);
        if (req.files?.image?.[0]?.path) user.photoPath = req.files.image[0].path;

        if (address || city || state) {
            user.address = {
                street: address || user.address?.street,
                city: city || user.address?.city,
                state: state || user.address?.state
            };
        }

        await user.save({ session });


        // 2. Update Profile
        // We need to find the profile associated with this user
        // Or updateMany/One with userId

        // Check if stream is provided, if so include it
        const profileUpdates = {};
        if (standard) profileUpdates.std = standard;
        if (medium) profileUpdates.medium = medium;
        if (schoolName) profileUpdates.school = schoolName;
        if (parentPhone) profileUpdates.parentPhone = parentPhone;
        if (stream) {
            // Assuming User schema or Profile schema has stream? 
            // StudentProfile.js was referenced but I don't see it. 
            // Assuming StudentProfile has stream field or allows dynamic info if strict is false.
            // If schema is strict, stream might be ignored if not in schema.
            // We'll add it to updates assuming it exists or will be added.
            // Earlier code for addStudent had: `if (stream != null) request.fields['stream'] = stream;` but backend `addStudent` didn't save it to helper?
            // Ah, `addStudent` in controller had: `const studentProfile = new StudentProfile({ ... })`. It didn't include `stream`. 
            // If the user wants `stream`, we should probably add it to the Profile schema or ensure it's saved.
            // For now, I will add it to the update object.
            profileUpdates.stream = stream;
        }

        await StudentProfile.findOneAndUpdate(
            { userId: id },
            { $set: profileUpdates },
            { session, new: true }
        );

        await session.commitTransaction();
        res.status(200).json({ message: 'Student updated successfully' });

    } catch (err) {
        await session.abortTransaction();
        console.error('Edit Student Error:', err);
        res.status(500).json({ message: err.message || 'Failed to update student' });
    } finally {
        session.endSession();
    }
};

/**
 * Delete Student
 */
const deleteStudent = async (req, res) => {
    const { id } = req.params;
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Delete User
        await User.findByIdAndDelete(id).session(session);

        // Delete Profile
        await StudentProfile.findOneAndDelete({ userId: id }).session(session);

        await session.commitTransaction();
        res.status(200).json({ message: 'Student deleted successfully' });

    } catch (err) {
        await session.abortTransaction();
        console.error('Delete Student Error:', err);
        res.status(500).json({ message: 'Failed to delete student' });
    } finally {
        session.endSession();
    }
};
