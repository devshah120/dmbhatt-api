const mongoose = require('mongoose');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
try {
    const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        console.log('Firebase Admin initialized successfully');
    }
} catch (error) {
    console.error('Firebase Admin initialization error:', error);
}

const Standard = require('../models/Standard');
const Subject = require('../models/Subject');
const Chapter = require('../models/Chapter');
const Payment = require('../models/Payment');
const ProductPurchase = require('../models/ProductPurchase');
const PlanUpgrade = require('../models/PlanUpgrade');
const User = require('../models/User');
const ExploreProduct = require('../models/ExploreProduct');
const ActivityLog = require('../models/ActivityLog');
const NotificationConfig = require('../models/NotificationConfig');
const { deleteStudentRelatedData } = require('../utils/studentCleanup');

// ==========================================
//  STUDENTS CRUD
// ==========================================

const createStudent = async (req, res) => {
    try {
        const { firstName, email, phoneNum, std, medium, stream, password } = req.body;
        if (!firstName || !phoneNum || !std || !medium) {
            return res.status(400).json({ message: 'Name, phone, standard and medium are required' });
        }
        const User = require('../models/User');
        const StudentProfile = require('../models/StudentProfile');
        const bcrypt = require('bcryptjs');

        const existing = await User.findOne({ phoneNum });
        if (existing) return res.status(409).json({ message: 'Phone number already registered' });

        const loginCode = password || phoneNum.slice(-4); // default PIN = last 4 digits of phone
        const loginCodeHash = await bcrypt.hash(loginCode, 10);

        const user = await User.create({ firstName, email, phoneNum, role: 'student', loginCodeHash });
        await StudentProfile.create({ userId: user._id, std, medium: medium || 'Gujarati', board: 'GSEB', stream: stream || 'None' });

        const ActivityLog = require('../models/ActivityLog');
        const performedBy = req.performedBy || req.query.performedBy || 'Super Admin';
        const performedByImg = req.performedByImg || req.query.performedByImg || '';

        await ActivityLog.create({
            entityType: 'Student',
            action: 'Added',
            targetName: firstName,
            performedBy: performedBy,
            performedByImg: performedByImg
        });

        res.status(201).json({ message: 'Student created successfully', defaultPin: loginCode });
    } catch (err) {
        console.error('Create Student Error:', err);
        res.status(500).json({ message: err.message || 'Failed to create student' });
    }
};

const getStudents = async (req, res) => {
    try {
        const StudentProfile = require('../models/StudentProfile');
        const students = await StudentProfile.aggregate([
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
                    from: 'users',
                    localField: 'user.referredBy',
                    foreignField: '_id',
                    as: 'referrer'
                }
            },
            {
                $lookup: {
                    from: 'redeemcodes',
                    let: { studentUserId: '$userId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        { $eq: ['$usedBy', '$$studentUserId'] },
                                        { $in: ['$$studentUserId', { $ifNull: ['$usageHistory.usedBy', []] }] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'redeemCodeInfo'
                }
            },
            {
                $lookup: {
                    from: 'payments',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'userPayments'
                }
            },
            {
                $lookup: {
                    from: 'planupgrades',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'userUpgrades'
                }
            },
            {
                $addFields: {
                    computedPaidAmount: {
                        $add: [
                            {
                                $sum: {
                                    $map: {
                                        input: {
                                            $filter: {
                                                input: '$userPayments',
                                                as: 'p',
                                                cond: { $eq: ['$$p.status', 'captured'] }
                                            }
                                        },
                                        as: 'p',
                                        in: '$$p.amount'
                                    }
                                }
                            },
                            { $sum: '$userUpgrades.amount' }
                        ]
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    userId: 1,
                    firstName: '$user.firstName',
                    email: '$user.email',
                    phoneNum: '$user.phoneNum',
                    isPaid: { $ifNull: ['$user.isPaid', false] },
                    paidAmount: { $ifNull: ['$computedPaidAmount', 0] },
                    std: 1,
                    medium: 1,
                    stream: 1,
                    totalRewardPoints: 1,
                    createdAt: 1,
                    referrerName: { $arrayElemAt: ['$referrer.firstName', 0] },
                    referrerCode: { $arrayElemAt: ['$referrer.referralCode', 0] },
                    redeemCode: { $arrayElemAt: ['$redeemCodeInfo.code', 0] },
                    redeemCodeCreatedBy: { $arrayElemAt: ['$redeemCodeInfo.createdBy', 0] }
                }
            },
            { $sort: { createdAt: -1 } }
        ]);

        res.status(200).json(students);
    } catch (err) {
        console.error('Get Students Error:', err);
        res.status(500).json({ message: 'Failed to fetch students' });
    }
};

const getStudentsExport = async (req, res) => {
    try {
        const StudentProfile = require('../models/StudentProfile');
        
        const students = await StudentProfile.aggregate([
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
                    from: 'users',
                    localField: 'user.referredBy',
                    foreignField: '_id',
                    as: 'referrer'
                }
            },
            {
                $lookup: {
                    from: 'redeemcodes',
                    let: { studentUserId: '$userId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        { $eq: ['$usedBy', '$$studentUserId'] },
                                        { $in: ['$$studentUserId', { $ifNull: ['$usageHistory.usedBy', []] }] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'redeemCodeInfo'
                }
            },
            {
                $lookup: {
                    from: 'payments',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'userPayments'
                }
            },
            {
                $lookup: {
                    from: 'planupgrades',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'userUpgrades'
                }
            },
            {
                $addFields: {
                    computedPaidAmount: {
                        $add: [
                            {
                                $sum: {
                                    $map: {
                                        input: {
                                            $filter: {
                                                input: '$userPayments',
                                                as: 'p',
                                                cond: { $eq: ['$$p.status', 'captured'] }
                                            }
                                        },
                                        as: 'p',
                                        in: '$$p.amount'
                                    }
                                }
                            },
                            { $sum: '$userUpgrades.amount' }
                        ]
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    firstName: '$user.firstName',
                    email: '$user.email',
                    phoneNum: '$user.phoneNum',
                    isPaid: { $ifNull: ['$user.isPaid', false] },
                    paidAmount: { $ifNull: ['$computedPaidAmount', 0] },
                    std: 1,
                    medium: 1,
                    stream: 1,
                    totalRewardPoints: 1,
                    createdAt: 1,
                    referrerName: { $arrayElemAt: ['$referrer.firstName', 0] },
                    referrerCode: { $arrayElemAt: ['$referrer.referralCode', 0] },
                    redeemCode: { $arrayElemAt: ['$redeemCodeInfo.code', 0] },
                    redeemCodeCreatedBy: { $arrayElemAt: ['$redeemCodeInfo.createdBy', 0] }
                }
            },
            { $sort: { createdAt: -1 } }
        ]);

        let csv = 'Name,Email,Phone,Standard,Stream,Medium,Reward Points,Is Paid,Amount Paid,Referral/Redeem Code,Referrer/Generated By,Joined Date\n';

        students.forEach(s => {
            const name = `"${(s.firstName || '').replace(/"/g, '""')}"`;
            const email = `"${(s.email || '').replace(/"/g, '""')}"`;
            const phone = `"${(s.phoneNum || '').replace(/"/g, '""')}"`;
            const std = `"${(s.std || '').replace(/"/g, '""')}"`;
            const stream = `"${(s.stream || '').replace(/"/g, '""')}"`;
            const medium = `"${(s.medium || '').replace(/"/g, '""')}"`;
            const points = s.totalRewardPoints || 0;
            const isPaid = s.isPaid ? 'Paid' : 'Unpaid';
            const paidAmount = s.paidAmount || 0;
            
            let refCode = '';
            let refOwner = '';
            if (s.referrerCode) {
                refCode = s.referrerCode;
                refOwner = s.referrerName || '';
            } else if (s.redeemCode) {
                refCode = s.redeemCode;
                refOwner = s.redeemCodeCreatedBy || '';
            }
            
            const refCodeEscaped = `"${refCode.replace(/"/g, '""')}"`;
            const refOwnerEscaped = `"${refOwner.replace(/"/g, '""')}"`;
            const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '';

            csv += `${name},${email},${phone},${std},${stream},${medium},${points},${isPaid},${paidAmount},${refCodeEscaped},${refOwnerEscaped},${date}\n`;
        });

        res.status(200).json({ csv });
    } catch (err) {
        console.error('Export Students Error:', err);
        res.status(500).json({ message: 'Failed to export students' });
    }
};

const updateStudent = async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, email, phoneNum, std, medium, stream, totalRewardPoints } = req.body;
        
        const StudentProfile = require('../models/StudentProfile');
        const User = require('../models/User');

        const profile = await StudentProfile.findById(id);
        if (!profile) return res.status(404).json({ message: 'Student not found' });
        
        // Update User
        const userUpdates = {};
        if (firstName !== undefined) userUpdates.firstName = firstName.trim();
        if (email !== undefined) userUpdates.email = email.trim();
        if (phoneNum !== undefined) userUpdates.phoneNum = phoneNum.trim();
        if (Object.keys(userUpdates).length > 0) {
            await User.findByIdAndUpdate(profile.userId, { $set: userUpdates });
        }

        // Update Profile
        const profileUpdates = {};
        if (std !== undefined) profileUpdates.std = std;
        if (medium !== undefined) profileUpdates.medium = medium;
        if (stream !== undefined) profileUpdates.stream = stream;
        if (totalRewardPoints !== undefined) profileUpdates.totalRewardPoints = totalRewardPoints;
        
        await StudentProfile.findByIdAndUpdate(id, { $set: profileUpdates });
        
        const ActivityLog = require('../models/ActivityLog');
        const performedBy = req.performedBy || req.query.performedBy || 'Super Admin';
        const performedByImg = req.performedByImg || req.query.performedByImg || '';
        
        // Find user name for logging
        const updatedUser = await User.findById(profile.userId);
        
        await ActivityLog.create({
            entityType: 'Student',
            action: 'Updated',
            targetName: updatedUser ? updatedUser.firstName : 'Unknown Student',
            performedBy: performedBy,
            performedByImg: performedByImg
        });

        res.status(200).json({ message: 'Student updated successfully' });
    } catch (err) {
        console.error('Update Student Error:', err);
        res.status(500).json({ message: 'Failed to update student' });
    }
};

const deleteStudent = async (req, res) => {
    const mongoose = require('mongoose');
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const { id } = req.params;
        const StudentProfile = require('../models/StudentProfile');
        const User = require('../models/User');

        const profile = await StudentProfile.findById(id).session(session);
        if (!profile) throw new Error('Student not found');

        const user = await User.findById(profile.userId).session(session);
        const targetName = user ? user.firstName : 'Unknown';

        // Remove purchases, payments, invoices, exam results, sessions, etc. before
        // dropping the user, so nothing is left pointing at a deleted student.
        const removed = await deleteStudentRelatedData(profile.userId, id, session);
        console.log(`Deleted student ${targetName} (${profile.userId}) related data:`, removed);

        await User.findByIdAndDelete(profile.userId).session(session);

        const ActivityLog = require('../models/ActivityLog');
        const performedBy = req.performedBy || req.query.performedBy || 'Super Admin';
        const performedByImg = req.performedByImg || req.query.performedByImg || '';

        await ActivityLog.create([{
            entityType: 'Student',
            action: 'Deleted',
            targetName: targetName,
            performedBy: performedBy,
            performedByImg: performedByImg
        }], { session });

        await session.commitTransaction();
        res.status(200).json({ message: 'Student deleted successfully' });
    } catch (err) {
        await session.abortTransaction();
        console.error('Delete Student Error:', err);
        res.status(500).json({ message: err.message || 'Failed to delete student' });
    } finally {
        session.endSession();
    }
};

// ==========================================
//  ADMINS CRUD
// ==========================================

const createAdmin = async (req, res) => {
    try {
        const { firstName, email, phoneNum, password, role } = req.body;

        // Restriction: ONLY the specific phone number can be assigned 'super admin' role
        if (role === 'super admin' && phoneNum !== '9825189540') {
            return res.status(403).json({ message: 'The super admin role is restricted to a specific account.' });
        }

        if (!firstName || !phoneNum) {
            return res.status(400).json({ message: 'Name and phone number are required' });
        }
        const User = require('../models/User');
        const bcrypt = require('bcryptjs');

        const existing = await User.findOne({ phoneNum });
        if (existing) return res.status(409).json({ message: 'Phone number already registered' });

        const loginCode = password || phoneNum.slice(-4);
        const loginCodeHash = await bcrypt.hash(loginCode, 10);

        await User.create({ firstName, email, phoneNum, role: role || 'admin', loginCodeHash });

        await ActivityLog.create({
            entityType: 'Admin',
            action: 'Added',
            targetName: firstName,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(201).json({ message: 'Admin created successfully', defaultPin: loginCode });
    } catch (err) {
        console.error('Create Admin Error:', err);
        res.status(500).json({ message: err.message || 'Failed to create admin' });
    }
};

const getAdmins = async (req, res) => {
    try {
        const User = require('../models/User');
        const admins = await User.find({ role: 'admin' }).select('-loginCodeHash').sort({ createdAt: -1 });
        res.status(200).json({ admins });
    } catch (err) {
        console.error('Get Admins Error:', err);
        res.status(500).json({ message: 'Failed to fetch admins' });
    }
};

const updateAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, email, phoneNum, isActive, password, role } = req.body;

        // Restriction: ONLY the specific phone number can be assigned 'super admin' role
        if (role === 'super admin' && phoneNum !== '9825189540') {
            return res.status(403).json({ message: 'The super admin role is restricted to a specific account.' });
        }
        
        const User = require('../models/User');
        const userUpdates = {};
        if (firstName !== undefined) userUpdates.firstName = firstName.trim();
        if (email !== undefined) userUpdates.email = email.trim();
        if (phoneNum !== undefined) userUpdates.phoneNum = phoneNum.trim();
        if (isActive !== undefined) userUpdates.isActive = isActive;
        if (role !== undefined) userUpdates.role = role;

        if (password && password.trim() !== '') {
            const bcrypt = require('bcryptjs');
            userUpdates.loginCodeHash = await bcrypt.hash(password.trim(), 10);
        }
        
        const updated = await User.findByIdAndUpdate(id, { $set: userUpdates }, { new: true });

        await ActivityLog.create({
            entityType: 'Admin',
            action: 'Updated',
            targetName: updated ? updated.firstName : 'Admin',
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(200).json({ message: 'Admin updated successfully' });
    } catch (err) {
        console.error('Update Admin Error:', err);
        res.status(500).json({ message: 'Failed to update admin' });
    }
};

const deleteAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const User = require('../models/User');
        const admin = await User.findByIdAndDelete(id);

        if (admin) {
            await ActivityLog.create({
                entityType: 'Admin',
                action: 'Deleted',
                targetName: admin.firstName,
                performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
                performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
            });
        }

        res.status(200).json({ message: 'Admin deleted successfully' });
    } catch (err) {
        console.error('Delete Admin Error:', err);
        res.status(500).json({ message: 'Failed to delete admin' });
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

const getStandardsByStatus = async (req, res) => {
    try {
        const isActive = req.params.isActive === 'true';
        const standards = await Standard.find({ isActive }).sort({ displayOrder: 1, name: 1 });
        res.status(200).json(standards);
    } catch (err) {
        console.error('Get Standards By Status Error:', err);
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

        await ActivityLog.create({
            entityType: 'Standard',
            action: 'Added',
            targetName: name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

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

        await ActivityLog.create({
            entityType: 'Standard',
            action: 'Updated',
            targetName: standard.name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

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

        await ActivityLog.create([{
            entityType: 'Standard',
            action: 'Deleted',
            targetName: deleted.name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        }], { session });

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
        if (req.query.stream) {
            filter.stream = req.query.stream;
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
        const { name, standardId, stream } = req.body;
        if (!name || !standardId) {
            return res.status(400).json({ message: 'Subject name and standardId are required' });
        }
        // Verify standard exists
        const standard = await Standard.findById(standardId);
        if (!standard) {
            return res.status(404).json({ message: 'Standard not found' });
        }
        const subject = new Subject({ name: name.trim(), standardId, stream: stream || undefined });
        await subject.save();
        const populated = await subject.populate('standardId', 'name');

        await ActivityLog.create({
            entityType: 'Subject',
            action: 'Added',
            targetName: name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

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
        const { name, standardId, isActive, stream } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (standardId !== undefined) updates.standardId = standardId;
        if (isActive !== undefined) updates.isActive = isActive;
        if (stream !== undefined) updates.stream = stream;

        const subject = await Subject.findByIdAndUpdate(id, { $set: updates }, { new: true })
            .populate('standardId', 'name');
        if (!subject) {
            return res.status(404).json({ message: 'Subject not found' });
        }

        await ActivityLog.create({
            entityType: 'Subject',
            action: 'Updated',
            targetName: subject.name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

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

        await ActivityLog.create([{
            entityType: 'Subject',
            action: 'Deleted',
            targetName: deleted.name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        }], { session });

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

        await ActivityLog.create({
            entityType: 'Chapter',
            action: 'Added',
            targetName: name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
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

        await ActivityLog.create({
            entityType: 'Chapter',
            action: 'Updated',
            targetName: chapter.name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

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

        await ActivityLog.create({
            entityType: 'Chapter',
            action: 'Deleted',
            targetName: deleted.name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

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
        const payments = await Payment.aggregate([
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
            { $sort: { createdAt: -1 } }
        ]);

        res.status(200).json(payments);
    } catch (err) {
        console.error('Get Payments Error:', err);
        res.status(500).json({ message: 'Failed to fetch payments' });
    }
};

const getProductPurchases = async (req, res) => {
    try {
        const purchases = await ProductPurchase.aggregate([
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
            { $sort: { createdAt: -1 } }
        ]);

        res.status(200).json(purchases);
    } catch (err) {
        console.error('Get Product Purchases Error:', err);
        res.status(500).json({ message: 'Failed to fetch product purchases' });
    }
};

const getPlanUpgrades = async (req, res) => {
    try {
        // 1. Get all Product Payment IDs to exclude them from general payments
        const productPaymentIds = await ProductPurchase.distinct('razorpayPaymentId');

        // 2. Fetch Initial Payments (representing first-time plan buys)
        const initialPayments = await Payment.aggregate([
            { $match: { razorpayPaymentId: { $nin: productPaymentIds } } },
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
                    oldStandard: { $literal: 'None' },
                    newStandard: '$profile.std',
                    medium: '$profile.medium',
                    stream: '$profile.stream',
                    razorpayOrderId: 1,
                    razorpayPaymentId: 1,
                    createdAt: 1,
                    studentName: '$user.firstName',
                    studentPhone: '$user.phoneNum',
                    isInitial: { $literal: true }
                }
            }
        ]);

        // 3. Fetch Upgrades
        const upgrades = await PlanUpgrade.aggregate([
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
                    studentPhone: '$user.phoneNum',
                    isInitial: { $literal: false }
                }
            }
        ]);

        // 4. Merge and Sort
        let combined = [...initialPayments, ...upgrades];
        combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.status(200).json(combined);
    } catch (err) {
        console.error('Get Plan Upgrades Error:', err);
        res.status(500).json({ message: 'Failed to fetch plan purchases' });
    }
};

// ==========================================
//  CONFIG
// ==========================================

const CONFIG_DIR = path.join(__dirname, '../config');

const getConfigPath = (type) => path.join(CONFIG_DIR, `${type}.json`);

const getConfig = async (req, res) => {
    try {
        const { type } = req.params;

        // Handle notification config from database
        if (type === 'notification') {
            const NotificationConfig = require('../models/NotificationConfig');
            let config = await NotificationConfig.findOne();
            if (!config) {
                config = await NotificationConfig.create({});
            }
            return res.status(200).json(config);
        }

        // Handle other configs from file system
        const filePath = getConfigPath(type);
        if (!fs.existsSync(filePath)) return res.status(200).json({});
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.status(200).json(data);
    } catch (err) {
        console.error('Get Config Error:', err);
        res.status(500).json({ message: 'Failed to read configuration' });
    }
};

const saveConfig = async (req, res) => {
    try {
        const { type } = req.params;

        // Handle notification config in database
        if (type === 'notification') {
            const NotificationConfig = require('../models/NotificationConfig');
            let config = await NotificationConfig.findOne();
            if (!config) {
                config = new NotificationConfig(req.body);
            } else {
                Object.assign(config, req.body);
            }
            config.updatedAt = new Date();
            await config.save();
            return res.status(200).json({ message: 'Configuration saved successfully', config });
        }

        // Handle other configs in file system
        if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(getConfigPath(type), JSON.stringify(req.body, null, 2));
        res.status(200).json({ message: 'Configuration saved successfully' });
    } catch (err) {
        console.error('Save Config Error:', err);
        res.status(500).json({ message: 'Failed to save configuration' });
    }
};

const getPublicConfig = async (req, res) => {
    try {
        const { type } = req.params;
        const filePath = getConfigPath(type);
        if (!fs.existsSync(filePath)) return res.status(200).json({});
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Filter sensitive data
        if (type === 'payment') {
            delete data.razorpayKeySecret;
        }
        
        res.status(200).json(data);
    } catch (err) {
        console.error('Get Public Config Error:', err);
        res.status(500).json({ message: 'Failed to read configuration' });
    }
};

// ==========================================
//  SUPER ADMIN DASHBOARD
// ==========================================

const getSuperAdminDashboard = async (req, res) => {
    try {
        // Security check: Only super admins can access dashboard stats
        if (req.user && req.user.role !== 'super admin') {
            return res.status(403).json({ message: 'Access denied. Super admin role required.' });
        }

        const StudentProfile = require('../models/StudentProfile');
        const [totalStandards, totalProducts, totalChapters, totalPayments, totalProductPurchases, totalPlanUpgrades, totalStudents] =
            await Promise.all([
                Standard.countDocuments(),
                ExploreProduct.countDocuments(),
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

        upgradeRev.forEach(item => {
            if (revenueMap[item._id] !== undefined) {
                revenueMap[item._id] += item.amount;
            }
        });

        const revenueByMonth = months.map(m => ({ month: m, amount: revenueMap[m] }));

        // Total Revenue Sum
        const totalPaymentSum = paymentSum[0]?.total || 0;
        const totalUpgradeSum = upgradeSum[0]?.total || 0;
        const totalRevenue = totalPaymentSum + totalUpgradeSum;

        // 2. Students by Standard
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

        // 4. Product Earnings by Product Name
        const productEarningsByProduct = await ProductPurchase.aggregate([
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
                    _id: '$product.name',
                    totalEarnings: { $sum: '$amount' }
                }
            },
            { $sort: { totalEarnings: -1 } },
            { $limit: 10 } // Limit to top 10 products for the chart
        ]);

        const totalPurchaseAmount = purchaseSum[0]?.total || 0;
        const totalUpgradeAmount = upgradeSum[0]?.total || 0;
        // totalRevenue is already calculated above as totalPaymentSum + totalUpgradeSum

        res.status(200).json({
            totalStandards,
            totalProducts,
            totalChapters,
            totalPayments,
            totalProductPurchases,
            totalPlanUpgrades,
            totalPurchaseAmount,
            totalUpgradeAmount,
            totalRevenue,
            totalStudents,
            revenueByMonth,
            studentsByStd: studentsByStd.map(s => ({ label: s._id || 'Unknown', value: s.count })),
            chaptersBySubj: chaptersBySubj.map(c => ({ label: c._id || 'Unknown', value: c.count })),
            productEarningsByProduct: productEarningsByProduct.map(p => ({ label: p._id || 'Other', value: p.totalEarnings }))
        });
    } catch (err) {
        console.error('Get Super Admin Dashboard Error:', err);
        res.status(500).json({ message: 'Failed to fetch dashboard data' });
    }
};

// ==========================================
//  PRODUCTS CRUD
// ==========================================

const getProducts = async (req, res) => {
    try {
        const { category } = req.query;
        const filter = {};
        if (category) filter.category = category;
        const products = await ExploreProduct.find(filter).sort({ createdAt: -1 });
        res.status(200).json({ products });
    } catch (err) {
        console.error('Get Products Error:', err);
        res.status(500).json({ message: 'Failed to fetch products' });
    }
};

const createProduct = async (req, res) => {
    try {
        const productData = { ...req.body };
        
        if (req.files && req.files['image']) {
            productData.image = req.files['image'][0].path.replace(/\\/g, '/');
        }

        const product = new ExploreProduct(productData);
        await product.save();

        await ActivityLog.create({
            entityType: 'Product',
            action: 'Added',
            targetName: product.name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(201).json({ message: 'Product created successfully', product });
    } catch (err) {
        console.error('Create Product Error:', err);
        res.status(500).json({ message: 'Failed to create product' });
    }
};

const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const productData = { ...req.body };

        if (req.files && req.files['image']) {
            productData.image = req.files['image'][0].path.replace(/\\/g, '/');
        }

        const product = await ExploreProduct.findByIdAndUpdate(id, productData, { new: true });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        await ActivityLog.create({
            entityType: 'Product',
            action: 'Updated',
            targetName: product.name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(200).json({ message: 'Product updated successfully', product });
    } catch (err) {
        console.error('Update Product Error:', err);
        res.status(500).json({ message: 'Failed to update product' });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await ExploreProduct.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ message: 'Product not found' });

        await ActivityLog.create({
            entityType: 'Product',
            action: 'Deleted',
            targetName: deleted.name,
            performedBy: req.performedBy || req.query.performedBy || req.body.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || req.body.performedByImg || ''
        });

        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error('Delete Product Error:', err);
        res.status(500).json({ message: 'Failed to delete product' });
    }
};

// ==========================================
//  ACTIVITY LOGS
// ==========================================

const getLogs = async (req, res) => {
    try {
        const ActivityLog = require('../models/ActivityLog');
        const { entityType } = req.query;

        const filter = {};
        if (entityType) {
            filter.entityType = entityType;
        }

        const logs = await ActivityLog.find(filter)
            .sort({ createdAt: -1 });

        res.status(200).json(logs);
    } catch (err) {
        console.error('Get Logs Error:', err);
        res.status(500).json({ message: 'Failed to fetch logs' });
    }
};

// ==========================================
//  PUSH NOTIFICATIONS
// ==========================================

const sendPushNotification = async (req, res) => {
    try {
        const { title, body, std } = req.body;
        if (!title || !body) {
            return res.status(400).json({ message: 'Title and body are required' });
        }

        // Determine topic based on std filter
        let topic = 'all';
        if (std && std !== 'all') {
            topic = `std_${std}`;
        }

        // Send to FCM (V1 API via SDK)
        const message = {
            notification: {
                title: title,
                body: body
            },
            topic: topic,
            android: {
                notification: {
                    sound: 'default',
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                }
            },
            data: {
                title: title,
                body: body
            }
        };

        const response = await admin.messaging().send(message);

        // Log Activity
        const targetDesc = std && std !== 'all' ? `Standard ${std}` : 'All Students';
        await ActivityLog.create({
            entityType: 'System',
            action: 'Updated',
            targetName: `Push Notification (${targetDesc}): ${title}`,
            performedBy: req.performedBy || req.query.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || ''
        });

        res.status(200).json({ message: 'Push notification sent successfully', messageId: response });
    } catch (err) {
        console.error('Send Push Notification Error:', err);
        res.status(500).json({ message: err.message || 'Failed to send push notification' });
    }
};

const scheduleNotification = async (req, res) => {
    try {
        const { title, body, std, scheduledTime } = req.body;
        if (!title || !body || !scheduledTime) {
            return res.status(400).json({ message: 'Title, body, and scheduled time are required' });
        }

        const ScheduledNotification = require('../models/ScheduledNotification');

        // Frontend sends "2026-06-15T22:00" meaning 10:00 PM IST
        // We need to store the UTC equivalent: 2026-06-15 16:30 UTC (22:00 - 5:30)
        // Parse the string manually to avoid JS timezone interpretation
        const [dateStr, timeStr] = scheduledTime.split('T');
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes] = timeStr.split(':').map(Number);

        // Create UTC date directly: treat the input as IST and convert to UTC
        // IST = UTC + 5:30, so: UTC = IST - 5:30
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
        const actualUtc = new Date(istDate.getTime() - istOffsetMs);

        const notification = await ScheduledNotification.create({
            title,
            body,
            std: std || 'all',
            scheduledTime: actualUtc
        });

        await ActivityLog.create({
            entityType: 'System',
            action: 'Added',
            targetName: `Scheduled Push Notification: ${title}`,
            performedBy: req.performedBy || req.query.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || ''
        });

        res.status(201).json({ message: 'Notification scheduled successfully', notification });
    } catch (err) {
        console.error('Schedule Notification Error:', err);
        res.status(500).json({ message: err.message || 'Failed to schedule notification' });
    }
};

const getBirthdayNotificationConfig = async (req, res) => {
    try {
        const BirthdayNotificationConfig = require('../models/BirthdayNotificationConfig');
        let config = await BirthdayNotificationConfig.findOne();
        if (!config) {
            config = await BirthdayNotificationConfig.create({});
        }
        res.status(200).json(config);
    } catch (err) {
        console.error('Get Birthday Config Error:', err);
        res.status(500).json({ message: 'Failed to fetch birthday configuration' });
    }
};

const saveBirthdayNotificationConfig = async (req, res) => {
    try {
        const BirthdayNotificationConfig = require('../models/BirthdayNotificationConfig');
        let config = await BirthdayNotificationConfig.findOne();
        if (!config) {
            config = new BirthdayNotificationConfig(req.body);
        } else {
            Object.assign(config, req.body);
        }
        config.updatedAt = new Date();
        await config.save();

        await ActivityLog.create({
            entityType: 'System',
            action: 'Updated',
            targetName: 'Birthday Notification Configuration',
            performedBy: req.performedBy || req.query.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || ''
        });

        res.status(200).json({ message: 'Birthday configuration saved successfully', config });
    } catch (err) {
        console.error('Save Birthday Config Error:', err);
        res.status(500).json({ message: err.message || 'Failed to save birthday configuration' });
    }
};

const getScheduledNotifications = async (req, res) => {
    try {
        const ScheduledNotification = require('../models/ScheduledNotification');
        const { skip = 0, limit = 25, status } = req.query;

        const query = {};
        if (status && status !== 'all') {
            query.status = status;
        }

        const data = await ScheduledNotification.find(query)
            .sort({ scheduledTime: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit));

        const total = await ScheduledNotification.countDocuments(query);

        res.status(200).json({ data, total });
    } catch (err) {
        console.error('Get Scheduled Notifications Error:', err);
        res.status(500).json({ message: 'Failed to fetch scheduled notifications' });
    }
};

const deleteScheduledNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const ScheduledNotification = require('../models/ScheduledNotification');

        const notification = await ScheduledNotification.findByIdAndDelete(id);
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        await ActivityLog.create({
            entityType: 'System',
            action: 'Deleted',
            targetName: `Scheduled Notification: ${notification.title}`,
            performedBy: req.performedBy || req.query.performedBy || 'Super Admin',
            performedByImg: req.performedByImg || req.query.performedByImg || ''
        });

        res.status(200).json({ message: 'Notification deleted successfully' });
    } catch (err) {
        console.error('Delete Scheduled Notification Error:', err);
        res.status(500).json({ message: 'Failed to delete notification' });
    }
};

module.exports = {
    // Standards
    getStandards,
    getStandardsByStatus,
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
    createStudent,
    getStudentsExport,
    updateStudent,
    deleteStudent,
    // Admins
    getAdmins,
    createAdmin,
    updateAdmin,
    deleteAdmin,
    // Config
    getConfig,
    saveConfig,
    getPublicConfig,
    // Dashboard
    getSuperAdminDashboard,
    // Products
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    // Logs
    getLogs,
    // Push Notifications
    sendPushNotification,
    scheduleNotification,
    getScheduledNotifications,
    deleteScheduledNotification,
    getBirthdayNotificationConfig,
    saveBirthdayNotificationConfig
};
