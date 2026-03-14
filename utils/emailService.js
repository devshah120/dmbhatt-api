const nodemailer = require('nodemailer');

/**
 * Configure Nodemailer transporter
 */
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Send OTP Email
 * @param {string} to - Recipient email
 * @param {string} otp - The 6-digit OTP
 * @param {string} name - The user's name
 */
const sendOTPEmail = async (to, otp, name) => {
    const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME || 'Padhaku'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to: to,
        subject: 'Password Reset OTP - Padhaku',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #333; text-align: center;">Padhaku</h2>
                <hr>
                <p>Hello ${name || 'User'},</p>
                <p>You have requested to reset your password. Please use the following OTP to complete the process. This OTP is valid for 10 minutes.</p>
                <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
                    <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #007bff;">${otp}</span>
                </div>
                <p>If you did not request this, please ignore this email.</p>
                <hr>
                <p style="font-size: 12px; color: #777; text-align: center;">&copy; 2026 Padhaku. All rights reserved.</p>
            </div>
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[DEBUG] Email sent: ', info.messageId);
        return true;
    } catch (error) {
        console.error('[ERROR] Error sending email: ', error);
        throw new Error('Failed to send OTP email');
    }
};

module.exports = {
    sendOTPEmail,
};
