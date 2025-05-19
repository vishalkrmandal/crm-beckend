const fs = require('fs');
const path = require('path');
const Attachment = require('../models/Attachment');

/**
 * Create an attachment record in the database
 * @param {Object} file - The uploaded file information
 * @param {String} userId - The ID of the user who uploaded the file
 * @returns {Promise<Object>} - The created attachment object
 */
exports.createAttachment = async (file, userId) => {
    // Ensure the uploads directory exists
    const uploadDir = path.join(__dirname, '..', 'uploads', 'tickets');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Create attachment record
    const attachment = new Attachment({
        fileName: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
        filePath: file.path,
        uploadedBy: userId
    });

    await attachment.save();
    return attachment;
};

/**
 * Delete an attachment file and record
 * @param {String} attachmentId - The ID of the attachment to delete
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
exports.deleteAttachment = async (attachmentId) => {
    try {
        const attachment = await Attachment.findById(attachmentId);

        if (!attachment) {
            return false;
        }

        // Delete the file from the filesystem
        if (fs.existsSync(attachment.filePath)) {
            fs.unlinkSync(attachment.filePath);
        }

        // Delete the attachment record
        await Attachment.findByIdAndDelete(attachmentId);
        return true;
    } catch (error) {
        console.error('Error deleting attachment:', error);
        return false;
    }
};