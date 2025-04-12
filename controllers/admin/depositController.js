// backend/controllers/admin/depositController.js
const Deposit = require('../../Test/Unused/Deposit');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const docx = require('docx');
const { Document, Paragraph, Table, TableRow, TableCell, TextRun } = docx;

// Get all deposits with filtering and sorting
// Get all deposits with filtering, sorting and data from related collections
exports.getDeposits = async (req, res) => {
    console.log('Get Deposits called');
    console.log('User:', req.user.id);

    try {
        const {
            search,
            status,
            planType,
            paymentMethod,
            startDate,
            endDate,
            sortField = 'requestedDate',
            sortOrder = 'desc'
        } = req.query;

        console.log('Query Params:', req.query);

        // Build match query for aggregation
        let matchQuery = {};

        // Status filter
        if (status) {
            matchQuery.status = status;
        }

        // Payment method filter
        if (paymentMethod) {
            matchQuery.paymentType = paymentMethod;
        }

        // Date range filter
        if (startDate && endDate) {
            matchQuery.transactionDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Build search conditions
        if (search) {
            // Will be enhanced in the aggregation pipeline
            matchQuery.$or = [
                // Will search in mt5Account after lookup
            ];
        }

        // First lookup and match with aggregation
        const pipeline = [
            {
                $match: matchQuery
            },
            // Join with user collection
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userData'
                }
            },
            {
                $unwind: '$userData'
            },
            // Join with accounts collection
            {
                $lookup: {
                    from: 'accounts',
                    localField: 'account',
                    foreignField: '_id',
                    as: 'accountData'
                }
            },
            {
                $unwind: '$accountData'
            },
            // Join with payment methods collection
            {
                $lookup: {
                    from: 'paymentmethods',
                    localField: 'paymentMethod',
                    foreignField: '_id',
                    as: 'paymentMethodData'
                }
            },
            {
                $unwind: {
                    path: '$paymentMethodData',
                    preserveNullAndEmptyArrays: true
                }
            }
        ];

        // Add search conditions if needed
        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        { 'accountData.mt5Account': { $regex: search, $options: 'i' } },
                        { 'userData.firstname': { $regex: search, $options: 'i' } },
                        { 'userData.lastname': { $regex: search, $options: 'i' } },
                        { 'userData.email': { $regex: search, $options: 'i' } }
                    ]
                }
            });
        }

        // Plan type filter (from account)
        if (planType) {
            pipeline.push({
                $match: {
                    'accountData.accountType': planType
                }
            });
        }

        // Add sort
        const sortObj = {};
        sortObj[sortField] = sortOrder === 'asc' ? 1 : -1;
        pipeline.push({ $sort: sortObj });

        // Project to desired format
        pipeline.push({
            $project: {
                _id: 1,
                id: "$_id",
                user: {
                    name: { $concat: ["$userData.firstname", " ", "$userData.lastname"] },
                    email: "$userData.email",
                    avatar: { $literal: "/placeholder.svg" }
                },
                accountNumber: "$accountData.mt5Account",
                amount: 1,
                planType: "$accountData.accountType",
                paymentMethod: "$paymentType",
                bonus: { $ifNull: ["$bonus", 0] },
                requestedOn: { $ifNull: ["$transactionDate", "$createdAt"] },
                approvedOn: "$approvedDate",
                rejectedOn: "$rejectedDate",
                status: "$status",
                remarks: { $ifNull: ["$remarks", "$notes"] },
                proofOfPayment: 1
            }
        });

        // Execute aggregation
        const deposits = await Deposit.aggregate(pipeline);

        console.log('Deposits:', deposits);

        return res.status(200).json({
            success: true,
            count: deposits.length,
            data: deposits
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// Get deposit by ID
exports.getDepositById = async (req, res) => {
    try {
        const deposit = await Deposit.findById(req.params.id)
            .populate('user', 'name email avatar');

        if (!deposit) {
            return res.status(404).json({
                success: false,
                message: 'Deposit not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: deposit
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// Approve deposit
exports.approveDeposit = async (req, res) => {
    try {
        const { bonus, remarks } = req.body;

        const deposit = await Deposit.findById(req.params.id);

        if (!deposit) {
            return res.status(404).json({
                success: false,
                message: 'Deposit not found'
            });
        }

        if (deposit.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: 'This deposit has already been processed'
            });
        }

        deposit.status = 'Approved';
        deposit.bonus = bonus || 0;
        deposit.remarks = remarks || 'Congratulations';
        deposit.approvedDate = Date.now();

        await deposit.save();

        return res.status(200).json({
            success: true,
            data: deposit
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// Reject deposit
exports.rejectDeposit = async (req, res) => {
    try {
        const { remarks } = req.body;

        const deposit = await Deposit.findById(req.params.id);

        if (!deposit) {
            return res.status(404).json({
                success: false,
                message: 'Deposit not found'
            });
        }

        if (deposit.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: 'This deposit has already been processed'
            });
        }

        deposit.status = 'Rejected';
        deposit.remarks = remarks;
        deposit.rejectedDate = Date.now();

        await deposit.save();

        return res.status(200).json({
            success: true,
            data: deposit
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// Export deposits
exports.exportDeposits = async (req, res) => {
    try {
        const {
            format,
            search,
            status,
            planType,
            paymentMethod,
            startDate,
            endDate
        } = req.query;

        // Build query similar to getDeposits
        let query = {};

        if (search) {
            query.$or = [
                { 'accountNumber': { $regex: search, $options: 'i' } },
                // Add user search through aggregation or populate
            ];
        }

        if (status) query.status = status;
        if (planType) query.planType = planType;
        if (paymentMethod) query.paymentMethod = paymentMethod;

        if (startDate && endDate) {
            query.requestedDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const deposits = await Deposit.find(query)
            .populate('user', 'name email');

        // Handle different export formats
        switch (format.toLowerCase()) {
            case 'excel':
                return exportExcel(deposits, res);
            case 'pdf':
                return exportPDF(deposits, res);
            case 'docx':
                return exportDOCX(deposits, res);
            case 'csv':
                return exportCSV(deposits, res);
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Unsupported export format'
                });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// Helper functions for exports
const exportExcel = async (deposits, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Deposits');

    worksheet.columns = [
        { header: 'User', key: 'user', width: 20 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Account #', key: 'accountNumber', width: 15 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Plan Type', key: 'planType', width: 15 },
        { header: 'Payment Method', key: 'paymentMethod', width: 20 },
        { header: 'Bonus', key: 'bonus', width: 10 },
        { header: 'Requested On', key: 'requestedDate', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
    ];

    deposits.forEach(deposit => {
        worksheet.addRow({
            user: deposit.user.name,
            email: deposit.user.email,
            accountNumber: deposit.accountNumber,
            amount: deposit.amount,
            planType: deposit.planType,
            paymentMethod: deposit.paymentMethod,
            bonus: deposit.bonus,
            requestedDate: new Date(deposit.requestedDate).toLocaleString(),
            status: deposit.status
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=deposits.xlsx');

    await workbook.xlsx.write(res);
    res.end();
};

const exportPDF = async (deposits, res) => {
    const doc = new PDFDocument();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=deposits.pdf');

    doc.pipe(res);

    // Add title
    doc.fontSize(16).text('Deposits Report', { align: 'center' });
    doc.moveDown();

    // Add export date
    doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown();

    // Table headers
    const tableTop = 150;
    const headers = ['User', 'Account #', 'Amount', 'Plan', 'Method', 'Status'];
    const columnWidths = [100, 80, 80, 80, 80, 80];

    let currentHeight = tableTop;

    // Draw headers
    doc.fontSize(10).font('Helvetica-Bold');
    headers.forEach((header, i) => {
        let xPos = 50;
        for (let j = 0; j < i; j++) {
            xPos += columnWidths[j];
        }
        doc.text(header, xPos, currentHeight);
    });

    doc.moveDown();
    currentHeight += 20;

    // Draw rows
    doc.font('Helvetica');
    deposits.forEach(deposit => {
        let xPos = 50;

        // Check if we need a new page
        if (currentHeight > 700) {
            doc.addPage();
            currentHeight = 50;
        }

        doc.text(deposit.user.name, xPos, currentHeight);
        xPos += columnWidths[0];

        doc.text(deposit.accountNumber, xPos, currentHeight);
        xPos += columnWidths[1];

        doc.text(`$${deposit.amount}`, xPos, currentHeight);
        xPos += columnWidths[2];

        doc.text(deposit.planType, xPos, currentHeight);
        xPos += columnWidths[3];

        doc.text(deposit.paymentMethod, xPos, currentHeight);
        xPos += columnWidths[4];

        doc.text(deposit.status, xPos, currentHeight);

        currentHeight += 20;
    });

    doc.end();
};

const exportDOCX = async (deposits, res) => {
    const doc = new Document();

    // Add title
    const title = new Paragraph({
        text: 'Deposits Report',
        heading: 'Heading1',
        alignment: 'center'
    });

    // Create table
    const rows = deposits.map(deposit => {
        return new TableRow({
            children: [
                new TableCell({ children: [new Paragraph(deposit.user.name)] }),
                new TableCell({ children: [new Paragraph(deposit.accountNumber)] }),
                new TableCell({ children: [new Paragraph(`$${deposit.amount}`)] }),
                new TableCell({ children: [new Paragraph(deposit.planType)] }),
                new TableCell({ children: [new Paragraph(deposit.paymentMethod)] }),
                new TableCell({ children: [new Paragraph(deposit.status)] }),
            ]
        });
    });

    // Add header row
    rows.unshift(
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph('User')] }),
                new TableCell({ children: [new Paragraph('Account #')] }),
                new TableCell({ children: [new Paragraph('Amount')] }),
                new TableCell({ children: [new Paragraph('Plan Type')] }),
                new TableCell({ children: [new Paragraph('Payment Method')] }),
                new TableCell({ children: [new Paragraph('Status')] }),
            ]
        })
    );

    const table = new Table({
        rows: rows
    });

    doc.addSection({
        children: [title, table]
    });

    const buffer = await docx.Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename=deposits.docx');
    res.send(buffer);
};

const exportCSV = async (deposits, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=deposits.csv');

    // CSV Header
    res.write('User,Email,Account Number,Amount,Plan Type,Payment Method,Bonus,Requested On,Status\n');

    // CSV Rows
    deposits.forEach(deposit => {
        const row = [
            deposit.user.name,
            deposit.user.email,
            deposit.accountNumber,
            deposit.amount,
            deposit.planType,
            deposit.paymentMethod,
            deposit.bonus,
            new Date(deposit.requestedDate).toLocaleString(),
            deposit.status
        ].join(',');

        res.write(row + '\n');
    });

    res.end();
};

// Get document/proof file
exports.getDocument = async (req, res) => {
    try {
        const deposit = await Deposit.findById(req.params.id);

        if (!deposit || !deposit.proofOfPayment) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        // Get file path
        const filePath = path.join(__dirname, '..', '..', 'uploads', deposit.proofOfPayment);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Document file not found'
            });
        }

        // Send file
        return res.sendFile(filePath);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};