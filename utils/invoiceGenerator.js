const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { PDFDocument: PDFLib } = require('pdf-lib');
const fetch = require('node-fetch');

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

            // Create filename
            const filename = `invoice_${invoiceNumber}_${Date.now()}.pdf`;
            const filepath = path.join(invoicesDir, filename);

            // Create a new PDF document (overlay on blank page with template styling)
            const doc = new PDFDocument({
                size: 'A4',
                margin: 40
            });

            // Pipe to file
            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // ===== HEADER SECTION =====
            // Logo and Company Name
            doc.fontSize(26)
                .font('Helvetica-Bold')
                .fillColor('#0085B3')
                .text('PADHAKU DESK', 50, 50);

            // Reset color
            doc.fillColor('#000000');

            // Invoice title in top right
            doc.fontSize(16)
                .font('Helvetica-Bold')
                .text('Invoice', 450, 50);

            // Date in top right
            doc.fontSize(10)
                .font('Helvetica')
                .text(`Date : ${new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })}`, 450, 75);

            // ===== FROM AND BILL TO SECTION =====
            // FROM section
            doc.fontSize(12)
                .font('Helvetica-Bold')
                .fillColor('#f0f0f0')
                .rect(50, 110, 250, 20)
                .fill();

            doc.fillColor('#000000')
                .fontSize(12)
                .font('Helvetica-Bold')
                .text('FROM', 55, 115);

            doc.fontSize(9)
                .font('Helvetica')
                .text('PADHAKU DESK', 50, 135)
                .text('409, RADHEKISHAN VILLA,', 50, 148)
                .text('ABOVE SBI BANK, GOWINDVADI,', 50, 161)
                .text('ISANPUR.', 50, 174);

            // BILL TO section
            doc.fontSize(12)
                .font('Helvetica-Bold')
                .fillColor('#f0f0f0')
                .rect(320, 110, 250, 20)
                .fill();

            doc.fillColor('#000000')
                .text('BILL TO', 325, 115);

            doc.fontSize(9)
                .font('Helvetica')
                .text(studentName || 'N/A', 320, 135)
                .text(studentEmail || 'N/A', 320, 148)
                .text(studentPhone || 'N/A', 320, 161);

            // ===== TABLE SECTION =====
            const tableTop = 210;
            const col1X = 50;    // SL (width: 40)
            const col2X = 100;   // Description (width: 310)
            const col3X = 420;   // Amount (width: 90)

            // Table header with background
            doc.fillColor('#ffffff')
                .rect(50, tableTop, 510, 25)
                .fill()
                .stroke();

            doc.fillColor('#000000')
                .fontSize(10)
                .font('Helvetica-Bold')
                .text('SL', col1X + 5, tableTop + 5)
                .text('Description', col2X + 5, tableTop + 5)
                .text('Amount', col3X + 5, tableTop + 5);

            // Table body - Item row
            const rowHeight = 70;
            const rowY = tableTop + 25;

            // Row border
            doc.rect(50, rowY, 510, rowHeight).stroke();

            // Row content
            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#000000')
                .text('1', col1X + 5, rowY + 5)
                .text(description || 'Product/Service', col2X + 5, rowY + 5, { width: 310 })
                .text(`₹ ${amount.toFixed(2)}`, col3X + 5, rowY + 5);

            // Total row
            const totalY = rowY + rowHeight;
            doc.rect(50, totalY, 510, 35).stroke();

            doc.fontSize(11)
                .font('Helvetica-Bold')
                .text('Total', col1X + 5, totalY + 7)
                .text(`₹ ${amount.toFixed(2)}`, col3X + 5, totalY + 7);

            // ===== INVOICE DETAILS SECTION =====
            const detailsY = totalY + 45;
            doc.fontSize(8)
                .font('Helvetica')
                .text(`Invoice #: ${invoiceNumber}`, 50, detailsY)
                .text(`Payment ID: ${paymentId}`, 50, detailsY + 12)
                .text(`Generated: ${new Date().toLocaleString('en-IN')}`, 50, detailsY + 24);

            // ===== FOOTER =====
            doc.fontSize(8)
                .font('Helvetica')
                .text('Thank you for your purchase!', 50, 700)
                .text('This is an automatically generated invoice. No signature required.', 50, 713);

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
