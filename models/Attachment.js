// backend/models/Attachment.js
const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
    fileName: {
        type: String,
        required: [true, 'File name is required']
    },
    fileSize: {
        type: Number,
        required: [true, 'File size is required']
    },
    fileType: {
        type: String,
        required: [true, 'File type is required']
    },
    filePath: {
        type: String,
        required: [true, 'File path is required']
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Attachment = mongoose.model('Attachment', AttachmentSchema);
module.exports = Attachment;