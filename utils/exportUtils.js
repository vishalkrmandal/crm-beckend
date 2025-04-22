// Backend/utils/exportUtils.js
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');

// Export data to Excel
exports.generateExcel = async (transactions) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transactions');

    // Add headers
    worksheet.columns = [
        { header: 'Date & Time', key: 'date', width: 20 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Description', key: 'description', width: 30 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Account', key: 'account', width: 15 },
        { header: 'Status', key: 'status', width: 15 }
    ];

    // Add rows
    transactions.forEach(transaction => {
        worksheet.addRow({
            date: transaction.formattedDate,
            type: transaction.type,
            description: transaction.description,
            amount: transaction.amount,
            account: transaction.account,
            status: transaction.status
        });
    });

    // Format headers
    worksheet.getRow(1).font = { bold: true };

    // Format amount column
    worksheet.getColumn('amount').eachCell({ includeEmpty: false }, function (cell, rowNumber) {
        if (rowNumber > 1) {
            const value = cell.value.toString();
            if (value.startsWith('+')) {
                cell.font = { color: { argb: '00AA00' } }; // Green for positive amounts
            } else {
                cell.font = { color: { argb: 'FF0000' } }; // Red for negative amounts
            }
        }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
};

// Export data to PDF
exports.generatePDF = async (transactions) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 30, size: 'A4' });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            // Add title
            doc.fontSize(18).text('Transaction History', { align: 'center' });
            doc.moveDown();

            // Add timestamp
            doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
            doc.moveDown();

            // Format data for the table
            const tableData = {
                headers: ['Date & Time', 'Type', 'Description', 'Amount', 'Account', 'Status'],
                rows: transactions.map(t => [
                    t.formattedDate,
                    t.type,
                    t.description,
                    t.amount,
                    t.account,
                    t.status
                ])
            };

            // Add table
            doc.table(tableData, {
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
                prepareRow: (row, i) => doc.font('Helvetica').fontSize(10),
                width: 500
            });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
};