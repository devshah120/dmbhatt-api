const mongoose = require('mongoose');
const Standard = require('../models/Standard');
const Subject = require('../models/Subject');
const Chapter = require('../models/Chapter');
const Payment = require('../models/Payment');
const ProductPurchase = require('../models/ProductPurchase');
const PlanUpgrade = require('../models/PlanUpgrade');
const User = require('../models/User');

// ==========================================
//  STUDENTS CRUD
// ==========================================

const getStudents = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const StudentProfile = require('../models/StudentProfile');
        const [students, total] = await Promise.all([
            StudentProfile.aggregate([
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
                        _id: 1,
                        userId: 1,
                        firstName: '$user.firstName',
                        lastName: '$user.lastName',
                        email: '$user.email',
                        phoneNum: '$user.phoneNum',
                        std: 1,
                        medium: 1,
                        stream: 1,
                        totalRewardPoints: 1,
                        createdAt: 1
                    }
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit }
            ]),
            StudentProfile.countDocuments()
        ]);

        res.status(200).json({ students, total, page, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('Get Students Error:', err);
        res.status(500).json({ message: 'Failed to fetch students' });
    }
};

// ==========================================
//  STANDARDS CRUD
// ==========================================

const getStandards = async (req, res) => {
    try {
        const standards = await Standard.find().sort({ displayOrder: 1, name: 1 });
        res.status(200).json(standards);
    } catch (err) {
        console.error('Get Standards Error:', err);
        res.status(500).json({ message: 'Failed to fetch standards' });
    }
};

const createStandard = async (req, res) => {
    try {
        const { name, displayOrder } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Standard name is required' });
        }
        const existing = await Standard.findOne({ name: name.trim() });
        if (existing) {
            return res.status(400).json({ message: 'Standard with this name already exists' });
        }
        const standard = new Standard({ name: name.trim(), displayOrder: displayOrder || 0 });
        await standard.save();
        res.status(201).json({ message: 'Standard created successfully', standard });
    } catch (err) {
        console.error('Create Standard Error:', err);
        res.status(500).json({ message: err.message || 'Failed to create standard' });
    }
};

const updateStandard = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, displayOrder, isActive } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (displayOrder !== undefined) updates.displayOrder = displayOrder;
        if (isActive !== undefined) updates.isActive = isActive;

        const standard = await Standard.findByIdAndUpdate(id, { $set: updates }, { new: true });
        if (!standard) {
            return res.status(404).json({ message: 'Standard not found' });
        }
        res.status(200).json({ message: 'Standard updated successfully', standard });
    } catch (err) {
        console.error('Update Standard Error:', err);
        res.status(500).json({ message: err.message || 'Failed to update standard' });
    }
};

const deleteStandard = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const { id } = req.params;

        // Find subjects under this standard to cascade-delete chapters
        const subjects = await Subject.find({ standardId: id }).session(session);
        const subjectIds = subjects.map(s => s._id);

        // Delete chapters under those subjects
        await Chapter.deleteMany({ subjectId: { $in: subjectIds } }).session(session);
        // Delete subjects
        await Subject.deleteMany({ standardId: id }).session(session);
        // Delete standard
        const deleted = await Standard.findByIdAndDelete(id).session(session);
        if (!deleted) {
            throw new Error('Standard not found');
        }

        await session.commitTransaction();
        res.status(200).json({ message: 'Standard and related data deleted successfully' });
    } catch (err) {
        await session.abortTransaction();
        console.error('Delete Standard Error:', err);
        res.status(500).json({ message: err.message || 'Failed to delete standard' });
    } finally {
        session.endSession();
    }
};

// ==========================================
//  SUBJECTS CRUD
// ==========================================

const getSubjects = async (req, res) => {
    try {
        const filter = {};
        if (req.query.standardId) {
            filter.standardId = req.query.standardId;
        }
        const subjects = await Subject.find(filter)
            .populate('standardId', 'name')
            .sort({ name: 1 });
        res.status(200).json(subjects);
    } catch (err) {
        console.error('Get Subjects Error:', err);
        res.status(500).json({ message: 'Failed to fetch subjects' });
    }
};

const createSubject = async (req, res) => {
    try {
        const { name, standardId } = req.body;
        if (!name || !standardId) {
            return res.status(400).json({ message: 'Subject name and standardId are required' });
        }
        // Verify standard exists
        const standard = await Standard.findById(standardId);
        if (!standard) {
            return res.status(404).json({ message: 'Standard not found' });
        }
        const subject = new Subject({ name: name.trim(), standardId });
        await subject.save();
        const populated = await subject.populate('standardId', 'name');
        res.status(201).json({ message: 'Subject created successfully', subject: populated });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'This subject already exists for the selected standard' });
        }
        console.error('Create Subject Error:', err);
        res.status(500).json({ message: err.message || 'Failed to create subject' });
    }
};

const updateSubject = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, standardId, isActive } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (standardId !== undefined) updates.standardId = standardId;
        if (isActive !== undefined) updates.isActive = isActive;

        const subject = await Subject.findByIdAndUpdate(id, { $set: updates }, { new: true })
            .populate('standardId', 'name');
        if (!subject) {
            return res.status(404).json({ message: 'Subject not found' });
        }
        res.status(200).json({ message: 'Subject updated successfully', subject });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'This subject already exists for the selected standard' });
        }
        console.error('Update Subject Error:', err);
        res.status(500).json({ message: err.message || 'Failed to update subject' });
    }
};

const deleteSubject = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const { id } = req.params;

        // Cascade-delete chapters under this subject
        await Chapter.deleteMany({ subjectId: id }).session(session);
        const deleted = await Subject.findByIdAndDelete(id).session(session);
        if (!deleted) {
            throw new Error('Subject not found');
        }

        await session.commitTransaction();
        res.status(200).json({ message: 'Subject and related chapters deleted successfully' });
    } catch (err) {
        await session.abortTransaction();
        console.error('Delete Subject Error:', err);
        res.status(500).json({ message: err.message || 'Failed to delete subject' });
    } finally {
        session.endSession();
    }
};

// ==========================================
//  CHAPTERS CRUD
// ==========================================

const getChapters = async (req, res) => {
    try {
        const filter = {};
        if (req.query.subjectId) {
            filter.subjectId = req.query.subjectId;
        }
        const chapters = await Chapter.find(filter)
            .populate({
                path: 'subjectId',
                select: 'name standardId',
                populate: { path: 'standardId', select: 'name' }
            })
            .sort({ unitNo: 1 });
        res.status(200).json(chapters);
    } catch (err) {
        console.error('Get Chapters Error:', err);
        res.status(500).json({ message: 'Failed to fetch chapters' });
    }
};

const createChapter = async (req, res) => {
    try {
        const { unitNo, name, subjectId } = req.body;
        if (!unitNo || !name || !subjectId) {
            return res.status(400).json({ message: 'Unit number, name, and subjectId are required' });
        }
        // Verify subject exists
        const subject = await Subject.findById(subjectId);
        if (!subject) {
            return res.status(404).json({ message: 'Subject not found' });
        }
        const chapter = new Chapter({ unitNo, name: name.trim(), subjectId });
        await chapter.save();
        const populated = await chapter.populate({
            path: 'subjectId',
            select: 'name standardId',
            populate: { path: 'standardId', select: 'name' }
        });
        res.status(201).json({ message: 'Chapter created successfully', chapter: populated });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'This unit number already exists for the selected subject' });
        }
        console.error('Create Chapter Error:', err);
        res.status(500).json({ message: err.message || 'Failed to create chapter' });
    }
};

const updateChapter = async (req, res) => {
    try {
        const { id } = req.params;
        const { unitNo, name, subjectId, isActive } = req.body;
        const updates = {};
        if (unitNo !== undefined) updates.unitNo = unitNo;
        if (name !== undefined) updates.name = name.trim();
        if (subjectId !== undefined) updates.subjectId = subjectId;
        if (isActive !== undefined) updates.isActive = isActive;

        const chapter = await Chapter.findByIdAndUpdate(id, { $set: updates }, { new: true })
            .populate({
                path: 'subjectId',
                select: 'name standardId',
                populate: { path: 'standardId', select: 'name' }
            });
        if (!chapter) {
            return res.status(404).json({ message: 'Chapter not found' });
        }
        res.status(200).json({ message: 'Chapter updated successfully', chapter });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'This unit number already exists for the selected subject' });
        }
        console.error('Update Chapter Error:', err);
        res.status(500).json({ message: err.message || 'Failed to update chapter' });
    }
};

const deleteChapter = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Chapter.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ message: 'Chapter not found' });
        }
        res.status(200).json({ message: 'Chapter deleted successfully' });
    } catch (err) {
        console.error('Delete Chapter Error:', err);
        res.status(500).json({ message: 'Failed to delete chapter' });
    }
};

// ==========================================
//  PAYMENT VIEWS
// ==========================================

const getPayments = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [payments, total] = await Promise.all([
            Payment.aggregate([
                {
                    $lookup: {
                        from: 'users',
                        localField: 'userId',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
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
                    $project: {
                        _id: 1,
                        amount: 1,
                        currency: 1,
                        status: 1,
                        razorpayOrderId: 1,
                        razorpayPaymentId: 1,
                        createdAt: 1,
                        studentName: '$user.firstName',
                        studentPhone: '$user.phoneNum',
                        standard: '$profile.std',
                        medium: '$profile.medium'
                    }
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit }
            ]),
            Payment.countDocuments()
        ]);

        res.status(200).json({ payments, total, page, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('Get Payments Error:', err);
        res.status(500).json({ message: 'Failed to fetch payments' });
    }
};

const getProductPurchases = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [purchases, total] = await Promise.all([
            ProductPurchase.aggregate([
                {
                    $lookup: {
                        from: 'users',
                        localField: 'userId',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'exploreproducts',
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        amount: 1,
                        razorpayOrderId: 1,
                        razorpayPaymentId: 1,
                        createdAt: 1,
                        studentName: '$user.firstName',
                        studentPhone: '$user.phoneNum',
                        productName: '$product.name',
                        productCategory: '$product.category'
                    }
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit }
            ]),
            ProductPurchase.countDocuments()
        ]);

        res.status(200).json({ purchases, total, page, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('Get Product Purchases Error:', err);
        res.status(500).json({ message: 'Failed to fetch product purchases' });
    }
};

const getPlanUpgrades = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [upgrades, total] = await Promise.all([
            PlanUpgrade.aggregate([
                {
                    $lookup: {
                        from: 'users',
                        localField: 'userId',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        amount: 1,
                        oldStandard: 1,
                        newStandard: 1,
                        medium: 1,
                        stream: 1,
                        razorpayOrderId: 1,
                        razorpayPaymentId: 1,
                        createdAt: 1,
                        studentName: '$user.firstName',
                        studentPhone: '$user.phoneNum'
                    }
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit }
            ]),
            PlanUpgrade.countDocuments()
        ]);

        res.status(200).json({ upgrades, total, page, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('Get Plan Upgrades Error:', err);
        res.status(500).json({ message: 'Failed to fetch plan upgrades' });
    }
};

// ==========================================
//  DASHBOARD SUMMARY
// ==========================================

const getSuperAdminDashboard = async (req, res) => {
    try {
        const StudentProfile = require('../models/StudentProfile');
        const [totalStandards, totalSubjects, totalChapters, totalPayments, totalProductPurchases, totalPlanUpgrades, totalStudents] =
            await Promise.all([
                Standard.countDocuments(),
                Subject.countDocuments(),
                Chapter.countDocuments(),
                Payment.countDocuments(),
                ProductPurchase.countDocuments(),
                PlanUpgrade.countDocuments(),
                StudentProfile.countDocuments()
            ]);

        // Sum amounts
        const paymentSum = await Payment.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const purchaseSum = await ProductPurchase.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const upgradeSum = await PlanUpgrade.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // 1. Revenue by Month (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const revenueAggregation = async (Model) => {
            return await Model.aggregate([
                { $match: { createdAt: { $gte: sixMonthsAgo } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                        amount: { $sum: "$amount" }
                    }
                },
                { $sort: { "_id": 1 } }
            ]);
        };

        const [paymentRev, upgradeRev] = await Promise.all([
            revenueAggregation(Payment),
            revenueAggregation(PlanUpgrade)
        ]);

        // Merge revenue by month
        // Note: Payment is the master source of truth, but we keep the mapping safe
        const revenueMap = {};
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const m = d.toISOString().slice(0, 7);
            months.push(m);
            revenueMap[m] = 0;
        }

        paymentRev.forEach(item => {
            if (revenueMap[item._id] !== undefined) {
                revenueMap[item._id] += item.amount;
            }
        });

        // If Upgrades were NOT in Payment, we'd add them here. 
        // But based on user feedback and counts, Payment is the master.
        // We only add upgradeRev if we find that the counts are distinct, 
        // but for now 6120 is the master total.

        const revenueByMonth = months.map(m => ({ month: m, amount: revenueMap[m] }));

        // 2. Students by Standard
        const StudentProfile = require('../models/StudentProfile');
        const studentsByStd = await StudentProfile.aggregate([
            { $group: { _id: "$std", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // 3. Chapters by Subject
        const chaptersBySubj = await Chapter.aggregate([
            {
                $lookup: {
                    from: 'subjects',
                    localField: 'subjectId',
                    foreignField: '_id',
                    as: 'subject'
                }
            },
            { $unwind: '$subject' },
            {
                $group: {
                    _id: '$subject.name',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const totalPaymentAmount = paymentSum[0]?.total || 0;
        const totalPurchaseAmount = purchaseSum[0]?.total || 0;
        const totalUpgradeAmount = upgradeSum[0]?.total || 0;
        const totalRevenue = totalPaymentAmount; // Master total

        res.status(200).json({
            totalStandards,
            totalSubjects,
            totalChapters,
            totalPayments,
            totalProductPurchases,
            totalPlanUpgrades,
            totalPaymentAmount,
            totalPurchaseAmount,
            totalUpgradeAmount,
            totalRevenue,
            totalStudents,
            revenueByMonth,
            studentsByStd: studentsByStd.map(s => ({ label: s._id || 'Unknown', value: s.count })),
            chaptersBySubj: chaptersBySubj.map(c => ({ label: c._id || 'Unknown', value: c.count }))
        });
    } catch (err) {
        console.error('Get Super Admin Dashboard Error:', err);
        res.status(500).json({ message: 'Failed to fetch dashboard data' });
    }
};

module.exports = {
    // Standards
    getStandards,
    createStandard,
    updateStandard,
    deleteStandard,
    // Subjects
    getSubjects,
    createSubject,
    updateSubject,
    deleteSubject,
    // Chapters
    getChapters,
    createChapter,
    updateChapter,
    deleteChapter,
    // Payments
    getPayments,
    getProductPurchases,
    getPlanUpgrades,
    // Students
    getStudents,
    // Dashboard
    getSuperAdminDashboard
};
