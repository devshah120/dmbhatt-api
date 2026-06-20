#!/usr/bin/env node

/**
 * Test Invoice Generation Script
 * Run this to test if invoice generation works
 * Usage: node scripts/test-invoice-generation.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { generateInvoice } = require('../utils/invoiceGenerator');
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

async function testInvoiceGeneration() {
    try {
        log.step(1, 'Verifying template PDF...');

        const templatePath = path.join(__dirname, '../config/invoice-template.pdf');
        if (!fs.existsSync(templatePath)) {
            log.error(`Template not found at: ${templatePath}`);
            process.exit(1);
        }
        log.success(`Template found: ${templatePath}`);

        log.step(2, 'Verifying invoices directory...');

        const invoicesDir = path.join(__dirname, '../uploads/invoices');
        if (!fs.existsSync(invoicesDir)) {
            fs.mkdirSync(invoicesDir, { recursive: true });
            log.success(`Created invoices directory: ${invoicesDir}`);
        } else {
            log.success(`Invoices directory exists: ${invoicesDir}`);
        }

        log.step(3, 'Generating test invoice...');

        const testData = {
            invoiceNumber: `TEST-${Date.now()}`,
            date: new Date(),
            studentName: 'Test Student',
            studentEmail: 'test@padhaku.com',
            studentPhone: '+91-9876543210',
            description: 'Test Material Purchase',
            amount: 299.99,
            paymentId: 'pay_test_' + Date.now()
        };

        console.log('\nTest Data:');
        console.log(`  Invoice #: ${testData.invoiceNumber}`);
        console.log(`  Student: ${testData.studentName}`);
        console.log(`  Email: ${testData.studentEmail}`);
        console.log(`  Phone: ${testData.studentPhone}`);
        console.log(`  Description: ${testData.description}`);
        console.log(`  Amount: ₹${testData.amount.toFixed(2)}`);
        console.log(`  Payment ID: ${testData.paymentId}`);

        const invoice = await generateInvoice(testData);

        log.success('Invoice generated successfully!');
        console.log('\nGenerated Invoice:');
        console.log(`  Filename: ${invoice.filename}`);
        console.log(`  Path: ${invoice.filepath}`);
        console.log(`  Size: ${(invoice.filesize / 1024).toFixed(2)} KB`);

        log.step(4, 'Verifying generated file...');

        if (fs.existsSync(invoice.filepath)) {
            log.success('Invoice file verified');
            const stats = fs.statSync(invoice.filepath);
            console.log(`  File exists: Yes`);
            console.log(`  File size: ${(stats.size / 1024).toFixed(2)} KB`);
            console.log(`  Last modified: ${stats.mtime.toLocaleString()}`);
        } else {
            log.error('Invoice file not found!');
            process.exit(1);
        }

        console.log('\n' + colors.green + '═══════════════════════════════════════════════════════════' + colors.reset);
        console.log(colors.green + 'INVOICE GENERATION TEST PASSED!' + colors.reset);
        console.log(colors.green + '═══════════════════════════════════════════════════════════' + colors.reset + '\n');

        console.log('Next step: Test SMTP email sending');
        console.log('Run: node scripts/test-smtp.js\n');

        console.log(`To view the test invoice, open:`);
        console.log(`${invoice.filepath}\n`);

        process.exit(0);

    } catch (error) {
        log.error(`Test failed: ${error.message}`);
        console.error('\nError Details:');
        console.error(error);
        process.exit(1);
    }
}

// Run test
testInvoiceGeneration();
