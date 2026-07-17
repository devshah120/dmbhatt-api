/**
 * Razorpay webhook receiver.
 *
 * Razorpay captures money before our app can tell the server about it. When that
 * client call never lands — network drop, app closed, screen dismissed — the
 * payment exists only in Razorpay and the student stays Unpaid despite paying.
 * This endpoint closes that gap: Razorpay calls us server-to-server and retries
 * on failure, so recording a payment no longer depends on the student's phone.
 *
 * Setup (Razorpay Dashboard -> Settings -> Webhooks):
 *   URL:    https://<your-api-host>/api/payment/webhook/razorpay
 *   Events: payment.captured
 *   Secret: must match RAZORPAY_WEBHOOK_SECRET in .env
 */

const crypto = require('crypto');
const User = require('../models/User');
const Payment = require('../models/Payment');
const NotificationConfig = require('../models/NotificationConfig');

const getWebhookSecret = async () => {
    if (process.env.RAZORPAY_WEBHOOK_SECRET) return process.env.RAZORPAY_WEBHOOK_SECRET;
    const config = await NotificationConfig.findOne();
    return config?.razorpayWebhookSecret || null;
};

const normalizePhone = (raw) => {
    if (!raw) return null;
    // Razorpay sends "+919157543010"; users are stored as "9157543010".
    const digits = String(raw).replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits || null;
};

const normalizeEmail = (raw) => {
    if (!raw) return null;
    const email = String(raw).trim().toLowerCase();
    // Razorpay's placeholder when the payer gave no email.
    if (!email || email === 'void@razorpay.com') return null;
    return email;
};

/** Resolve a payment to one user by email, then phone. Never guesses. */
const findUserForPayment = async (entity) => {
    // notes.userId is authoritative when the app supplies it at order creation.
    const noteUserId = entity.notes?.userId;
    if (noteUserId) {
        const byId = await User.findById(noteUserId).catch(() => null);
        if (byId) return { user: byId, matchedBy: 'notes.userId' };
    }

    const email = normalizeEmail(entity.email);
    if (email) {
        const byEmail = await User.find({ email, deletedAt: null });
        if (byEmail.length === 1) return { user: byEmail[0], matchedBy: 'email' };
        if (byEmail.length > 1) return { user: null, reason: `${byEmail.length} users share ${email}` };
    }

    const phone = normalizePhone(entity.contact);
    if (phone) {
        const byPhone = await User.findOne({ phoneNum: phone, deletedAt: null });
        if (byPhone) return { user: byPhone, matchedBy: 'phone' };
    }

    return { user: null, reason: `no user matches email=${email || '-'} phone=${phone || '-'}` };
};

exports.handleRazorpayWebhook = async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];

    try {
        const secret = await getWebhookSecret();
        if (!secret) {
            console.error('[RAZORPAY_WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not configured — rejecting');
            return res.status(500).json({ message: 'Webhook secret not configured' });
        }

        // req.body is a Buffer here (express.raw on this route): the signature is
        // over the exact bytes Razorpay sent, so it must be verified before parsing.
        const rawBody = req.body;
        if (!signature || !Buffer.isBuffer(rawBody)) {
            console.warn('[RAZORPAY_WEBHOOK] Missing signature or raw body — rejecting');
            return res.status(400).json({ message: 'Invalid webhook request' });
        }

        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        const expectedBuf = Buffer.from(expected, 'utf8');
        const receivedBuf = Buffer.from(String(signature), 'utf8');

        // Constant-time compare; timingSafeEqual throws on length mismatch.
        if (expectedBuf.length !== receivedBuf.length ||
            !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
            console.warn('[RAZORPAY_WEBHOOK] Signature mismatch — rejecting');
            return res.status(400).json({ message: 'Invalid signature' });
        }

        const payload = JSON.parse(rawBody.toString('utf8'));
        const event = payload.event;
        const entity = payload.payload?.payment?.entity;

        console.log(`[RAZORPAY_WEBHOOK] Verified event: ${event} (${entity?.id || 'no entity'})`);

        // Acknowledge anything we don't act on, so Razorpay stops retrying it.
        if (event !== 'payment.captured' || !entity) {
            return res.status(200).json({ message: 'Event ignored', event });
        }

        // Idempotency: Razorpay retries, and the client may also have recorded this.
        const existing = await Payment.findOne({ razorpayPaymentId: entity.id });
        if (existing) {
            // The client path may have saved the payment but failed before isPaid.
            const owner = await User.findById(existing.userId);
            if (owner && !owner.isPaid) {
                await User.updateOne({ _id: owner._id }, { $set: { isPaid: true } });
                console.log(`[RAZORPAY_WEBHOOK] ✓ Payment ${entity.id} existed; marked ${owner.email} paid`);
            } else {
                console.log(`[RAZORPAY_WEBHOOK] Payment ${entity.id} already recorded — no action`);
            }
            return res.status(200).json({ message: 'Already recorded' });
        }

        const { user, matchedBy, reason } = await findUserForPayment(entity);
        if (!user) {
            // 200 on purpose: retrying will not conjure an account. Surfaced in logs
            // for manual reconciliation instead of looping until Razorpay gives up.
            console.error(`[RAZORPAY_WEBHOOK] ⚠ UNMATCHED payment ${entity.id} (₹${entity.amount / 100}) — ${reason}`);
            return res.status(200).json({ message: 'Acknowledged; no matching user', paymentId: entity.id });
        }

        try {
            await Payment.create({
                userId: user._id,
                razorpayOrderId: entity.order_id || `webhook_${entity.id}`,
                razorpayPaymentId: entity.id,
                // Verified by webhook HMAC over the raw body, not a client checkout callback.
                razorpaySignature: 'verified_via_webhook',
                amount: entity.amount / 100, // paise -> rupees
                currency: entity.currency || 'INR',
                status: 'captured',
                createdAt: entity.created_at ? new Date(entity.created_at * 1000) : new Date()
            });
        } catch (err) {
            // Duplicate key: the client verify call inserted this same payment in
            // the window between our existence check above and this insert. The
            // payment is recorded — fall through to ensure isPaid and ack.
            if (err.code !== 11000) throw err;
            console.log(`[RAZORPAY_WEBHOOK] Payment ${entity.id} recorded concurrently by client — no duplicate created`);
        }

        if (!user.isPaid) {
            await User.updateOne({ _id: user._id }, { $set: { isPaid: true } });
        }

        console.log(`[RAZORPAY_WEBHOOK] ✓ Recorded ${entity.id} (₹${entity.amount / 100}) for ${user.email || user.phoneNum} [matched by ${matchedBy}]`);
        return res.status(200).json({ message: 'Payment recorded', paymentId: entity.id });

    } catch (error) {
        console.error('[RAZORPAY_WEBHOOK] ✗ Handler error:', error.message, error.stack);
        // 500 so Razorpay retries — the failure may be transient (e.g. DB blip).
        return res.status(500).json({ message: 'Webhook processing failed' });
    }
};
