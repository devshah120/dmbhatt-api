const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate invoice PDF from scratch with proper formatting
 */
const generateInvoice = async (invoiceData) => {
    return new Promise((resolve, reject) => {
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

            // Create filename
            const filename = `invoice_${invoiceNumber}_${Date.now()}.pdf`;
            const filepath = path.join(invoicesDir, filename);

            // Create a new PDF document
            const doc = new PDFDocument({
                size: 'A4',
                margin: 30
            });

            // Pipe to file
            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // ===== HEADER WITH LOGO =====
            // Add logo image
            const logoPath = path.join(__dirname, '../config/splash_logo.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 50, 20, { width: 40, height: 40 });
            }

            // Company name
            doc.fontSize(24)
                .font('Helvetica-Bold')
                .fillColor('#0085B3')
                .text('PADHAKU DESK', 100, 28);

            // Reset color
            doc.fillColor('#000000');

            // Invoice title in top right
            doc.fontSize(14)
                .font('Helvetica-Bold')
                .text('Invoice', 450, 35);

            // Date in top right
            const invoiceDate = new Date(date);
            const formattedDate = `${String(invoiceDate.getDate()).padStart(2, '0')}/${String(invoiceDate.getMonth() + 1).padStart(2, '0')}/${invoiceDate.getFullYear()}`;

            doc.fontSize(10)
                .font('Helvetica')
                .text(`Date: ${formattedDate}`, 450, 55);

            // ===== DIVIDER LINE =====
            doc.moveTo(50, 80)
                .lineTo(550, 80)
                .stroke('#cccccc');

            // ===== FROM AND BILL TO SECTION =====
            // FROM section
            doc.fontSize(11)
                .font('Helvetica-Bold')
                .fillColor('#000000')
                .text('FROM', 50, 100);

            doc.fontSize(9)
                .font('Helvetica')
                .text('PADHAKU DESK', 50, 120);

            // BILL TO section
            doc.fontSize(11)
                .font('Helvetica-Bold')
                .text('BILL TO', 320, 100);

            doc.fontSize(9)
                .font('Helvetica')
                .text(studentName || 'N/A', 320, 120)
                .text(studentEmail || 'N/A', 320, 133)
                .text(studentPhone || 'N/A', 320, 146);

            // ===== TABLE SECTION =====
            const tableTop = 200;
            const col1X = 50;    // SL
            const col2X = 130;   // Description
            const col3X = 450;   // Amount

            // Table header with background
            doc.rect(50, tableTop, 510, 25)
                .fillAndStroke('#f5f5f5', '#cccccc');

            doc.fillColor('#000000')
                .fontSize(10)
                .font('Helvetica-Bold')
                .text('SL', col1X + 5, tableTop + 7)
                .text('Description', col2X + 5, tableTop + 7)
                .text('Amount', col3X + 5, tableTop + 7);

            // Table body - Item row
            const rowHeight = 70;
            const rowY = tableTop + 25;

            // Row border
            doc.rect(50, rowY, 510, rowHeight)
                .stroke('#cccccc');

            // Row content
            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#000000')
                .text('1', col1X + 5, rowY + 5)
                .text(description || 'Product/Service', col2X + 5, rowY + 5, { width: 300 })
                .text(`Rs. ${amount.toFixed(2)}`, col3X + 5, rowY + 5);

            // Total row
            const totalY = rowY + rowHeight;
            doc.rect(50, totalY, 510, 35)
                .stroke('#cccccc');

            doc.fontSize(11)
                .font('Helvetica-Bold')
                .text('Total', col1X + 5, totalY + 8)
                .text(`Rs. ${amount.toFixed(2)}`, col3X + 5, totalY + 8);

            // ===== INVOICE DETAILS SECTION =====
            const detailsY = totalY + 50;
            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#666666')
                .text(`Invoice #: ${invoiceNumber}`, 50, detailsY)
                .text(`Payment ID: ${paymentId}`, 50, detailsY + 12)
                .text(`Generated: ${new Date().toLocaleString('en-IN')}`, 50, detailsY + 24);

            // ===== FOOTER =====
            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#999999')
                .text('Thank you for your purchase!', 50, 700)
                .text('This is an automatically generated invoice. No signature required.', 50, 713)
                .text('© 2026 Padhaku Desk. All rights reserved.', 50, 726);

            // Finalize PDF
            doc.end();

            // Handle stream events
            stream.on('finish', () => {
                resolve({
                    filename,
                    filepath,
                    filesize: fs.statSync(filepath).size
                });
            });

            stream.on('error', (err) => {
                reject(err);
            });

        } catch (error) {
            reject(error);
        }
    });
};

module.exports = { generateInvoice };
