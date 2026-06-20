#!/usr/bin/env node

/**
 * SMTP Configuration Setup Script
 * Interactively configure SMTP settings
 * Usage: node scripts/configure-smtp.js
 */

const readline = require('readline');
const mongoose = require('mongoose');
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
    header: (msg) => console.log(`\n${colors.blue}${msg}${colors.reset}`)
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const prompt = (question, defaultAnswer = '') => {
    return new Promise(resolve => {
        const promptText = defaultAnswer ? `${question} [${defaultAnswer}]: ` : `${question}: `;
        rl.question(promptText, answer => {
            resolve(answer || defaultAnswer);
        });
    });
};

async function configureSMTP() {
    try {
        log.header('═══════════════════════════════════════════════════════════');
        console.log('PADHAKU DESK - SMTP EMAIL CONFIGURATION');
        log.header('═══════════════════════════════════════════════════════════\n');

        log.info('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dmbhatt');
        log.success('Connected to MongoDB\n');

        // Check existing configuration
        let existingConfig = await NotificationConfig.findOne();
        if (existingConfig && existingConfig.emailHost) {
            console.log('Existing SMTP Configuration Found:');
            console.log(`  Host: ${existingConfig.emailHost}`);
            console.log(`  Port: ${existingConfig.emailPort}`);
            console.log(`  User: ${existingConfig.emailUser}`);
            console.log(`  From Name: ${existingConfig.emailFromName}\n`);

            const update = await prompt('Update configuration? (yes/no)', 'yes');
            if (update.toLowerCase() !== 'yes' && update.toLowerCase() !== 'y') {
                log.info('No changes made');
                await mongoose.disconnect();
                process.exit(0);
            }
        }

        // Predefined SMTP providers
        log.header('\nSMTP Provider Selection');
        console.log('1. Gmail (smtp.gmail.com)');
        console.log('2. Outlook (smtp.office365.com)');
        console.log('3. SendGrid (smtp.sendgrid.net)');
        console.log('4. AWS SES (email-smtp.[region].amazonaws.com)');
        console.log('5. Custom Provider\n');

        const provider = await prompt('Select provider (1-5)', '1');

        let host, port, defaultFromName;

        switch (provider) {
            case '1':
                host = 'smtp.gmail.com';
                port = '587';
                defaultFromName = 'Padhaku Desk';
                log.header('\nGMAIL CONFIGURATION');
                console.log('Note: Use App Password, not your main Gmail password');
                console.log('Steps:');
                console.log('1. Go to myaccount.google.com');
                console.log('2. Security → 2-Step Verification (enable if needed)');
                console.log('3. App passwords → Select Mail and Windows Computer');
                console.log('4. Copy the 16-character password below\n');
                break;

            case '2':
                host = 'smtp.office365.com';
                port = '587';
                defaultFromName = 'Padhaku Desk';
                log.header('\nOUTLOOK CONFIGURATION');
                console.log('Use your Outlook email and password\n');
                break;

            case '3':
                host = 'smtp.sendgrid.net';
                port = '587';
                defaultFromName = 'Padhaku Desk';
                log.header('\nSENDGRID CONFIGURATION');
                console.log('Username: apikey');
                console.log('Password: Your SendGrid API key\n');
                break;

            case '4':
                log.header('\nAWS SES CONFIGURATION');
                const region = await prompt('Enter AWS region', 'us-east-1');
                host = `email-smtp.${region}.amazonaws.com`;
                port = '587';
                defaultFromName = 'Padhaku Desk';
                console.log(`SMTP Host: ${host}\n`);
                break;

            case '5':
                log.header('\nCUSTOM SMTP CONFIGURATION\n');
                host = await prompt('SMTP Host');
                port = await prompt('SMTP Port', '587');
                defaultFromName = await prompt('From Name', 'Padhaku Desk');
                break;

            default:
                log.error('Invalid selection');
                process.exit(1);
        }

        // Get email credentials
        console.log('\nEnter SMTP Credentials:');
        const emailUser = await prompt('Email Address');
        const emailPassword = await prompt('Password/App Password');
        const emailFromName = defaultFromName ?
            await prompt('From Name', defaultFromName) :
            await prompt('From Name');

        // Enable email
        const enableEmail = await prompt('Enable email sending? (yes/no)', 'yes');

        // Summary
        log.header('\nConfiguration Summary');
        console.log(`Host: ${host}`);
        console.log(`Port: ${port}`);
        console.log(`User: ${emailUser}`);
        console.log(`From Name: ${emailFromName}`);
        console.log(`Enabled: ${enableEmail.toLowerCase() === 'yes' ? 'Yes' : 'No'}\n`);

        const confirm = await prompt('Save configuration? (yes/no)', 'yes');
        if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
            log.warning('Configuration not saved');
            await mongoose.disconnect();
            process.exit(0);
        }

        // Save configuration
        log.info('Saving configuration...');

        let config = await NotificationConfig.findOne();
        if (!config) {
            config = new NotificationConfig();
        }

        config.emailHost = host;
        config.emailPort = port;
        config.emailUser = emailUser;
        config.emailPassword = emailPassword;
        config.emailFromName = emailFromName;
        config.emailEnabled = enableEmail.toLowerCase() === 'yes';

        await config.save();
        log.success('Configuration saved successfully!\n');

        // Test connection
        const testConnection = await prompt('Test SMTP connection now? (yes/no)', 'yes');
        if (testConnection.toLowerCase() === 'yes' || testConnection.toLowerCase() === 'y') {
            log.info('Run: node scripts/test-smtp.js');
        }

        console.log('\n' + colors.green + '═══════════════════════════════════════════════════════════' + colors.reset);
        console.log(colors.green + 'SMTP CONFIGURATION COMPLETE!' + colors.reset);
        console.log(colors.green + '═══════════════════════════════════════════════════════════' + colors.reset + '\n');

        console.log('Next steps:');
        console.log('1. Test SMTP connection:');
        console.log('   node scripts/test-smtp.js\n');
        console.log('2. Test invoice generation:');
        console.log('   node scripts/test-invoice-generation.js\n');
        console.log('3. Your invoice system is now ready!');
        console.log('   Students will receive invoice emails after payments.\n');

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        log.error(`Setup failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
    rl.close();
    try {
        await mongoose.disconnect();
    } catch (e) {}
    console.log('\n\nSetup cancelled');
    process.exit(0);
});

// Run configuration
configureSMTP();
