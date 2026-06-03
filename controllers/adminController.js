const mongoose = require('mongoose');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const ProductPurchase = require('../models/ProductPurchase');
const PlanUpgrade = require('../models/PlanUpgrade');
const ExploreProduct = require('../models/ExploreProduct');
const Payment = require('../models/Payment');
const { hashLoginCode, parseAddress } = require('../utils/helpers');
const xlsx = require('xlsx');

/**
 * Add Student (Admin)
 */
const addStudent = async (req, res) => {
    const { name, email, phone, password, parentPhone, standard, medium, stream, state, city, address, schoolName } = req.body;

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
            firstName: name,
            email: email,
            phoneNum: phone,
            loginCodeHash,
            photoPath: req.files?.image?.[0]?.path ? req.files.image[0].path.replace(/\\/g, '/') : undefined,
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

        const ActivityLog = require('../models/ActivityLog');
        const performedBy = req.performedBy || req.query.performedBy || 'Admin App';
        await ActivityLog.create([{
            entityType: 'Student',
            action: 'Added',
            targetName: name,
            performedBy: performedBy
        }], { session });

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
                    email: 1,
                    phone: '$phoneNum',
                    photo: '$photoPath',
                    board: '$profile.board',
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
    const { name, email, phone, password, parentPhone, standard, medium, stream, state, city, address, schoolName } = req.body;

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // 1. Update User
        const userUpdates = {};
        if (name) userUpdates.firstName = name;
        if (phone) userUpdates.phoneNum = phone;
        if (password) userUpdates.loginCodeHash = await hashLoginCode(password);
        if (req.files?.image?.[0]?.path) userUpdates.photoPath = req.files.image[0].path.replace(/\\/g, '/');

        // Address update (partial updates need careful handling if nested, but here we construct full object if any part changes or use dot notation)
        // For simplicity, we'll reconstruct address if any part is provided, merging with existing is better but requires fetch first.
        // Let's assume frontend sends all address components if one is changed or we fetch first.
        // To be safe: Set 'address' field on User if you want to write it. 
        // Better approach for nested: use $set with dot notation or fetch-merge-save.
        // We will do fetch-merge-save for safety.

        const user = await User.findById(id).session(session);
        if (!user) throw new Error('Student not found');

        if (name) user.firstName = name;
        if (email) user.email = email;
        if (phone) user.phoneNum = phone;
        if (password) user.loginCodeHash = await hashLoginCode(password);
        if (req.files?.image?.[0]?.path) user.photoPath = req.files.image[0].path.replace(/\\/g, '/');

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

        const ActivityLog = require('../models/ActivityLog');
        const performedBy = req.performedBy || req.query.performedBy || 'Admin App';
        await ActivityLog.create([{
            entityType: 'Student',
            action: 'Updated',
            targetName: user.firstName,
            performedBy: performedBy
        }], { session });

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

        const user = await User.findById(id).session(session);
        const targetName = user ? user.firstName : 'Unknown';

        // Delete User
        await User.findByIdAndDelete(id).session(session);

        // Delete Profile
        await StudentProfile.findOneAndDelete({ userId: id }).session(session);

        const ActivityLog = require('../models/ActivityLog');
        const performedBy = req.performedBy || req.query.performedBy || 'Admin App';
        await ActivityLog.create([{
            entityType: 'Student',
            action: 'Deleted',
            targetName: targetName,
            performedBy: performedBy
        }], { session });

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



/**
 * Import Students from Excel
 */
const importStudents = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Read Excel File
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        for (const row of data) {
            // Flexible Header Matching
            const name = row['Name'] || row['name'];
            const email = row['Email'] || row['email'];
            const phone = row['Phone Number'] || row['Phone'] || row['phone'];
            const password = row['Password'] || row['password'];
            const parentPhone = row["Parent's Mobile Number"] || row['ParentPhone'] || row['parentPhone'];
            const standard = row['Standard'] || row['standard'];
            const medium = row['Medium'] || row['medium'];
            const stream = row['Stream'] || row['stream'];
            const state = row['State'] || row['state'];
            const city = row['City'] || row['city'];
            const address = row['Address'] || row['address'];
            const schoolName = row['School Name'] || row['SchoolName'] || row['schoolName'];

            if (!name || !phone || !password) {
                results.failed++;
                results.errors.push(`Row missing required fields. Row: ${JSON.stringify(row)}`);
                continue;
            }

            // Check duplicate in this batch or DB
            const existingUser = await User.findOne({ phoneNum: phone }).session(session);
            if (existingUser) {
                results.failed++;
                results.errors.push(`User already exists: ${phone}`);
                continue;
            }

            // Create User
            const loginCodeHash = await hashLoginCode(String(password));
            const user = new User({
                role: 'student',
                firstName: name,
                email: email,
                phoneNum: String(phone),
                loginCodeHash,
                address: {
                    street: address,
                    city: city,
                    state: state
                }
            });
            const savedUser = await user.save({ session });

            // Generate Roll No
            const rollNo = String(phone).substring(6) + Math.floor(Math.random() * 1000);

            // Create Profile
            const studentProfile = new StudentProfile({
                userId: savedUser._id,
                std: standard,
                medium,
                school: schoolName,
                rollNo,
                parentPhone: String(parentPhone),
            });
            await studentProfile.save({ session });

            results.success++;
        }

        await session.commitTransaction();
        res.status(200).json({ message: 'Import processed', results });

    } catch (err) {
        await session.abortTransaction();
        console.error('Import Students Error:', err);
        res.status(500).json({ message: 'Failed to import students', error: err.message });
    } finally {
        session.endSession();
    }
};

/**
 * Get Dashboard Stats (Admin)
 */
const getDashboardStats = async (req, res) => {
    try {
        // Role check: Only super admin can access dashboard stats
        if (req.user.role !== 'super admin') {
            return res.status(403).json({ message: 'Access denied. Super admin only.' });
        }

        // 1. Aggregate Sales by Subject from ProductPurchase
        const subjectStats = await ProductPurchase.aggregate([
            {
                $lookup: {
                    from: 'exploreproducts',
                    localField: 'productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.subject',
                    sales: { $sum: '$amount' }
                }
            },
            {
                $project: {
                    _id: 0,
                    subject: '$_id',
                    sales: 1
                }
            }
        ]);

        // 2. Aggregate Sales by Standard (Registration Fees ONLY, excluding Products)
        const paymentStandardStats = await Payment.aggregate([
            {
                // Join with ProductPurchase to identify product payments
                $lookup: {
                    from: 'productpurchases',
                    localField: 'razorpayPaymentId',
                    foreignField: 'razorpayPaymentId',
                    as: 'purchase'
                }
            },
            {
                // Filter out payments that have a corresponding ProductPurchase entry
                $match: {
                    purchase: { $size: 0 }
                }
            },
            {
                $lookup: {
                    from: 'studentprofiles',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'profile'
                }
            },
            { $unwind: '$profile' },
            {
                $group: {
                    _id: '$profile.std',
                    sales: { $sum: '$amount' }
                }
            }
        ]);

        // 3. Aggregate Plan Upgrades by New Standard
        const upgradeStandardStats = await PlanUpgrade.aggregate([
            {
                $group: {
                    _id: '$newStandard',
                    sales: { $sum: '$amount' }
                }
            }
        ]);

        // Merge Standard Stats (Payments + Upgrades)
        const standardMap = {};
        paymentStandardStats.forEach(item => {
            const std = item._id || 'Unknown';
            standardMap[std] = (standardMap[std] || 0) + item.sales;
        });
        upgradeStandardStats.forEach(item => {
            const std = item._id || 'Unknown';
            standardMap[std] = (standardMap[std] || 0) + item.sales;
        });

        const standardStats = Object.keys(standardMap).map(std => ({
            standard: std,
            sales: standardMap[std]
        }));

        // 4. Calculate Unified Totals
        // 4a. Total from all payments (Registration + Products)
        const totalPaymentAmount = await Payment.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const paymentTotal = totalPaymentAmount.length > 0 ? totalPaymentAmount[0].total : 0;

        // 4b. Total from upgrades
        const totalUpgradeAmount = upgradeStandardStats.reduce((sum, item) => sum + item.sales, 0);

        const totalSales = paymentTotal + totalUpgradeAmount;

        // 5. Calculate Percentages
        const formattedSubjectStats = subjectStats.map(item => ({
            ...item,
            percentage: totalSales > 0 ? item.sales / totalSales : 0
        }));

        const formattedStandardStats = standardStats.map(item => ({
            ...item,
            percentage: totalSales > 0 ? item.sales / totalSales : 0
        }));

        // Sort both
        formattedSubjectStats.sort((a, b) => b.sales - a.sales);
        formattedStandardStats.sort((a, b) => {
            // Sort by numerical standard if possible
            const aNum = parseInt(a.standard);
            const bNum = parseInt(b.standard);
            if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum; // High to low or Low to high? Sales descending is better for dash
            return b.sales - a.sales;
        });

        res.status(200).json({
            totalSales,
            subjectSales: formattedSubjectStats,
            standardSales: formattedStandardStats
        });
    } catch (err) {
        console.error('Get Dashboard Stats Error:', err);
        res.status(500).json({ message: 'Failed to fetch dashboard statistics' });
    }
};

/**
 * Get Exam Reports (Admin)
 */
const getExamReports = async (req, res) => {
    try {
        const { type, board, std, medium, stream, studentId, skip = 0, limit = 10 } = req.query;
        const ExamResult = require('../models/ExamResult');
        const FiveMinTestResult = require('../models/FiveMinTestResult');
        const OneLinerExamResult = require('../models/OneLinerExamResult');

        let models = [];
        if (type === 'REGULAR') {
            models = [{ model: ExamResult, type: 'REGULAR' }];
        } else if (type === 'QUIZ') {
            models = [{ model: FiveMinTestResult, type: 'QUIZ' }];
        } else if (type === 'ONELINER') {
            models = [{ model: OneLinerExamResult, type: 'ONELINER' }];
        } else {
            // Combined
            models = [
                { model: ExamResult, type: 'REGULAR' },
                { model: FiveMinTestResult, type: 'QUIZ' },
                { model: OneLinerExamResult, type: 'ONELINER' }
            ];
        }

        const skipNum = parseInt(skip) || 0;
        const limitNum = parseInt(limit) || 10;

        const matchStage = {};
        if (studentId) matchStage.studentId = new mongoose.Types.ObjectId(studentId);

        let allResults = [];

        for (const item of models) {
            const pipeline = [
                { $match: matchStage },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'studentId',
                        foreignField: '_id',
                        as: 'student'
                    }
                },
                { $unwind: '$student' },
                {
                    $lookup: {
                        from: 'studentprofiles',
                        localField: 'studentId',
                        foreignField: 'userId',
                        as: 'profile'
                    }
                },
                { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } }
            ];

            const profileMatch = {};
            if (board) profileMatch['profile.board'] = board;
            if (std) profileMatch['profile.std'] = std;
            if (medium) profileMatch['profile.medium'] = medium;
            if (stream) profileMatch['profile.stream'] = stream;

            if (Object.keys(profileMatch).length > 0) {
                pipeline.push({ $match: profileMatch });
            }

            pipeline.push({
                $project: {
                    _id: 1,
                    title: 1,
                    obtainedMarks: 1,
                    totalMarks: 1,
                    date: 1,
                    earnedPoints: 1,
                    type: { $ifNull: ['$type', item.type] },
                    studentName: '$student.firstName',
                    studentPhone: '$student.phoneNum',
                    std: '$profile.std',
                    medium: '$profile.medium',
                    board: '$profile.board',
                    stream: '$profile.stream'
                }
            });

            const results = await item.model.aggregate(pipeline);
            allResults.push(...results);
        }

        allResults.sort((a, b) => new Date(b.date) - new Date(a.date));

        const total = allResults.length;
        const paginatedResults = allResults.slice(skipNum, skipNum + limitNum);

        res.status(200).json({
            data: paginatedResults,
            total: total,
            skip: skipNum,
            limit: limitNum
        });
    } catch (err) {
        console.error('Get Exam Reports Error:', err);
        res.status(500).json({ message: 'Failed to fetch exam reports' });
    }
};

/**
 * Get Student-wise Exam Reports (Admin)
 */
const getStudentWiseReports = async (req, res) => {
    try {
        const { board, std, medium, stream, skip = 0, limit = 10 } = req.query;
        const ExamResult = require('../models/ExamResult');
        const FiveMinTestResult = require('../models/FiveMinTestResult');
        const OneLinerExamResult = require('../models/OneLinerExamResult');

        const skipNum = parseInt(skip) || 0;
        const limitNum = parseInt(limit) || 10;

        const models = [
            { model: ExamResult, type: 'REGULAR' },
            { model: FiveMinTestResult, type: 'QUIZ' },
            { model: OneLinerExamResult, type: 'ONELINER' }
        ];

        let allExams = [];

        for (const item of models) {
            const pipeline = [
                {
                    $lookup: {
                        from: 'users',
                        localField: 'studentId',
                        foreignField: '_id',
                        as: 'student'
                    }
                },
                { $unwind: '$student' },
                {
                    $lookup: {
                        from: 'studentprofiles',
                        localField: 'studentId',
                        foreignField: 'userId',
                        as: 'profile'
                    }
                },
                { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } }
            ];

            const profileMatch = {};
            if (board) profileMatch['profile.board'] = board;
            if (std) profileMatch['profile.std'] = std;
            if (medium) profileMatch['profile.medium'] = medium;
            if (stream) profileMatch['profile.stream'] = stream;

            if (Object.keys(profileMatch).length > 0) {
                pipeline.push({ $match: profileMatch });
            }

            pipeline.push({
                $project: {
                    studentId: 1,
                    studentName: '$student.firstName',
                    studentPhone: '$student.phoneNum',
                    std: '$profile.std',
                    medium: '$profile.medium',
                    board: '$profile.board',
                    stream: '$profile.stream',
                    title: 1,
                    obtainedMarks: 1,
                    totalMarks: 1,
                    date: 1,
                    type: { $ifNull: ['$type', item.type] }
                }
            });

            const results = await item.model.aggregate(pipeline);
            allExams.push(...results);
        }

        // Group by Student
        const grouped = {};
        allExams.forEach(ex => {
            const sid = ex.studentId.toString();
            if (!grouped[sid]) {
                grouped[sid] = {
                    _id: ex.studentId,
                    name: ex.studentName,
                    phone: ex.studentPhone,
                    std: ex.std,
                    medium: ex.medium,
                    board: ex.board,
                    stream: ex.stream,
                    totalExams: 0,
                    totalObtained: 0,
                    exams: []
                };
            }
            grouped[sid].totalExams++;
            grouped[sid].totalObtained += (ex.obtainedMarks || 0);
            grouped[sid].exams.push({
                title: ex.title,
                score: ex.obtainedMarks,
                total: ex.totalMarks,
                date: ex.date,
                type: ex.type
            });
        });

        const finalResults = Object.values(grouped).map(g => {
            g.avgMarks = g.totalExams > 0 ? g.totalObtained / g.totalExams : 0;
            g.exams.sort((a, b) => new Date(b.date) - new Date(a.date));
            return g;
        }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const total = finalResults.length;
        const paginatedResults = finalResults.slice(skipNum, skipNum + limitNum);

        res.status(200).json({
            data: paginatedResults,
            total: total,
            skip: skipNum,
            limit: limitNum
        });
    } catch (err) {
        console.error('Get Student Wise Reports Error:', err);
        res.status(500).json({ message: 'Failed to fetch student wise reports' });
    }
};

/**
 * Get Detailed Stats for a Specific Standard (Admin)
 */
const getStandardDetailedStats = async (req, res) => {
    try {
        const { standard } = req.params;

        // 1. Board-wise Collection
        const boardStats = await Payment.aggregate([
            {
                $lookup: {
                    from: 'productpurchases',
                    localField: 'razorpayPaymentId',
                    foreignField: 'razorpayPaymentId',
                    as: 'purchase'
                }
            },
            { $match: { purchase: { $size: 0 } } },
            {
                $lookup: {
                    from: 'studentprofiles',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'profile'
                }
            },
            { $unwind: '$profile' },
            { $match: { 'profile.std': standard } },
            {
                $group: {
                    _id: '$profile.board',
                    sales: { $sum: '$amount' }
                }
            }
        ]);

        // 2. Stream-wise Collection
        const streamStats = await Payment.aggregate([
            {
                $lookup: {
                    from: 'productpurchases',
                    localField: 'razorpayPaymentId',
                    foreignField: 'razorpayPaymentId',
                    as: 'purchase'
                }
            },
            { $match: { purchase: { $size: 0 } } },
            {
                $lookup: {
                    from: 'studentprofiles',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'profile'
                }
            },
            { $unwind: '$profile' },
            { $match: { 'profile.std': standard } },
            {
                $group: {
                    _id: '$profile.stream',
                    sales: { $sum: '$amount' }
                }
            }
        ]);

        // 3. Medium-wise Collection
        const mediumStats = await Payment.aggregate([
            {
                $lookup: {
                    from: 'productpurchases',
                    localField: 'razorpayPaymentId',
                    foreignField: 'razorpayPaymentId',
                    as: 'purchase'
                }
            },
            { $match: { purchase: { $size: 0 } } },
            {
                $lookup: {
                    from: 'studentprofiles',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'profile'
                }
            },
            { $unwind: '$profile' },
            { $match: { 'profile.std': standard } },
            {
                $group: {
                    _id: '$profile.medium',
                    sales: { $sum: { $ifNull: ['$amount', 0] } }
                }
            }
        ]);

        // 4. Student-wise Collection
        const studentStats = await Payment.aggregate([
            {
                $lookup: {
                    from: 'productpurchases',
                    localField: 'razorpayPaymentId',
                    foreignField: 'razorpayPaymentId',
                    as: 'purchase'
                }
            },
            { $match: { purchase: { $size: 0 } } },
            {
                $lookup: {
                    from: 'studentprofiles',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'profile'
                }
            },
            { $unwind: '$profile' },
            { $match: { 'profile.std': standard } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $group: {
                    _id: '$userId',
                    name: { $first: '$user.firstName' },
                    phone: { $first: '$user.phoneNum' },
                    amount: { $sum: '$amount' },
                    board: { $first: '$profile.board' },
                    medium: { $first: '$profile.medium' },
                    stream: { $first: '$profile.stream' }
                }
            }
        ]);

        // 5. Plan Upgrades
        const upgrades = await PlanUpgrade.aggregate([
            { $match: { newStandard: standard } },
            {
                $lookup: {
                    from: 'studentprofiles',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'profile'
                }
            },
            { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    userId: 1,
                    amount: 1,
                    board: { $ifNull: ['$profile.board', 'Unknown'] },
                    medium: '$medium',
                    stream: '$stream',
                    userName: '$user.firstName',
                    userPhone: '$user.phoneNum'
                }
            }
        ]);

        // Merge Upgrades into Board, Stream, Medium, and Student collections
        const mergedBoard = {}; boardStats.forEach(b => mergedBoard[b._id || 'Unknown'] = (mergedBoard[b._id || 'Unknown'] || 0) + b.sales);
        const mergedStream = {}; streamStats.forEach(s => mergedStream[s._id || 'None'] = (mergedStream[s._id || 'None'] || 0) + s.sales);
        const mergedMedium = {}; mediumStats.forEach(m => mergedMedium[m._id || 'Unknown'] = (mergedMedium[m._id || 'Unknown'] || 0) + m.sales);
        const mergedStudents = {}; studentStats.forEach(s => mergedStudents[s._id] = s);

        upgrades.forEach(u => {
            const b = u.board || 'Unknown';
            const s = u.stream || 'None';
            const m = u.medium || 'Unknown';

            mergedBoard[b] = (mergedBoard[b] || 0) + u.amount;
            mergedStream[s] = (mergedStream[s] || 0) + u.amount;
            mergedMedium[m] = (mergedMedium[m] || 0) + u.amount;

            if (mergedStudents[u.userId]) {
                mergedStudents[u.userId].amount += u.amount;
            } else {
                mergedStudents[u.userId] = {
                    _id: u.userId,
                    name: u.userName,
                    phone: u.userPhone,
                    amount: u.amount,
                    board: b,
                    medium: m,
                    stream: s
                };
            }
        });

        res.status(200).json({
            boardStats: Object.keys(mergedBoard).map(k => ({ board: k, sales: mergedBoard[k] })),
            streamStats: Object.keys(mergedStream).map(k => ({ stream: k, sales: mergedStream[k] })),
            mediumStats: Object.keys(mergedMedium).map(k => ({ medium: k, sales: mergedMedium[k] })),
            studentStats: Object.values(mergedStudents).sort((a, b) => b.amount - a.amount)
        });

    } catch (err) {
        console.error('Get Standard Detailed Stats Error:', err);
        res.status(500).json({ message: 'Failed to fetch detailed statistics' });
    }
};

/**
 * Get Refer & Earn Reports (Admin)
 */
const getReferEarnReport = async (req, res) => {
    try {
        const { board, std, medium, stream } = req.query;

        const pipeline = [
            { $match: { invitedFriends: { $exists: true, $not: { $size: 0 } } } },
            { $unwind: { path: '$invitedFriends', includeArrayIndex: 'refIndex' } },
            {
                $lookup: {
                    from: 'studentprofiles',
                    localField: '_id',
                    foreignField: 'userId',
                    as: 'profile'
                }
            },
            { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } }
        ];

        const profileMatch = {};
        if (board) profileMatch['profile.board'] = board;
        if (std) profileMatch['profile.std'] = std;
        if (medium) profileMatch['profile.medium'] = medium;
        if (stream) profileMatch['profile.stream'] = stream;

        if (Object.keys(profileMatch).length > 0) {
            pipeline.push({ $match: profileMatch });
        }

        pipeline.push({
            $project: {
                _id: 1,
                referrer: '$firstName',
                referred: '$invitedFriends.name',
                date: { $dateToString: { format: "%Y-%m-%d", date: "$invitedFriends.joinedAt" } },
                points: { $multiply: [{ $add: ['$refIndex', 1] }, 500] }
            }
        });

        const results = await User.aggregate(pipeline);
        res.status(200).json(results);
    } catch (err) {
        console.error('Get Refer & Earn Report Error:', err);
        res.status(500).json({ message: 'Failed to fetch refer & earn report' });
    }
};

/**
 * Get Upgrade Plan Reports (Admin)
 */
const getUpgradePlanReport = async (req, res) => {
    try {
        const { board, std, medium, stream } = req.query;

        const pipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $lookup: {
                    from: 'studentprofiles',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'profile'
                }
            },
            { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } }
        ];

        const profileMatch = {};
        if (board) profileMatch['profile.board'] = board;
        if (std) profileMatch['profile.std'] = std;
        if (medium) profileMatch['profile.medium'] = medium;
        if (stream) profileMatch['profile.stream'] = stream;

        if (Object.keys(profileMatch).length > 0) {
            pipeline.push({ $match: profileMatch });
        }

        pipeline.push({
            $project: {
                _id: 1,
                student: '$user.firstName',
                plan: '$newStandard',
                date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                amount: { $concat: ['₹', { $toString: '$amount' }] }
            }
        });

        const results = await PlanUpgrade.aggregate(pipeline);
        res.status(200).json(results);
    } catch (err) {
        console.error('Get Upgrade Plan Report Error:', err);
        res.status(500).json({ message: 'Failed to fetch upgrade plan report' });
    }
};

/**
 * Generate Redeem Code (Admin)
 */
const generateRedeemCode = async (req, res) => {
    try {
        const { discount, board, std, medium, stream, createdBy } = req.body;
        const RedeemCode = require('../models/RedeemCode');

        if (!discount || !createdBy) {
            return res.status(400).json({ message: 'Discount and Creator are required' });
        }

        // Generate a random 8-character unique alphanumeric code
        let code;
        let isUnique = false;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        
        while (!isUnique) {
            code = '';
            for (let i = 0; i < 8; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const existing = await RedeemCode.findOne({ code });
            if (!existing) isUnique = true;
        }

        const redeemCode = new RedeemCode({
            code,
            discount,
            board,
            std,
            medium,
            stream,
            createdBy
        });

        await redeemCode.save();
        res.status(201).json(redeemCode);
    } catch (err) {
        console.error('Generate Redeem Code Error:', err);
        res.status(500).json({ message: 'Failed to generate redeem code' });
    }
};

/**
 * Get All Redeem Codes (Admin)
 */
const getRedeemCodes = async (req, res) => {
    try {
        const RedeemCode = require('../models/RedeemCode');
        const codes = await RedeemCode.find().sort({ createdAt: -1 });
        res.status(200).json(codes);
    } catch (err) {
        console.error('Get Redeem Codes Error:', err);
        res.status(500).json({ message: 'Failed to fetch redeem codes' });
    }
};

/**
 * Delete Redeem Code (Admin)
 */
const deleteRedeemCode = async (req, res) => {
    try {
        const { id } = req.params;
        const RedeemCode = require('../models/RedeemCode');
        const code = await RedeemCode.findById(id);
        
        if (!code) return res.status(404).json({ message: 'Code not found' });
        if (code.used) return res.status(400).json({ message: 'Cannot delete a used code' });

        await RedeemCode.findByIdAndDelete(id);
        res.status(200).json({ message: 'Code deleted successfully' });
    } catch (err) {
        console.error('Delete Redeem Code Error:', err);
        res.status(500).json({ message: 'Failed to delete redeem code' });
    }
};

/**
 * Get Admin Leaderboard (Top 5)
 */
const getAdminLeaderboard = async (req, res) => {
    try {
        const { board, std, medium, stream } = req.query;

        const matchStage = {};
        if (board) matchStage.board = board;
        if (std) matchStage.std = std;
        if (medium) matchStage.medium = medium;
        if (stream && stream !== 'None') matchStage.stream = stream;

        const leaderboard = await StudentProfile.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'userData'
                }
            },
            { $unwind: '$userData' },
            {
                $project: {
                    _id: '$userData._id',
                    name: '$userData.firstName',
                    points: {
                        $add: [
                            { $ifNull: ['$totalRewardPoints', 0] },
                            { $ifNull: ['$userData.bonusPoints', 0] }
                        ]
                    },
                    avatar: '$userData.photoPath',
                    isGifted: { $ifNull: ['$isGifted', false] }
                }
            },
            { $sort: { points: -1 } },
            { $limit: 5 }
        ]);

        res.status(200).json(leaderboard);
    } catch (err) {
        console.error('Get Admin Leaderboard Error:', err);
        res.status(500).json({ message: 'Failed to fetch leaderboard' });
    }
};

/**
 * Toggle Student Gift Status
 */
const toggleStudentGiftStatus = async (req, res) => {
    try {
        const { userId } = req.body;
        const profile = await StudentProfile.findOne({ userId });
        if (!profile) return res.status(404).json({ message: 'Student profile not found' });

        profile.isGifted = !profile.isGifted;
        await profile.save();

        res.status(200).json({ message: 'Gift status updated', isGifted: profile.isGifted });
    } catch (err) {
        console.error('Toggle Gift Status Error:', err);
        res.status(500).json({ message: 'Failed to update gift status' });
    }
};

module.exports = {
    addStudent,
    getAllStudents,
    editStudent,
    deleteStudent,
    importStudents,
    getDashboardStats,
    getStandardDetailedStats,
    getExamReports,
    getStudentWiseReports,
    getReferEarnReport,
    getUpgradePlanReport,
    generateRedeemCode,
    getRedeemCodes,
    deleteRedeemCode,
    getAdminLeaderboard,
    toggleStudentGiftStatus
};
