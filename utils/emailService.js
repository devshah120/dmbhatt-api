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
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [EMAIL_OTP] Starting OTP email send to: ${to}`);
    console.log(`[${timestamp}] [EMAIL_OTP] SMTP Config - Host: ${process.env.SMTP_HOST}, Port: ${process.env.SMTP_PORT}, User: ${process.env.SMTP_USER ? 'SET' : 'NOT SET'}`);

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
        console.log(`[${timestamp}] [EMAIL_OTP] Mail options prepared - From: ${mailOptions.from}`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[${timestamp}] [EMAIL_OTP] ✓ SUCCESS - Message ID: ${info.messageId}, Response: ${info.response}`);
        return true;
    } catch (error) {
        console.error(`[${timestamp}] [EMAIL_OTP] ✗ FAILED to send OTP email`);
        console.error(`[${timestamp}] [EMAIL_OTP] Error Message: ${error.message}`);
        console.error(`[${timestamp}] [EMAIL_OTP] Error Code: ${error.code}`);
        console.error(`[${timestamp}] [EMAIL_OTP] Error Details:`, error);
        throw new Error('Failed to send OTP email');
    }
};

/**
 * Send Welcome Email on Registration
 * @param {string} to - Recipient email
 * @param {string} name - The user's name
 */
const sendWelcomeEmail = async (to, name) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [EMAIL_WELCOME] Starting welcome email send to: ${to} (Name: ${name})`);
    console.log(`[${timestamp}] [EMAIL_WELCOME] SMTP Config - Host: ${process.env.SMTP_HOST}, Port: ${process.env.SMTP_PORT}, User: ${process.env.SMTP_USER ? 'SET' : 'NOT SET'}`);

    if (!process.env.SMTP_HOST) {
        console.error(`[${timestamp}] [EMAIL_WELCOME] ✗ SMTP_HOST is not configured!`);
    }
    if (!process.env.SMTP_USER) {
        console.error(`[${timestamp}] [EMAIL_WELCOME] ✗ SMTP_USER is not configured!`);
    }
    if (!process.env.SMTP_PASS) {
        console.error(`[${timestamp}] [EMAIL_WELCOME] ✗ SMTP_PASS is not configured!`);
    }

    const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME || 'Padhaku'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to: to,
        subject: 'Welcome to Padhaku - Registration Successful! 🎓',
        html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Welcome to Padhaku</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
                <div style="width: 100%; padding: 30px 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); overflow: hidden;">

                        <!-- Header with Teal Background -->
                        <div style="background: linear-gradient(135deg, #0088cc 0%, #0077bb 100%); padding: 35px 30px; text-align: left;">
                            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px;">Padhaku</h1>
                            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 13px; font-weight: 500; letter-spacing: 0.3px;">Registration Confirmation</p>
                        </div>

                        <!-- Main Content -->
                        <div style="padding: 35px 30px; background-color: #fafafa;">

                            <!-- Greeting -->
                            <p style="color: #333; font-size: 15px; margin: 0 0 20px 0; line-height: 1.6;">
                                Dear <strong>${name || 'User'}</strong>,
                            </p>

                            <!-- Welcome Message -->
                            <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                                Thank you for registering with Padhaku! Your account has been successfully created. We're excited to have you as part of our learning community.
                            </p>

                            <!-- Registration Details Box -->
                            <div style="background: white; border: 1px solid #e0e0e0; border-radius: 6px; padding: 25px; margin-bottom: 25px;">
                                <h3 style="color: #0088cc; font-size: 14px; font-weight: 600; margin: 0 0 18px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                                    Account Details
                                </h3>

                                <div style="margin-bottom: 15px;">
                                    <p style="color: #888; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.3px;">
                                        Name
                                    </p>
                                    <p style="color: #333; font-size: 14px; margin: 0; font-weight: 500;">
                                        ${name || 'User'}
                                    </p>
                                </div>

                                <div style="margin-bottom: 15px;">
                                    <p style="color: #888; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.3px;">
                                        Email
                                    </p>
                                    <p style="color: #333; font-size: 14px; margin: 0; font-weight: 500;">
                                        ${to}
                                    </p>
                                </div>

                                <div>
                                    <p style="color: #888; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.3px;">
                                        Registration Date
                                    </p>
                                    <p style="color: #333; font-size: 14px; margin: 0; font-weight: 500;">
                                        ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                    </p>
                                </div>
                            </div>

                            <!-- Features Section -->
                            <h3 style="color: #333; font-size: 14px; font-weight: 600; margin: 30px 0 18px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                                What's Next?
                            </h3>

                            <div style="margin-bottom: 25px;">
                                <div style="display: flex; align-items: flex-start; margin-bottom: 16px;">
                                    <div style="width: 28px; height: 28px; background: #0088cc; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 14px; margin-top: 0px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,136,204,0.2);">
                                        <span style="color: white; font-size: 18px; font-weight: bold; line-height: 1;">✓</span>
                                    </div>
                                    <div>
                                        <p style="color: #333; font-size: 14px; margin: 0; font-weight: 500;">Log in to your account</p>
                                        <p style="color: #777; font-size: 13px; margin: 3px 0 0 0;">Use your email and password to access Padhaku</p>
                                    </div>
                                </div>

                                <div style="display: flex; align-items: flex-start; margin-bottom: 16px;">
                                    <div style="width: 28px; height: 28px; background: #0088cc; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 14px; margin-top: 0px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,136,204,0.2);">
                                        <span style="color: white; font-size: 18px; font-weight: bold; line-height: 1;">✓</span>
                                    </div>
                                    <div>
                                        <p style="color: #333; font-size: 14px; margin: 0; font-weight: 500;">Explore learning materials</p>
                                        <p style="color: #777; font-size: 13px; margin: 3px 0 0 0;">Browse through our comprehensive study resources and content</p>
                                    </div>
                                </div>

                                <div style="display: flex; align-items: flex-start; margin-bottom: 16px;">
                                    <div style="width: 28px; height: 28px; background: #0088cc; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 14px; margin-top: 0px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,136,204,0.2);">
                                        <span style="color: white; font-size: 18px; font-weight: bold; line-height: 1;">✓</span>
                                    </div>
                                    <div>
                                        <p style="color: #333; font-size: 14px; margin: 0; font-weight: 500;">Start your learning journey</p>
                                        <p style="color: #777; font-size: 13px; margin: 3px 0 0 0;">Track your progress and earn rewards as you learn</p>
                                    </div>
                                </div>

                                <div style="display: flex; align-items: flex-start;">
                                    <div style="width: 28px; height: 28px; background: #0088cc; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 14px; margin-top: 0px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,136,204,0.2);">
                                        <span style="color: white; font-size: 18px; font-weight: bold; line-height: 1;">✓</span>
                                    </div>
                                    <div>
                                        <p style="color: #333; font-size: 14px; margin: 0; font-weight: 500;">Join our community</p>
                                        <p style="color: #777; font-size: 13px; margin: 3px 0 0 0;">Connect with other learners and get support</p>
                                    </div>
                                </div>
                            </div>

                            <!-- CTA Button -->
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="https://play.google.com/store/apps/details?id=com.bondbyte.students&hl=en_IN" style="display: inline-block; background: linear-gradient(135deg, #0088cc 0%, #0077bb 100%); color: white; padding: 12px 35px; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 14px; letter-spacing: 0.3px;">
                                    Download App Now
                                </a>
                            </div>

                            <!-- Support Section -->
                            <div style="background: #e8f4f8; border-left: 4px solid #0088cc; padding: 18px; border-radius: 4px; margin-top: 30px;">
                                <p style="color: #0088cc; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">
                                    📞 Need Help?
                                </p>
                                <p style="color: #555; font-size: 13px; margin: 0; line-height: 1.6;">
                                    If you have any questions or need assistance, don't hesitate to contact our support team. We're here to help!
                                </p>
                            </div>

                            <!-- Closing -->
                            <p style="color: #666; font-size: 13px; margin: 30px 0 0 0; line-height: 1.6;">
                                Best regards,<br>
                                <strong style="color: #0088cc;">Padhaku Desk Team</strong>
                            </p>
                        </div>

                        <!-- Footer -->
                        <div style="background: #f5f5f5; padding: 20px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="color: #888; font-size: 11px; margin: 0 0 8px 0; line-height: 1.5;">
                                &copy; 2026 Padhaku. All rights reserved.
                            </p>
                            <p style="color: #aaa; font-size: 10px; margin: 0;">
                                This is an automated message. Please do not reply to this email.
                            </p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `,
    };

    try {
        console.log(`[${timestamp}] [EMAIL_WELCOME] Mail options prepared - From: ${mailOptions.from}`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[${timestamp}] [EMAIL_WELCOME] ✓ SUCCESS - Message ID: ${info.messageId}, Response: ${info.response}`);
        return true;
    } catch (error) {
        console.error(`[${timestamp}] [EMAIL_WELCOME] ✗ FAILED to send welcome email`);
        console.error(`[${timestamp}] [EMAIL_WELCOME] Error Message: ${error.message}`);
        console.error(`[${timestamp}] [EMAIL_WELCOME] Error Code: ${error.code}`);
        console.error(`[${timestamp}] [EMAIL_WELCOME] Error Command: ${error.command}`);
        console.error(`[${timestamp}] [EMAIL_WELCOME] Full Error:`, {
            message: error.message,
            code: error.code,
            command: error.command,
            rejected: error.rejected,
            response: error.response,
            stack: error.stack
        });
        throw new Error('Failed to send welcome email');
    }
};

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail,
};
