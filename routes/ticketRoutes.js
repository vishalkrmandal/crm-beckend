// backend/routes/ticketRoutes.js (updated)
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const {
    createTicket,
    getTickets,
    getTicketById,
    updateTicket,
    addMessage,
    getTicketStats,
    getClientTicketStats,
    getClientTickets
} = require('../controllers/ticketController');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/tickets/');
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

// Filter to accept only images and PDFs
const fileFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|pdf/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(new Error('Only image and PDF files are allowed!'));
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
    fileFilter: fileFilter
});

// Routes for client and admin
router.post('/', protect, upload.single('attachment'), createTicket);
router.get('/', protect, getTickets);
router.get('/stats', protect, authorize('agent', 'admin', 'superadmin'), getTicketStats);
router.get('/:id', protect, getTicketById);
router.put('/:id', protect, authorize('agent', 'admin', 'superadmin'), updateTicket);
router.post('/:id/messages', protect, upload.single('attachment'), addMessage);

router.get('/client/:clientId/stats', protect, authorize('agent', 'admin', 'superadmin'), getClientTicketStats);
router.get('/client/:clientId/all', protect, authorize('agent', 'admin', 'superadmin'), getClientTickets);

module.exports = router;