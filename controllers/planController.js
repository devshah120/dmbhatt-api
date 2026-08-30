const SubscriptionPlan = require('../models/SubscriptionPlan');

// Normalizes an incoming iOS amount. Returns `null` when the admin left it blank
// (meaning "use the Android/base amount"), or a validated non-negative number.
const parseIosAmount = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return undefined; // undefined signals invalid
    return num;
};

// Get all subscription plans
exports.getAllPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find().sort({ standard: 1 });
        res.json(plans);
    } catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({ message: 'Error fetching plans', error: error.message });
    }
};

// Get plan by standard
exports.getPlanByStandard = async (req, res) => {
    try {
        const { standard } = req.params;
        const plan = await SubscriptionPlan.findOne({ standard });

        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        res.json(plan);
    } catch (error) {
        console.error('Error fetching plan:', error);
        res.status(500).json({ message: 'Error fetching plan', error: error.message });
    }
};

// Get only active plans (for student app)
exports.getActivePlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find({ isActive: true }).sort({ standard: 1 });
        res.json(plans);
    } catch (error) {
        console.error('Error fetching active plans:', error);
        res.status(500).json({ message: 'Error fetching active plans', error: error.message });
    }
};

// Create or update plan (admin only)
exports.createOrUpdatePlan = async (req, res) => {
    try {
        const { standard, amount, description, isActive } = req.body;

        if (!standard || amount === undefined) {
            return res.status(400).json({ message: 'Standard and amount are required' });
        }

        const iosAmount = parseIosAmount(req.body.iosAmount);
        if (iosAmount === undefined) {
            return res.status(400).json({ message: 'iOS amount must be a non-negative number' });
        }

        if (!['6', '7', '8', '9', '10', '11', '12'].includes(standard)) {
            return res.status(400).json({ message: 'Invalid standard' });
        }

        if (amount < 0) {
            return res.status(400).json({ message: 'Amount must be non-negative' });
        }

        const existingPlan = await SubscriptionPlan.findOne({ standard });

        let plan;
        if (existingPlan) {
            // Update existing plan
            plan = await SubscriptionPlan.findByIdAndUpdate(
                existingPlan._id,
                { amount, iosAmount, description, isActive },
                { new: true, runValidators: true }
            );
        } else {
            // Create new plan
            plan = new SubscriptionPlan({
                standard,
                amount,
                iosAmount,
                description,
                isActive: isActive !== false
            });
            await plan.save();
        }

        res.status(existingPlan ? 200 : 201).json(plan);
    } catch (error) {
        console.error('Error creating/updating plan:', error);
        res.status(500).json({ message: 'Error creating/updating plan', error: error.message });
    }
};

// Bulk update plans
exports.bulkUpdatePlans = async (req, res) => {
    try {
        const { plans } = req.body;

        if (!Array.isArray(plans) || plans.length === 0) {
            return res.status(400).json({ message: 'Plans array is required' });
        }

        const updatedPlans = [];

        for (const planData of plans) {
            const { standard, amount, description, isActive } = planData;

            if (!standard || amount === undefined) {
                return res.status(400).json({
                    message: `Standard and amount are required for plan ${standard}`
                });
            }

            if (amount < 0) {
                return res.status(400).json({
                    message: `Amount must be non-negative for standard ${standard}`
                });
            }

            const iosAmount = parseIosAmount(planData.iosAmount);
            if (iosAmount === undefined) {
                return res.status(400).json({
                    message: `iOS amount must be a non-negative number for standard ${standard}`
                });
            }

            const updatedPlan = await SubscriptionPlan.findOneAndUpdate(
                { standard },
                { amount, iosAmount, description, isActive },
                { new: true, upsert: true, runValidators: true }
            );

            updatedPlans.push(updatedPlan);
        }

        res.json({ message: 'Plans updated successfully', plans: updatedPlans });
    } catch (error) {
        console.error('Error updating plans:', error);
        res.status(500).json({ message: 'Error updating plans', error: error.message });
    }
};

// Delete plan
exports.deletePlan = async (req, res) => {
    try {
        const { standard } = req.params;

        const plan = await SubscriptionPlan.findOneAndDelete({ standard });

        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        res.json({ message: 'Plan deleted successfully', plan });
    } catch (error) {
        console.error('Error deleting plan:', error);
        res.status(500).json({ message: 'Error deleting plan', error: error.message });
    }
};

// Initialize default plans (for first-time setup)
exports.initializeDefaultPlans = async (req, res) => {
    try {
        const defaultPlans = [
            { standard: '6', amount: 300, description: 'Standard 6' },
            { standard: '7', amount: 400, description: 'Standard 7' },
            { standard: '8', amount: 500, description: 'Standard 8' },
            { standard: '9', amount: 600, description: 'Standard 9' },
            { standard: '10', amount: 700, description: 'Standard 10' },
            { standard: '11', amount: 800, description: 'Standard 11' },
            { standard: '12', amount: 900, description: 'Standard 12' }
        ];

        const existingPlans = await SubscriptionPlan.countDocuments();

        if (existingPlans > 0) {
            return res.status(400).json({
                message: 'Plans already exist. Use update endpoint to modify.'
            });
        }

        const createdPlans = await SubscriptionPlan.insertMany(defaultPlans);

        res.status(201).json({
            message: 'Default plans initialized successfully',
            plans: createdPlans
        });
    } catch (error) {
        console.error('Error initializing default plans:', error);
        res.status(500).json({
            message: 'Error initializing default plans',
            error: error.message
        });
    }
};
