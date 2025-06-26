// backend/controllers/admin/depositController.js
const Deposit = require('../../models/Deposit');
const Account = require('../../models/client/Account');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const docx = require('docx');
const { Document, Paragraph, Table, TableRow, TableCell, TextRun } = docx;
const axios = require('axios'); // Add this import

// Get all deposits with filtering and sorting
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
            sortField = 'updatedAt', // Default to updatedAt for latest modifications first
            sortOrder = 'desc', // Default to desc for latest first
            page = 1,
            limit = 10
        } = req.query;

        console.log('Query Params:', req.query);
        console.log('Search term:', search);
        console.log('Applied filters:', { status, planType, paymentMethod, startDate, endDate });

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

        // Add search conditions if needed (after lookups to access joined data)
        if (search && search.trim()) {
            pipeline.push({
                $match: {
                    $or: [
                        { 'accountData.mt5Account': { $regex: search.trim(), $options: 'i' } },
                        { 'userData.firstname': { $regex: search.trim(), $options: 'i' } },
                        { 'userData.lastname': { $regex: search.trim(), $options: 'i' } },
                        { 'userData.email': { $regex: search.trim(), $options: 'i' } },
                        { 'paymentMethodData.name': { $regex: search.trim(), $options: 'i' } },
                        { $expr: { $regexMatch: { input: { $toString: "$amount" }, regex: search.trim(), options: "i" } } },
                        { 'status': { $regex: search.trim(), $options: 'i' } },
                        { 'remarks': { $regex: search.trim(), $options: 'i' } },
                        { 'notes': { $regex: search.trim(), $options: 'i' } }
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

        // Map frontend sort fields to actual database fields
        let actualSortField;
        switch (sortField) {
            case 'requestedOn':
            case 'requestedDate':
                actualSortField = 'transactionDate';
                break;
            case 'approvedOn':
                actualSortField = 'approvedDate';
                break;
            case 'rejectedOn':
                actualSortField = 'rejectedDate';
                break;
            case 'amount':
                actualSortField = 'amount';
                break;
            case 'status':
                actualSortField = 'status';
                break;
            case 'updatedAt':
                actualSortField = 'updatedAt';
                break;
            case 'createdAt':
                actualSortField = 'createdAt';
                break;
            default:
                actualSortField = 'updatedAt';
        }

        // Create sort object - PRIORITIZE updatedAt for latest data first
        const sortObj = {};

        // Always sort by updatedAt first (latest modifications first)
        sortObj['updatedAt'] = sortOrder === 'asc' ? 1 : -1;

        // If user selected a different field, add it as secondary sort
        if (actualSortField !== 'updatedAt') {
            sortObj[actualSortField] = sortOrder === 'asc' ? 1 : -1;
        }

        // Add createdAt as final fallback
        sortObj['createdAt'] = sortOrder === 'asc' ? 1 : -1;

        console.log('Sort object:', sortObj);
        pipeline.push({ $sort: sortObj });

        // Get total count for pagination (before skip/limit)
        const countPipeline = [...pipeline];
        countPipeline.push({ $count: "total" });
        const countResult = await Deposit.aggregate(countPipeline);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        // Add pagination
        const pageNumber = parseInt(page);
        const pageSize = parseInt(limit);
        const skip = (pageNumber - 1) * pageSize;

        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: pageSize });

        // Project to desired format
        pipeline.push({
            $project: {
                _id: 1,
                id: "$_id",
                user: {
                    name: { $concat: ["$userData.firstname", " ", "$userData.lastname"] },
                    email: "$userData.email"
                },
                accountNumber: "$accountData.mt5Account",
                amount: 1,
                planType: "$accountData.accountType",
                paymentMethod: "$paymentType",
                bonus: { $ifNull: ["$bonus", 0] },
                requestedOn: {
                    $ifNull: [
                        "$transactionDate",
                        "$createdAt"
                    ]
                },
                approvedOn: "$approvedDate",
                rejectedOn: "$rejectedDate",
                status: "$status",
                remarks: { $ifNull: ["$remarks", "$notes"] },
                proofOfPayment: 1,
                // Keep raw dates for debugging
                rawTransactionDate: "$transactionDate",
                rawCreatedAt: "$createdAt",
                rawUpdatedAt: "$updatedAt"
            }
        });

        // Execute aggregation
        console.log('Final pipeline stages:', pipeline.length);
        console.log('Sorting by:', sortObj);

        const deposits = await Deposit.aggregate(pipeline);

        // Log first few results to verify sorting
        if (deposits.length > 0) {
            console.log('First deposit updatedAt:', deposits[0].rawUpdatedAt);
            console.log('Second deposit updatedAt:', deposits[1]?.rawUpdatedAt);
        }

        return res.status(200).json({
            success: true,
            count: deposits.length,
            total: total,
            pages: Math.ceil(total / pageSize),
            currentPage: pageNumber,
            hasNextPage: pageNumber < Math.ceil(total / pageSize),
            hasPrevPage: pageNumber > 1,
            data: deposits
        });

    } catch (error) {
        console.error('Error in getDeposits:', error);
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
            .populate('user', 'name email');

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

// Approve deposit with external API integration
exports.approveDeposit = async (req, res) => {
    try {
        const { bonus, remarks } = req.body;

        // Find the deposit and populate account data
        let deposit = await Deposit.findById(req.params.id).populate('account');

        if (!deposit) {
            return res.status(404).json({
                success: false,
                message: 'Deposit not found'
            });
        }

        // Get Manager Index from environment variables
        // const managerIndex = process.env.Manager_Index || '1';
        const managerIndex = deposit.account.managerIndex || '1';
        const mt5Account = deposit.account.mt5Account;
        const totalAmount = deposit.amount + (bonus || 0);

        console.log('Processing deposit approval:', {
            depositId: deposit._id,
            mt5Account: mt5Account,
            originalAmount: deposit.amount,
            bonus: bonus || 0,
            totalAmount: totalAmount,
            managerIndex: managerIndex
        });

        try {
            // Step 1: Make deposit through external API
            const depositApiUrl = `https://api.infoapi.biz/api/mt5/MakeDepositBalance`;
            const depositParams = {
                Manager_Index: managerIndex,
                MT5Account: mt5Account,
                Amount: totalAmount,
                Comment: `Deposit approval - ID: ${deposit._id}`
            };

            console.log('Making deposit API call:', depositParams);

            const depositResponse = await axios.get(depositApiUrl, {
                params: depositParams,
                timeout: 30000 // 30 seconds timeout
            });

            console.log('Deposit API Response:', depositResponse.data);

            // Check if deposit was successful
            if (!depositResponse.data || depositResponse.data.error) {
                throw new Error(`Deposit API failed: ${depositResponse.data?.message || 'Unknown error'}`);
            }

            // Step 2: Get updated balance and equity
            const balanceApiUrl = `https://api.infoapi.biz/api/mt5/GetUserInfo`;
            const balanceParams = {
                Manager_Index: managerIndex,
                MT5Account: mt5Account
            };

            console.log('Making balance check API call:', balanceParams);

            const balanceResponse = await axios.get(balanceApiUrl, {
                params: balanceParams,
                timeout: 30000 // 30 seconds timeout
            });

            console.log('Balance API Response:', balanceResponse.data);

            // Check if balance API was successful
            if (!balanceResponse.data || balanceResponse.data.error) {
                throw new Error(`Balance API failed: ${balanceResponse.data?.message || 'Unknown error'}`);
            }

            // Extract balance and equity from response
            const userInfo = balanceResponse.data;
            const newBalance = userInfo.Balance || userInfo.balance || 0;
            const newEquity = userInfo.Equity || userInfo.equity || 0;

            console.log('Updated account info:', {
                balance: newBalance,
                equity: newEquity
            });

            // Step 3: Update account balance and equity in database
            await Account.findByIdAndUpdate(deposit.account._id, {
                balance: newBalance,
                equity: newEquity
            });

            // Step 4: Update deposit status
            deposit.status = 'Approved';
            deposit.approvedDate = Date.now();
            deposit.bonus = bonus || 0;
            deposit.remarks = remarks || '';

            // Save the changes
            await deposit.save();

            // Trigger notifications
            if (req.notificationTriggers) {
                await req.notificationTriggers.handleDepositStatusChange(
                    deposit.toObject(),
                    'Pending' // Previous status before approval
                );
            }

            // Populate user information for the response
            await deposit.populate('user', 'firstname lastname email');

            console.log('Deposit approved successfully:', {
                depositId: deposit._id,
                newBalance: newBalance,
                newEquity: newEquity
            });

            return res.status(200).json({
                success: true,
                data: deposit,
                accountInfo: {
                    balance: newBalance,
                    equity: newEquity
                }
            });

        } catch (apiError) {
            console.error('External API Error:', apiError.message);

            // Return specific error for API failures
            return res.status(400).json({
                success: false,
                message: `Failed to process deposit: ${apiError.message}`,
                error: 'EXTERNAL_API_ERROR'
            });
        }

    } catch (error) {
        console.error('Approve Deposit Error:', error);
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

        // Find the deposit
        let deposit = await Deposit.findById(req.params.id);

        if (!deposit) {
            return res.status(404).json({
                success: false,
                message: 'Deposit not found'
            });
        }

        // Update deposit status
        deposit.status = 'Rejected';
        deposit.rejectedDate = Date.now();
        deposit.remarks = remarks || '';

        // Save the changes
        await deposit.save();

        // Trigger notifications
        if (req.notificationTriggers) {
            await req.notificationTriggers.handleDepositStatusChange(
                deposit.toObject(),
                'Pending' // Previous status before rejection
            );
        }

        // Populate user information for the response
        await deposit.populate('user', 'firstname lastname email');

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

        // Build match query for aggregation (same as in getDeposits)
        let matchQuery = {};

        if (status) matchQuery.status = status;
        if (paymentMethod) matchQuery.paymentType = paymentMethod;

        if (startDate && endDate) {
            matchQuery.transactionDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Use the same aggregation pipeline as getDeposits
        const pipeline = [
            { $match: matchQuery },
            // Join with user collection
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userData'
                }
            },
            { $unwind: '$userData' },
            // Join with accounts collection
            {
                $lookup: {
                    from: 'accounts',
                    localField: 'account',
                    foreignField: '_id',
                    as: 'accountData'
                }
            },
            { $unwind: '$accountData' },
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

        // Plan type filter
        if (planType) {
            pipeline.push({
                $match: {
                    'accountData.accountType': planType
                }
            });
        }

        // Project to format needed for export
        pipeline.push({
            $project: {
                userName: { $concat: ["$userData.firstname", " ", "$userData.lastname"] },
                email: "$userData.email",
                accountNumber: "$accountData.mt5Account",
                amount: 1,
                planType: "$accountData.accountType",
                paymentMethod: { $ifNull: ["$paymentMethodData.name", "$paymentType"] },
                bonus: { $ifNull: ["$bonus", 0] },
                requestedDate: { $ifNull: ["$transactionDate", "$createdAt"] },
                status: "$status"
            }
        });

        // Execute aggregation
        const deposits = await Deposit.aggregate(pipeline);

        // Handle different export formats
        switch (format.toLowerCase()) {
            case 'xlsx':
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

// Then update the exportExcel function to use the correct field names
const exportExcel = async (deposits, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Deposits');

    // Define columns with proper width
    worksheet.columns = [
        { header: 'User', key: 'userName', width: 20 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Account #', key: 'accountNumber', width: 15 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Plan Type', key: 'planType', width: 15 },
        { header: 'Payment Method', key: 'paymentMethod', width: 20 },
        { header: 'Bonus', key: 'bonus', width: 10 },
        { header: 'Requested On', key: 'requestedDate', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
    ];

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    // Add the data rows
    deposits.forEach(deposit => {
        worksheet.addRow({
            userName: deposit.userName || '',
            email: deposit.email || '',
            accountNumber: deposit.accountNumber || '',
            amount: deposit.amount || 0,
            planType: deposit.planType || '',
            paymentMethod: deposit.paymentMethod || '',
            bonus: deposit.bonus || 0,
            requestedDate: deposit.requestedDate ? new Date(deposit.requestedDate).toLocaleString() : '',
            status: deposit.status || ''
        });
    });

    // Add borders to all cells
    worksheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
        row.eachCell({ includeEmpty: false }, function (cell) {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
    });

    // Format amount and bonus columns as currency
    worksheet.getColumn('amount').numFmt = '"$"#,##0.00;[Red]\-"$"#,##0.00';
    worksheet.getColumn('bonus').numFmt = '"$"#,##0.00;[Red]\-"$"#,##0.00';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=deposits.xlsx');

    await workbook.xlsx.write(res);
    res.end();
};

const exportPDF = async (deposits, res) => {
    const doc = new PDFDocument({ margin: 30 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=deposits.pdf');

    doc.pipe(res);

    // Add title
    doc.fontSize(18).font('Helvetica-Bold').text('Deposits Report', { align: 'center' });
    doc.moveDown();

    // Add export date
    doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown(2);

    // Table setup
    const tableTop = 120;
    const tableLeft = 30;
    const columnCount = 6;
    const columnWidths = [90, 80, 60, 80, 90, 70];
    const rowHeight = 20;
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

    // Headers
    const headers = ['User', 'Account #', 'Amount', 'Plan Type', 'Payment Method', 'Status'];

    // Draw table header
    doc.font('Helvetica-Bold').fontSize(10);
    let currentX = tableLeft;

    // Draw header background
    doc.rect(tableLeft, tableTop, tableWidth, rowHeight).fill('#E0E0E0');

    // Draw header text
    headers.forEach((header, i) => {
        doc.fillColor('black').text(
            header,
            currentX + 5,
            tableTop + 5,
            { width: columnWidths[i] - 10, align: 'center' }
        );
        currentX += columnWidths[i];
    });

    // Draw rows
    let currentY = tableTop + rowHeight;
    doc.font('Helvetica').fontSize(9);

    deposits.forEach((deposit, rowIndex) => {
        // Check if we need a new page
        if (currentY > 700) {
            doc.addPage();
            currentY = 50;

            // Re-draw header on new page
            currentX = tableLeft;
            doc.rect(tableLeft, currentY, tableWidth, rowHeight).fill('#E0E0E0');
            doc.font('Helvetica-Bold').fontSize(10).fillColor('black');

            headers.forEach((header, i) => {
                doc.text(
                    header,
                    currentX + 5,
                    currentY + 5,
                    { width: columnWidths[i] - 10, align: 'center' }
                );
                currentX += columnWidths[i];
            });

            currentY += rowHeight;
            doc.font('Helvetica').fontSize(9);
        }

        // Row background (alternate colors)
        doc.rect(tableLeft, currentY, tableWidth, rowHeight)
            .fillColor(rowIndex % 2 === 0 ? '#FFFFFF' : '#F9F9F9')
            .fill();

        // Draw cell borders
        doc.rect(tableLeft, currentY, tableWidth, rowHeight)
            .strokeColor('#CCCCCC')
            .stroke();

        // Draw column dividers
        let dividerX = tableLeft;
        for (let i = 0; i < columnCount - 1; i++) {
            dividerX += columnWidths[i];
            doc.moveTo(dividerX, currentY)
                .lineTo(dividerX, currentY + rowHeight)
                .strokeColor('#CCCCCC')
                .stroke();
        }

        // Cell content
        currentX = tableLeft;
        doc.fillColor('black');

        // User name
        doc.text(deposit.userName || '', currentX + 5, currentY + 5, { width: columnWidths[0] - 10 });
        currentX += columnWidths[0];

        // Account #
        doc.text(deposit.accountNumber || '', currentX + 5, currentY + 5, { width: columnWidths[1] - 10 });
        currentX += columnWidths[1];

        // Amount
        doc.text(`$${deposit.amount || 0}`, currentX + 5, currentY + 5, { width: columnWidths[2] - 10, align: 'right' });
        currentX += columnWidths[2];

        // Plan Type
        doc.text(deposit.planType || '', currentX + 5, currentY + 5, { width: columnWidths[3] - 10 });
        currentX += columnWidths[3];

        // Payment Method
        doc.text(deposit.paymentMethod || '', currentX + 5, currentY + 5, { width: columnWidths[4] - 10 });
        currentX += columnWidths[4];

        // Status
        doc.text(deposit.status || '', currentX + 5, currentY + 5, { width: columnWidths[5] - 10 });

        currentY += rowHeight;
    });

    doc.end();
};

const exportDOCX = async (deposits, res) => {
    try {
        const { Document, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, BorderStyle } = docx;

        // Create header cells with bold formatting
        const headerRow = new TableRow({
            tableHeader: true,
            height: {
                value: 400,
                rule: docx.HeightRule.EXACT
            },
            children: [
                new TableCell({
                    width: { size: 2000, type: 'dxa' },
                    shading: { fill: "E0E0E0", val: "clear" },
                    children: [new Paragraph({
                        children: [new TextRun({ text: "User", bold: true })],
                        alignment: AlignmentType.CENTER
                    })]
                }),
                new TableCell({
                    width: { size: 1500, type: 'dxa' },
                    shading: { fill: "E0E0E0", val: "clear" },
                    children: [new Paragraph({
                        children: [new TextRun({ text: "Account #", bold: true })],
                        alignment: AlignmentType.CENTER
                    })]
                }),
                new TableCell({
                    width: { size: 1200, type: 'dxa' },
                    shading: { fill: "E0E0E0", val: "clear" },
                    children: [new Paragraph({
                        children: [new TextRun({ text: "Amount", bold: true })],
                        alignment: AlignmentType.CENTER
                    })]
                }),
                new TableCell({
                    width: { size: 1500, type: 'dxa' },
                    shading: { fill: "E0E0E0", val: "clear" },
                    children: [new Paragraph({
                        children: [new TextRun({ text: "Plan Type", bold: true })],
                        alignment: AlignmentType.CENTER
                    })]
                }),
                new TableCell({
                    width: { size: 1800, type: 'dxa' },
                    shading: { fill: "E0E0E0", val: "clear" },
                    children: [new Paragraph({
                        children: [new TextRun({ text: "Payment Method", bold: true })],
                        alignment: AlignmentType.CENTER
                    })]
                }),
                new TableCell({
                    width: { size: 1200, type: 'dxa' },
                    shading: { fill: "E0E0E0", val: "clear" },
                    children: [new Paragraph({
                        children: [new TextRun({ text: "Status", bold: true })],
                        alignment: AlignmentType.CENTER
                    })]
                }),
            ]
        });

        // Create data rows
        const dataRows = deposits.map((deposit, index) => {
            const shadingColor = index % 2 === 0 ? "FFFFFF" : "F9F9F9";

            return new TableRow({
                height: {
                    value: 400,
                    rule: docx.HeightRule.EXACT
                },
                children: [
                    new TableCell({
                        shading: { fill: shadingColor, val: "clear" },
                        children: [new Paragraph({ text: deposit.userName || "" })]
                    }),
                    new TableCell({
                        shading: { fill: shadingColor, val: "clear" },
                        children: [new Paragraph({ text: deposit.accountNumber || "" })]
                    }),
                    new TableCell({
                        shading: { fill: shadingColor, val: "clear" },
                        children: [new Paragraph({
                            text: `$${deposit.amount || 0}`,
                            alignment: AlignmentType.RIGHT
                        })]
                    }),
                    new TableCell({
                        shading: { fill: shadingColor, val: "clear" },
                        children: [new Paragraph({ text: deposit.planType || "" })]
                    }),
                    new TableCell({
                        shading: { fill: shadingColor, val: "clear" },
                        children: [new Paragraph({ text: deposit.paymentMethod || "" })]
                    }),
                    new TableCell({
                        shading: { fill: shadingColor, val: "clear" },
                        children: [new Paragraph({ text: deposit.status || "" })]
                    }),
                ]
            });
        });

        // Create the table
        const table = new Table({
            rows: [headerRow, ...dataRows],
            borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }
            },
            width: {
                size: 9200,
                type: "dxa"
            }
        });

        // Create the document
        const doc = new Document({
            creator: "Your CRM System",
            title: "Deposits Report",
            description: "Export of deposit data",
            sections: [{
                children: [
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Deposits Report", bold: true, size: 32 })
                        ],
                        spacing: { after: 300 },
                        alignment: AlignmentType.CENTER
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `Generated on: ${new Date().toLocaleString()}`, size: 20 })
                        ],
                        spacing: { after: 400 },
                        alignment: AlignmentType.RIGHT
                    }),
                    table
                ]
            }]
        });

        const buffer = await docx.Packer.toBuffer(doc);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename=deposits.docx');
        res.send(buffer);
    } catch (error) {
        console.error('Error generating DOCX:', error);

        // Fallback to CSV if DOCX fails
        res.status(500).send('Error generating DOCX file');
    }
};

const exportCSV = async (deposits, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=deposits.csv');

    // CSV Header
    res.write('User,Email,Account Number,Amount,Plan Type,Payment Method,Bonus,Requested On,Status\n');

    // CSV Rows
    deposits.forEach(deposit => {
        // Handle commas in text fields by quoting them
        const formatCSVField = (field) => {
            if (field === null || field === undefined) return '""';
            const stringField = String(field);
            // If field contains commas, quotes, or newlines, wrap in quotes and escape any quotes
            if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
        };

        const row = [
            formatCSVField(deposit.userName || ''),
            formatCSVField(deposit.email || ''),
            formatCSVField(deposit.accountNumber || ''),
            deposit.amount || 0,
            formatCSVField(deposit.planType || ''),
            formatCSVField(deposit.paymentMethod || ''),
            deposit.bonus || 0,
            formatCSVField(deposit.requestedDate ? new Date(deposit.requestedDate).toLocaleString() : ''),
            formatCSVField(deposit.status || '')
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