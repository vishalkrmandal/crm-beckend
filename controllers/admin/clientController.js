// Backend\controllers\admin\clientController.js
const User = require('../../models/User');
const Profile = require('../../models/client/Profile');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const Account = require('../../models/client/Account');

// @desc    Get all clients
// @route   GET /api/clients
// @access  Private (admin, superadmin)
exports.getAllClients = async (req, res) => {
    try {
        // Get clients with their profiles
        const users = await User.find({ role: 'client' }).select('-passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires');

        // Get all profiles
        const profiles = await Profile.find();

        // Map profiles to users
        const clients = users.map(user => {
            const profile = profiles.find(profile => profile.user.toString() === user._id.toString());

            return {
                id: user._id,
                name: `${user.firstname} ${user.lastname}`,
                email: user.email,
                firstname: user.firstname,
                lastname: user.lastname,
                country: user.country,
                phone: user.phone,
                dateofbirth: user.dateofbirth,
                isEmailVerified: user.isEmailVerified,
                createdAt: user.createdAt,
                status: user.status || 'activated',
                kycVerified: profile ? profile.kycVerified : false,
                kycStatus: profile ? profile.kycStatus : 'unverified',
                kycRejectReason: profile ? profile.kycRejectReason : null,
                ibPartner: profile ? profile.ibPartner : 'None',
                accountNumber: profile ? (profile.walletDetails?.accountNumber || '') : '',
                educationLevel: profile ? profile.educationLevel : '',
                otherEducation: profile ? profile.otherEducation : '',
                idDocument: profile ? profile.idDocument : '',
                address1Document: profile ? profile.address1Document : '',
                address2Document: profile ? profile.address2Document : '',
                bankDetails: profile ? profile.bankDetails : {},
                walletDetails: profile ? profile.walletDetails : {}
            };
        });

        res.status(200).json({
            success: true,
            count: clients.length,
            data: clients
        });
    } catch (error) {
        console.error('Get all clients error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching clients'
        });
    }
};

// @desc    Get client details
// @route   GET /api/clients/:id
// @access  Private (admin, superadmin)
exports.getClientDetails = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        // Get client profile
        const profile = await Profile.findOne({ user: req.params.id });

        const client = {
            id: user._id,
            firstname: user.firstname,
            lastname: user.lastname,
            email: user.email,
            country: user.country,
            phone: user.phone,
            dateofbirth: user.dateofbirth,
            isEmailVerified: user.isEmailVerified,
            status: user.status || 'activated',
            kycVerified: profile ? profile.kycVerified : false,
            kycStatus: profile ? profile.kycStatus : 'unverified',
            kycRejectReason: profile ? profile.kycRejectReason : null,
            ibPartner: profile ? profile.ibPartner : 'None',
            educationLevel: profile ? profile.educationLevel : '',
            otherEducation: profile ? profile.otherEducation : '',
            idDocument: profile ? profile.idDocument : '',
            address1Document: profile ? profile.address1Document : '',
            address2Document: profile ? profile.address2Document : '',
            bankDetails: profile ? profile.bankDetails : {},
            walletDetails: profile ? profile.walletDetails : {}
        };

        res.status(200).json({
            success: true,
            data: client
        });
    } catch (error) {
        console.error('Get client details error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching client details'
        });
    }
};



// @desc    Update client profile
// @route   PUT /api/clients/:id
// @access  Private (admin, superadmin)
exports.updateClient = async (req, res) => {
    try {
        // Validate KYC rejection reason
        if (req.body.kycStatus === 'rejected' && !req.body.kycRejectReason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required when KYC status is rejected'
            });
        }

        // Update user details including email verification
        const userUpdateData = {
            firstname: req.body.firstname,
            lastname: req.body.lastname,
            email: req.body.email,
            isEmailVerified: req.body.isEmailVerified,
            country: req.body.country,
            phone: req.body.phone,
            dateofbirth: req.body.dateofbirth,
            updatedAt: Date.now()
        };

        const user = await User.findByIdAndUpdate(req.params.id, userUpdateData, {
            new: true,
            runValidators: true
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        // Update or create profile with KYC status fields
        let profile = await Profile.findOne({ user: req.params.id });

        // Create base update data
        const profileUpdateData = {
            kycVerified: req.body.kycVerified,
            kycStatus: req.body.kycStatus || 'unverified',
            kycRejectReason: req.body.kycStatus === 'rejected' ? req.body.kycRejectReason : null,
            ibPartner: req.body.ibPartner,
            updatedAt: Date.now()
        };

        // Only add educationLevel if it's not an empty string
        if (req.body.educationLevel && req.body.educationLevel.trim() !== '') {
            profileUpdateData.educationLevel = req.body.educationLevel;

            // Only add otherEducation if educationLevel is 'other'
            if (req.body.educationLevel === 'other') {
                profileUpdateData.otherEducation = req.body.otherEducation;
            }
        }

        // Add bank and wallet details
        if (req.body.bankDetails) {
            profileUpdateData.bankDetails = req.body.bankDetails;
        }

        if (req.body.walletDetails) {
            profileUpdateData.walletDetails = req.body.walletDetails;
        }

        if (profile) {
            profile = await Profile.findOneAndUpdate({ user: req.params.id }, profileUpdateData, {
                new: true,
                runValidators: true
            });
        } else {
            profileUpdateData.user = req.params.id;
            profile = await Profile.create(profileUpdateData);
        }

        res.status(200).json({
            success: true,
            message: 'Client updated successfully',
            data: {
                user,
                profile
            }
        });
    } catch (error) {
        console.error('Update client error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating client'
        });
    }
};


// @desc    Update client password
// @route   PUT /api/clients/:id/update-password
// @access  Private (admin, superadmin)
exports.updateClientPassword = async (req, res) => {
    try {
        const { password } = req.body;

        // Hash password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Update user password
        const user = await User.findByIdAndUpdate(req.params.id, {
            password: hashedPassword,
            updatedAt: Date.now()
        }, {
            new: true,
            runValidators: true
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        // Update or create profile with plain password (encrypted)
        let profile = await Profile.findOne({ user: req.params.id });

        // Simple encryption for storing visible password (not secure, but readable)
        const encryptedPassword = Buffer.from(password).toString('base64');

        if (profile) {
            profile = await Profile.findOneAndUpdate({ user: req.params.id }, {
                password: encryptedPassword,
                updatedAt: Date.now()
            }, {
                new: true
            });
        } else {
            profile = await Profile.create({
                user: req.params.id,
                password: encryptedPassword
            });
        }

        res.status(200).json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        console.error('Update client password error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating password'
        });
    }
};

// @desc    Get client password
// @route   GET /api/clients/:id/password
// @access  Private (admin, superadmin)
exports.getClientPassword = async (req, res) => {
    try {
        const profile = await Profile.findOne({ user: req.params.id });

        if (!profile || !profile.password) {
            return res.status(404).json({
                success: false,
                message: 'Password not found'
            });
        }

        // Decrypt password
        const decryptedPassword = Buffer.from(profile.password, 'base64').toString('utf-8');

        res.status(200).json({
            success: true,
            password: decryptedPassword
        });
    } catch (error) {
        console.error('Get client password error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting password'
        });
    }
};

// @desc    Suspend client
// @route   PUT /api/clients/:id/suspend
// @access  Private (admin, superadmin)
exports.suspendClient = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, {
            status: 'suspended',
            updatedAt: Date.now()
        }, {
            new: true,
            runValidators: true
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Client suspended successfully'
        });
    } catch (error) {
        console.error('Suspend client error:', error);
        res.status(500).json({
            success: false,
            message: 'Error suspending client'
        });
    }
};

// @desc    Activate client
// @route   PUT /api/clients/:id/activate
// @access  Private (admin, superadmin)
exports.activateClient = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, {
            status: 'activated',
            updatedAt: Date.now()
        }, {
            new: true,
            runValidators: true
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Client activated successfully'
        });
    } catch (error) {
        console.error('Activate client error:', error);
        res.status(500).json({
            success: false,
            message: 'Error activating client'
        });
    }
};

// Get all accounts for a specific user
exports.getUserAccounts = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        const accounts = await Account.find({ user: userId })
            .select('mt5Account name accountType leverage balance equity profit')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: accounts.length,
            data: accounts
        });
    } catch (error) {
        console.error('Error fetching user accounts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user accounts',
            error: error.message
        });
    }
};

// Get account details by account ID
exports.getAccountDetails = async (req, res) => {
    try {
        const { accountId } = req.params;

        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID is required'
            });
        }

        const account = await Account.findById(accountId);

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        res.status(200).json({
            success: true,
            data: account
        });
    } catch (error) {
        console.error('Error fetching account details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch account details',
            error: error.message
        });
    }
};

// @desc    Export clients to Excel
// @route   GET /api/clients/export/excel
// @access  Private (admin, superadmin)
exports.exportToExcel = async (req, res) => {
    try {
        // Get all clients
        const users = await User.find({ role: 'client' }).select('-password -passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires');
        const profiles = await Profile.find();

        // Prepare data for Excel
        const clientsData = users.map(user => {
            const profile = profiles.find(profile => profile.user.toString() === user._id.toString());

            return {
                'Name': `${user.firstname} ${user.lastname}`,
                'Email': user.email,
                'Account Number': profile?.walletDetails?.accountNumber || '',
                'Email Verified': user.isEmailVerified ? 'Yes' : 'No',
                'KYC Verified': profile?.kycVerified ? 'Yes' : 'No',
                'Country': user.country.name,
                'State': user.country.state,
                'IB Partner': profile?.ibPartner || 'None',
                'Status': user.status || 'activated'
            };
        });

        // Create workbook and worksheet
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Clients');

        // Add column headers
        const headers = Object.keys(clientsData[0] || {});
        worksheet.columns = headers.map(header => ({ header, key: header, width: 20 }));

        // Add rows
        worksheet.addRows(clientsData);

        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Create a temporary file path
        const tempFilePath = path.join(__dirname, '../temp', 'clients.xlsx');

        // Ensure directory exists
        const tempDir = path.dirname(tempFilePath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Write to file
        await workbook.xlsx.writeFile(tempFilePath);

        // Send the file
        res.download(tempFilePath, 'clients.xlsx', (err) => {
            // Delete the temp file after sending
            fs.unlink(tempFilePath, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting temp excel file:', unlinkErr);
            });

            if (err) {
                console.error('Error sending excel file:', err);
                res.status(500).json({
                    success: false,
                    message: 'Error generating excel file'
                });
            }
        });
    } catch (error) {
        console.error('Export to Excel error:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting clients to Excel'
        });
    }
};

// @desc    Export clients to PDF
// @route   GET /api/clients/export/pdf
// @access  Private (admin, superadmin)
exports.exportToPdf = async (req, res) => {
    try {
        // Get all clients
        const users = await User.find({ role: 'client' }).select('-password -passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires');
        const profiles = await Profile.find();

        // Create a new PDF document with smaller margins
        const doc = new PDFDocument({
            margin: 20,
            bufferPages: true,
            size: 'A4',
            layout: 'landscape' // Switch to landscape for more width
        });

        // Create a temporary file path
        const tempFilePath = path.join(__dirname, '../temp', 'clients.pdf');

        // Ensure directory exists
        const tempDir = path.dirname(tempFilePath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Pipe PDF document to a write stream
        const stream = fs.createWriteStream(tempFilePath);
        doc.pipe(stream);

        // Add title and date
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#003366')
            .text('Clients List', { align: 'center' });

        doc.fontSize(9).fillColor('#666666')
            .text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(1);

        // Table configuration
        const tableTop = 80; // Reduced from 120
        const tableHeaders = ['Name', 'Email', 'Account No.', 'Email Verified', 'KYC Verified', 'Country', 'IB Partner', 'Status'];

        // Proportionally divide available width - adjusted for better fit
        const availableWidth = doc.page.width - (2 * doc.page.margins.left);
        const colWidths = [
            Math.floor(availableWidth * 0.15), // Name
            Math.floor(availableWidth * 0.20), // Email
            Math.floor(availableWidth * 0.15), // Account No
            Math.floor(availableWidth * 0.10), // Email Verified
            Math.floor(availableWidth * 0.10), // KYC Verified
            Math.floor(availableWidth * 0.10), // Country
            Math.floor(availableWidth * 0.10), // IB Partner
            Math.floor(availableWidth * 0.10)  // Status
        ];

        const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
        const cellPadding = 5; // Reduced from 8
        const lineHeight = 20; // Reduced from 25
        const fontSize = 8; // Smaller font size

        const headerColor = '#003366';
        const evenRowColor = '#f2f2f2';
        const oddRowColor = '#ffffff';
        const borderColor = '#cccccc';
        const textColor = '#333333';

        // Helper function to truncate text if needed
        const truncateText = (text, maxLength = 25) => {
            if (!text) return '';
            return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
        };

        // Collect table data
        const tableData = users.map(user => {
            const profile = profiles.find(profile => profile.user.toString() === user._id.toString());

            return [
                truncateText(`${user.firstname} ${user.lastname}`, 30),
                truncateText(user.email, 35),
                truncateText(profile?.walletDetails?.accountNumber || '', 20),
                user.isEmailVerified ? 'Yes' : 'No',
                profile?.kycVerified ? 'Yes' : 'No',
                truncateText(user.country.name, 20),
                truncateText(profile?.ibPartner || 'None', 20),
                user.status || 'activated'
            ];
        });

        // Calculate table limits
        const pageHeight = doc.page.height - doc.page.margins.bottom - doc.page.margins.top;
        const maxRowsPerPage = Math.floor((pageHeight - tableTop + doc.y) / lineHeight) - 2; // Subtract for header
        let pageCount = 1;

        // Draw table function
        const drawTableHeader = (y) => {
            // Draw header background
            doc.fillColor(headerColor)
                .rect(doc.page.margins.left, y, tableWidth, lineHeight)
                .fill();

            // Draw header text
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(fontSize);
            let xPos = doc.page.margins.left + cellPadding;

            tableHeaders.forEach((header, i) => {
                doc.text(header, xPos, y + cellPadding, {
                    width: colWidths[i] - (2 * cellPadding),
                    align: 'left'
                });
                xPos += colWidths[i];
            });

            return y + lineHeight;
        };

        const drawTableRow = (row, y, isEven) => {
            // Draw row background
            doc.fillColor(isEven ? evenRowColor : oddRowColor)
                .rect(doc.page.margins.left, y, tableWidth, lineHeight)
                .fill();

            // Draw cell borders
            doc.lineWidth(0.5).strokeColor(borderColor);

            // Draw row data
            doc.fillColor(textColor).font('Helvetica').fontSize(fontSize);
            let xPos = doc.page.margins.left + cellPadding;

            row.forEach((cell, i) => {
                doc.text(cell.toString(), xPos, y + cellPadding, {
                    width: colWidths[i] - (2 * cellPadding),
                    align: 'left'
                });
                xPos += colWidths[i];
            });

            // Draw horizontal line at bottom of row
            doc.moveTo(doc.page.margins.left, y + lineHeight)
                .lineTo(doc.page.margins.left + tableWidth, y + lineHeight)
                .stroke();

            return y + lineHeight;
        };

        // Draw vertical lines for the table
        const drawVerticalLines = (startY, endY) => {
            doc.lineWidth(0.5).strokeColor(borderColor);
            let xPos = doc.page.margins.left;

            // Draw left border
            doc.moveTo(xPos, startY)
                .lineTo(xPos, endY)
                .stroke();

            // Draw column dividers
            colWidths.forEach(width => {
                xPos += width;
                doc.moveTo(xPos, startY)
                    .lineTo(xPos, endY)
                    .stroke();
            });
        };

        // Add page number to current page
        const addPageNumber = (pageNum, totalPages) => {
            doc.fontSize(8).fillColor('#666666')
                .text(
                    `Page ${pageNum} of ${totalPages}`,
                    doc.page.margins.left,
                    doc.page.height - doc.page.margins.bottom - 15,
                    { align: 'center', width: tableWidth }
                );
        };

        // Start drawing the table
        let currentY = tableTop;
        currentY = drawTableHeader(currentY);

        // Calculate total pages
        const totalPages = Math.ceil(tableData.length / maxRowsPerPage) || 1;

        // Draw table data rows
        tableData.forEach((row, rowIndex) => {
            // Check if we need a new page
            if (rowIndex > 0 && rowIndex % maxRowsPerPage === 0) {
                // Draw vertical lines for the current page
                drawVerticalLines(tableTop, currentY);

                // Add page number to current page
                addPageNumber(pageCount, totalPages);
                pageCount++;

                // Add new page
                doc.addPage({
                    margin: 20,
                    size: 'A4',
                    layout: 'landscape'
                });
                currentY = doc.page.margins.top;
                currentY = drawTableHeader(currentY);
            }

            currentY = drawTableRow(row, currentY, rowIndex % 2 === 0);
        });

        // Draw final vertical lines
        drawVerticalLines(tableTop, currentY);

        // Add page number to the last page
        addPageNumber(pageCount, totalPages);

        // Finalize the PDF
        doc.end();

        // Wait for the PDF to be written
        stream.on('finish', () => {
            // Send the file
            res.download(tempFilePath, 'clients.pdf', (err) => {
                // Delete the temp file after sending
                fs.unlink(tempFilePath, (unlinkErr) => {
                    if (unlinkErr) console.error('Error deleting temp PDF file:', unlinkErr);
                });

                if (err) {
                    console.error('Error sending PDF file:', err);
                    res.status(500).json({
                        success: false,
                        message: 'Error generating PDF file'
                    });
                }
            });
        });
    } catch (error) {
        console.error('Export to PDF error:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting clients to PDF'
        });
    }
};