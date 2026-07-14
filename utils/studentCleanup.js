/**
 * Central definition of every collection that hangs off a student User, plus the
 * cascade delete used whenever a student is removed.
 *
 * Keep STUDENT_OWNED_COLLECTIONS in sync when a new model gains a reference to a
 * student User -- both the delete-student endpoints and the orphan cleanup script
 * (scripts/cleanupOrphanedStudentData.js) read from this list.
 */

// Collections keyed by the student's User._id.
const STUDENT_OWNED_COLLECTIONS = [
    { model: 'StudentProfile', field: 'userId' },
    { model: 'PlanUpgrade', field: 'userId' },
    { model: 'ProductPurchase', field: 'userId' },
    { model: 'Payment', field: 'userId' },
    { model: 'Invoice', field: 'userId' },
    { model: 'Session', field: 'userId' },
    { model: 'SupportTicket', field: 'userId' },
    { model: 'ExamResult', field: 'studentId' },
    { model: 'ExamViolation', field: 'studentId' },
    { model: 'FiveMinTestResult', field: 'studentId' },
    { model: 'OneLinerExamResult', field: 'studentId' },
    { model: 'TrueFalseExamResult', field: 'studentId' },
    { model: 'RewardHistory', field: 'studentId' }
];

// MatchFollowingExamResult points at StudentProfile._id, not User._id, so it needs
// the profile id rather than the user id.
const PROFILE_OWNED_COLLECTIONS = [
    { model: 'MatchFollowingExamResult', field: 'studentId' }
];

const requireModel = (name) => require(`../models/${name}`);

/**
 * Delete every record belonging to a student.
 *
 * Does NOT delete the User document itself -- the caller owns that, since the two
 * delete-student endpoints locate the user differently (by User id vs by profile id).
 *
 * @param {mongoose.Types.ObjectId|string} userId    the student's User._id
 * @param {mongoose.Types.ObjectId|string} [profileId] the student's StudentProfile._id, when known
 * @param {mongoose.ClientSession} [session]         optional transaction session
 * @returns {Promise<Object>} map of model name -> number of documents deleted
 */
const deleteStudentRelatedData = async (userId, profileId = null, session = null) => {
    const deleted = {};
    const opts = session ? { session } : {};

    // If the profile id was not supplied, look it up so profile-keyed results are
    // cleaned too.
    let resolvedProfileId = profileId;
    if (!resolvedProfileId) {
        const StudentProfile = requireModel('StudentProfile');
        const profile = await StudentProfile.findOne({ userId })
            .select('_id')
            .session(session || null);
        resolvedProfileId = profile ? profile._id : null;
    }

    for (const { model, field } of STUDENT_OWNED_COLLECTIONS) {
        const Model = requireModel(model);
        const res = await Model.deleteMany({ [field]: userId }, opts);
        if (res.deletedCount) deleted[model] = res.deletedCount;
    }

    if (resolvedProfileId) {
        for (const { model, field } of PROFILE_OWNED_COLLECTIONS) {
            const Model = requireModel(model);
            const res = await Model.deleteMany({ [field]: resolvedProfileId }, opts);
            if (res.deletedCount) deleted[model] = res.deletedCount;
        }
    }

    // Redeem codes are admin-owned assets, so the code itself is kept. Only strip the
    // deleted student out of its usage records, otherwise the admin UI renders a
    // dangling "used by" row.
    const RedeemCode = requireModel('RedeemCode');
    const redeemRes = await RedeemCode.updateMany(
        { $or: [{ usedBy: userId }, { 'usageHistory.usedBy': userId }] },
        {
            $unset: { usedBy: '' },
            $pull: { usageHistory: { usedBy: userId } }
        },
        opts
    );
    if (redeemRes.modifiedCount) deleted.RedeemCode_detached = redeemRes.modifiedCount;

    // Break referral links in both directions so surviving users do not point at a
    // ghost user: clear referredBy on anyone this student referred, and drop this
    // student out of their referrer's invitedFriends list.
    const User = requireModel('User');
    const referralRes = await User.updateMany(
        { referredBy: userId },
        { $unset: { referredBy: '' } },
        opts
    );
    if (referralRes.modifiedCount) deleted.User_referredByCleared = referralRes.modifiedCount;

    const invitedRes = await User.updateMany(
        { 'invitedFriends.userId': userId },
        { $pull: { invitedFriends: { userId } } },
        opts
    );
    if (invitedRes.modifiedCount) deleted.User_invitedFriendsCleared = invitedRes.modifiedCount;

    return deleted;
};

module.exports = {
    STUDENT_OWNED_COLLECTIONS,
    PROFILE_OWNED_COLLECTIONS,
    deleteStudentRelatedData
};
