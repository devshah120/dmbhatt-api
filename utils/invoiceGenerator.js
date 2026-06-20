const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { PDFDocument: PDFLib } = require('pdf-lib');

/**
 * Generate invoice by overlaying template PDF with dynamic student data
 */
const generateInvoice = async (invoiceData) => {
    return new Promise(async (resolve, reject) => {
        try {
            const {
                invoiceNumber,
                date,
                studentName,
                studentEmail,
                studentPhone,
                description,
                amount,
                paymentId
            } = invoiceData;

            // Create invoices directory if it doesn't exist
            const invoicesDir = path.join(__dirname, '../uploads/invoices');
            if (!fs.existsSync(invoicesDir)) {
                fs.mkdirSync(invoicesDir, { recursive: true });
            }

            // Path to template PDF
            const templatePath = path.join(__dirname, '../config/invoice-template.pdf');

            // Load and modify template PDF
            const templateBytes = fs.readFileSync(templatePath);
            const pdfDoc = await PDFLib.load(templateBytes);
            const page = pdfDoc.getPage(0);
            const { height } = page.getSize();

            // Font setup
            const fontSize = 10;
            const smallFontSize = 8;

            // ===== OVERLAY STUDENT INFORMATION =====
            // BILL TO section (approximately x: 435, y: 235 from top based on template layout)
            page.drawText(studentName || 'N/A', {
                x: 435,
                y: height - 235,
                size: fontSize,
                color: { r: 0, g: 0, b: 0 }
            });

            page.drawText(studentEmail || 'N/A', {
                x: 435,
                y: height - 250,
                size: smallFontSize,
                color: { r: 0, g: 0, b: 0 }
            });

            page.drawText(studentPhone || 'N/A', {
                x: 435,
                y: height - 265,
                size: smallFontSize,
                color: { r: 0, g: 0, b: 0 }
            });

            // ===== INVOICE TABLE =====
            // SL Number
            page.drawText('1', {
                x: 80,
                y: height - 365,
                size: fontSize,
                color: { r: 0, g: 0, b: 0 }
            });

            // Description (wrap text if needed)
            page.drawText(description || 'Product/Service', {
                x: 130,
                y: height - 365,
                size: fontSize,
                color: { r: 0, g: 0, b: 0 },
                maxWidth: 280
            });

            // Amount
            page.drawText(`₹ ${amount.toFixed(2)}`, {
                x: 460,
                y: height - 365,
                size: fontSize,
                color: { r: 0, g: 0, b: 0 }
            });

            // ===== TOTAL AMOUNT =====
            page.drawText(`₹ ${amount.toFixed(2)}`, {
                x: 460,
                y: height - 465,
                size: 11,
                color: { r: 0, g: 0, b: 0 }
            });

            // ===== DATE FIELD =====
            const invoiceDate = new Date(date);
            const formattedDate = `${String(invoiceDate.getDate()).padStart(2, '0')}/${String(invoiceDate.getMonth() + 1).padStart(2, '0')}/${String(invoiceDate.getFullYear()).slice(-2)}`;
            page.drawText(formattedDate, {
                x: 580,
                y: height - 65,
                size: smallFontSize,
                color: { r: 0, g: 0, b: 0 }
            });

            // Save modified PDF
            const filename = `invoice_${invoiceNumber}_${Date.now()}.pdf`;
            const filepath = path.join(invoicesDir, filename);
            const pdfBytes = await pdfDoc.save();
            fs.writeFileSync(filepath, pdfBytes);

            resolve({
                filename,
                filepath,
                filesize: fs.statSync(filepath).size
            });

        } catch (error) {
            console.error('Invoice generation error:', error);
            reject(error);
        }
    });
};

module.exports = { generateInvoice };
