const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config/referral.json');

const DEFAULTS = {
    pointsPerReferral: 50,
    maxReferralsAllowed: 5,
    pointsPerRupee: 10,
    maxPointsDiscountPercent: 50
};

/**
 * Read the Super Admin configured referral / points settings.
 * Always returns usable values — a missing or malformed file falls back to DEFAULTS
 * so a bad edit can never take checkout down.
 */
const getPointsConfig = () => {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

            let points = data.pointsPerReferral;
            if (Array.isArray(points)) {
                points = points.map(Number);
            } else if (points !== undefined) {
                points = Number(points);
            } else {
                points = DEFAULTS.pointsPerReferral;
            }

            const rate = Number(data.pointsPerRupee);
            const cap = Number(data.maxPointsDiscountPercent);

            return {
                pointsPerReferral: points,
                maxReferralsAllowed: data.maxReferralsAllowed !== undefined
                    ? Number(data.maxReferralsAllowed)
                    : DEFAULTS.maxReferralsAllowed,
                pointsPerRupee: rate > 0 ? rate : DEFAULTS.pointsPerRupee,
                maxPointsDiscountPercent: cap >= 0 && cap <= 100 ? cap : DEFAULTS.maxPointsDiscountPercent
            };
        }
    } catch (err) {
        console.error('Error reading points config:', err);
    }
    return { ...DEFAULTS };
};

/** Rupee value of a points balance, rounded down so we never over-credit. */
const pointsToRupees = (points, pointsPerRupee) => {
    const rate = Number(pointsPerRupee) > 0 ? Number(pointsPerRupee) : DEFAULTS.pointsPerRupee;
    return Math.floor((Number(points) || 0) / rate);
};

/** Points needed to cover a given rupee amount. */
const rupeesToPoints = (rupees, pointsPerRupee) => {
    const rate = Number(pointsPerRupee) > 0 ? Number(pointsPerRupee) : DEFAULTS.pointsPerRupee;
    return Math.ceil((Number(rupees) || 0) * rate);
};

/**
 * Work out what a student may redeem against one product, and what they still owe.
 *
 * This is the single source of truth for points pricing. Both order creation and
 * payment verification call it with the same inputs so the two can never disagree
 * about the amount — the client's numbers are never trusted.
 *
 * @param {number} price          Product price in rupees (from the DB, not the client)
 * @param {number} balance        The user's current points balance
 * @param {number} requestedPoints Points the student asked to spend
 * @param {object} config         Result of getPointsConfig()
 */
const calculateRedemption = (price, balance, requestedPoints, config) => {
    const productPrice = Math.max(0, Number(price) || 0);
    const pointsBalance = Math.max(0, Math.floor(Number(balance) || 0));
    const { pointsPerRupee, maxPointsDiscountPercent } = config;

    // Ceiling on what points may cover for this product.
    const maxDiscountRupees = Math.floor((productPrice * maxPointsDiscountPercent) / 100);

    // Points are only worth whole rupees, so cap the spend at the points actually
    // needed to reach maxDiscountRupees. Anything beyond that would be burned for
    // nothing.
    const maxUsablePoints = Math.min(pointsBalance, rupeesToPoints(maxDiscountRupees, pointsPerRupee));

    let pointsUsed = Math.max(0, Math.floor(Number(requestedPoints) || 0));
    pointsUsed = Math.min(pointsUsed, maxUsablePoints);

    const discount = Math.min(pointsToRupees(pointsUsed, pointsPerRupee), maxDiscountRupees);

    // Only charge for points that produced an actual rupee of discount, so a
    // student is never debited points that bought them nothing.
    const effectivePointsUsed = discount > 0 ? Math.min(pointsUsed, rupeesToPoints(discount, pointsPerRupee)) : 0;

    return {
        productPrice,
        pointsBalance,
        pointsUsed: effectivePointsUsed,
        discount,
        payableAmount: productPrice - discount,
        maxUsablePoints,
        maxDiscountRupees,
        pointsPerRupee,
        maxPointsDiscountPercent
    };
};

module.exports = {
    getPointsConfig,
    pointsToRupees,
    rupeesToPoints,
    calculateRedemption
};
