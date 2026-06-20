#!/usr/bin/env node

/**
 * SMTP Configuration Test Script
 * Run this to test if SMTP is properly configured
 * Usage: node scripts/test-smtp.js
 */

const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const NotificationConfig = require('../models/NotificationConfig');
require('dotenv').config();

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
    step: (num, msg) => console.log(`\n${colors.blue}Step ${num}: ${msg}${colors.reset}`)
};

async function testSMTP() {
    try {
        log.step(1, 'Connecting to MongoDB...');

        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dmbhatt');
        log.success('Connected to MongoDB');

        log.step(2, 'Fetching SMTP configuration...');

        const config = await NotificationConfig.findOne();

        if (!config) {
            log.error('No SMTP configuration found in database');
            log.info('Create configuration in admin panel: Settings → Email Configuration');
            await mongoose.disconnect();
            process.exit(1);
        }

        if (!config.emailHost || !config.emailUser || !config.emailPassword) {
            log.error('SMTP configuration is incomplete');
            console.log('\nRequired fields:');
            console.log(`  emailHost: ${config.emailHost ? '✓' : '✗'} (${config.emailHost || 'missing'})`);
            console.log(`  emailPort: ${config.emailPort ? '✓' : '✗'} (${config.emailPort || 'missing'})`);
            console.log(`  emailUser: ${config.emailUser ? '✓' : '✗'} (${config.emailUser ? config.emailUser.substring(0, 10) + '***' : 'missing'})`);
            console.log(`  emailPassword: ${config.emailPassword ? '✓' : '✗'}`);
            await mongoose.disconnect();
            process.exit(1);
        }

        log.success('SMTP configuration found');
        console.log('\nConfiguration Details:');
        console.log(`  Host: ${config.emailHost}`);
        console.log(`  Port: ${config.emailPort}`);
        console.log(`  User: ${config.emailUser}`);
        console.log(`  From Name: ${config.emailFromName || '(default)'}`);
        console.log(`  Enabled: ${config.emailEnabled}`);

        log.step(3, 'Testing SMTP connection...');

        const transporter = nodemailer.createTransport({
            host: config.emailHost,
            port: parseInt(config.emailPort),
            secure: parseInt(config.emailPort) === 465,
            auth: {
                user: config.emailUser,
                pass: config.emailPassword
            }
        });

        const verification = await new Promise((resolve, reject) => {
            transporter.verify((error, success) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(success);
                }
            });
        });

        if (!verification) {
            log.error('SMTP connection verification failed');
            await mongoose.disconnect();
            process.exit(1);
        }

        log.success('SMTP connection successful!');

        log.step(4, 'Sending test email...');

        const testEmail = process.env.TEST_EMAIL || 'test@example.com';
        console.log(`Sending test email to: ${testEmail}`);

        try {
            const info = await transporter.sendMail({
                from: `"${config.emailFromName || 'Padhaku Desk'}" <${config.emailUser}>`,
                to: testEmail,
                subject: 'SMTP Configuration Test - Padhaku Desk',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background-color: #0085B3; color: white; padding: 20px; border-radius: 8px;">
                            <h1 style="margin: 0;">SMTP Test Email</h1>
                            <p style="margin: 10px 0 0 0;">Your email configuration is working correctly!</p>
                        </div>
                        <div style="padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd;">
                            <p>Dear Admin,</p>
                            <p>This test email confirms that your SMTP configuration is working properly.</p>
                            <div style="background-color: white; padding: 15px; border-left: 4px solid #0085B3; margin: 20px 0;">
                                <strong>Configuration Details:</strong>
                                <ul style="margin: 10px 0;">
                                    <li>Host: ${config.emailHost}</li>
                                    <li>Port: ${config.emailPort}</li>
                                    <li>From: ${config.emailFromName || 'Padhaku Desk'}</li>
                                    <li>Time: ${new Date().toLocaleString()}</li>
                                </ul>
                            </div>
                            <p>Your invoice email system is now ready to send invoice confirmations to students!</p>
                            <p>Best regards,<br><strong>Padhaku Desk</strong></p>
                        </div>
                        <div style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #999;">
                            <p style="margin: 0;">© 2024 Padhaku Desk. All rights reserved.</p>
                        </div>
                    </div>
                `
            });

            log.success('Test email sent successfully!');
            console.log(`  Message ID: ${info.messageId}`);
            console.log(`  Response: ${info.response}`);

        } catch (emailError) {
            log.error(`Failed to send test email: ${emailError.message}`);
            console.log('\nTroubleshooting tips:');
            console.log('1. Verify email credentials are correct');
            console.log('2. If using Gmail, use an App Password (not your main password)');
            console.log('3. Check if "Less secure apps" is enabled (Gmail)');
            console.log('4. Verify firewall/network allows outbound SMTP');
            console.log('5. Check SMTP server status and availability');

            await mongoose.disconnect();
            process.exit(1);
        }

        console.log('\n' + colors.green + '═══════════════════════════════════════════════════════════' + colors.reset);
        console.log(colors.green + 'SMTP CONFIGURATION TEST PASSED!' + colors.reset);
        console.log(colors.green + '═══════════════════════════════════════════════════════════' + colors.reset + '\n');

        console.log('Your email system is configured and working correctly!');
        console.log(`\nCheck the email: ${testEmail}`);
        console.log('(Check spam/promotions folder if not in inbox)\n');

        console.log('Invoice email system is now ready to:');
        console.log('  • Send invoice confirmations after product purchases');
        console.log('  • Send upgrade confirmations');
        console.log('  • Resend invoices to students\n');

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        log.error(`Test failed: ${error.message}`);
        console.error('\nError Details:');
        console.error(error);

        console.log('\nCommon Issues:');
        console.log('1. Database connection failed');
        console.log('   → Verify MongoDB is running');
        console.log('   → Check MONGODB_URI in .env\n');
        console.log('2. SMTP configuration not found');
        console.log('   → Configure in admin panel');
        console.log('   → Or create with: node scripts/configure-smtp.js\n');
        console.log('3. Email authentication failed');
        console.log('   → Verify email/password in configuration');
        console.log('   → Use app-specific password for Gmail\n');

        process.exit(1);
    }
}

// Run test
testSMTP();
