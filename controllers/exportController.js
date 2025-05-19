// backend/controllers/exportController.js
const Ticket = require('../models/Ticket');
const { exportToExcel, exportToPDF } = require('../utils/exportUtils');
const fs = require('fs');

// @desc    Export tickets
// @route   GET /api/tickets/export
// @access  Private (Admin/Agent only)
exports.exportTickets = async (req, res) => {
    try {
        const { format } = req.query;

        if (!format || (format !== 'xlsx' && format !== 'pdf')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid export format. Use xlsx or pdf'
            });
        }

        const tickets = await Ticket.find()
            .populate('createdBy', 'firstname lastname email')
            .populate('assignedTo', 'firstname lastname email')
            .sort('-createdAt');

        let result;

        if (format === 'xlsx') {
            result = await exportToExcel(tickets);
        } else if (format === 'pdf') {
            result = await exportToPDF(tickets);
        }

        // Send file
        const filePath = result.filePath;
        const filename = result.filename;

        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        // Set appropriate content type
        if (format === 'xlsx') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        } else if (format === 'pdf') {
            res.setHeader('Content-Type', 'application/pdf');
        }

        // Stream file to response
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        // Clean up the file after it's sent
        fileStream.on('end', () => {
            fs.unlink(filePath, (err) => {
                if (err) console.error('Error deleting export file:', err);
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};