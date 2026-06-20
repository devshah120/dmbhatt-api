#!/usr/bin/env node

/**
 * Invoice System Setup Script
 * Run this once to initialize the invoice system
 * Usage: node scripts/setup-invoice-system.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const Invoice = require('../models/Invoice');
const NotificationConfig = require('../models/NotificationConfig');

// Colors for console output
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

async function setupInvoiceSystem() {
    try {
        log.step(1, 'Connecting to MongoDB...');

        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dmbhatt');
        log.success('Connected to MongoDB');

        // Step 2: Create invoices directory
        log.step(2, 'Creating invoices directory...');

        const invoicesDir = path.join(__dirname, '../uploads/invoices');
        if (!fs.existsSync(invoicesDir)) {
            fs.mkdirSync(invoicesDir, { recursive: true });
            log.success(`Created directory: ${invoicesDir}`);
        } else {
            log.info(`Directory already exists: ${invoicesDir}`);
        }

        // Step 3: Verify template PDF exists
        log.step(3, 'Verifying invoice template...');

        const templatePath = path.join(__dirname, '../config/invoice-template.pdf');
        if (fs.existsSync(templatePath)) {
            const stats = fs.statSync(templatePath);
            log.success(`Template found: ${templatePath} (${(stats.size / 1024).toFixed(2)} KB)`);
        } else {
            log.error(`Template not found: ${templatePath}`);
            log.warning('Please place invoice-template.pdf in config/ directory');
        }

        // Step 4: Check SMTP Configuration
        log.step(4, 'Checking SMTP configuration...');

        const config = await NotificationConfig.findOne();
        if (config && config.emailHost && config.emailUser && config.emailPassword) {
            log.success('SMTP configuration found:');
            console.log(`  Host: ${config.emailHost}`);
            console.log(`  Port: ${config.emailPort}`);
            console.log(`  User: ${config.emailUser}`);
            console.log(`  From Name: ${config.emailFromName}`);
            console.log(`  Email Enabled: ${config.emailEnabled}`);
        } else {
            log.warning('SMTP not configured. Invoices will be generated but emails won\'t be sent.');
            log.info('Configure SMTP in admin panel or run: node scripts/configure-smtp.js');
        }

        // Step 5: Initialize Invoice collection
        log.step(5, 'Initializing Invoice collection...');

        try {
            const count = await Invoice.countDocuments();
            log.success(`Invoice collection ready (${count} invoices)`);

            // Create index for faster queries
            await Invoice.collection.createIndex({ userId: 1, createdAt: -1 });
            log.success('Created database index for user invoices');
        } catch (err) {
            log.error(`Failed to initialize Invoice collection: ${err.message}`);
        }

        // Step 6: Verify dependencies
        log.step(6, 'Verifying npm dependencies...');

        const dependencies = ['nodemailer', 'pdfkit', 'pdf-lib', 'razorpay'];
        const packageJsonPath = path.join(__dirname, '../package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        dependencies.forEach(dep => {
            if (allDeps[dep]) {
                log.success(`${dep} (${allDeps[dep]})`);
            } else {
                log.error(`${dep} not found in package.json`);
            }
        });

        // Step 7: Generate test invoice (optional)
        log.step(7, 'Invoice system setup complete!');

        console.log('\n' + colors.green + '═══════════════════════════════════════════════════════════' + colors.reset);
        console.log(colors.green + 'INVOICE SYSTEM INITIALIZED SUCCESSFULLY!' + colors.reset);
        console.log(colors.green + '═══════════════════════════════════════════════════════════' + colors.reset + '\n');

        console.log('Next steps:');
        console.log('1. Configure SMTP settings:');
        console.log('   → Admin panel → Settings → Email Configuration');
        console.log('   → Or run: node scripts/configure-smtp.js\n');
        console.log('2. Test invoice generation:');
        console.log('   → node scripts/test-invoice-generation.js\n');
        console.log('3. Test email sending:');
        console.log('   → node scripts/test-smtp.js\n');
        console.log('4. Review documentation:');
        console.log('   → INVOICE_IMPLEMENTATION_GUIDE.md');
        console.log('   → INVOICE_SETUP_CHECKLIST.md\n');

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        log.error(`Setup failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Run setup
setupInvoiceSystem();
