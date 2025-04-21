// routes/client/transferRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/auth');
const {
    getTransfers,
    createTransfer,
    getUserAccounts
} = require('../../controllers/client/transferController');

// Get all transfers for logged in user
router.get('/', protect, getTransfers);

// Create new transfer
router.post('/', protect, createTransfer);

// Get user accounts for transfer form
router.get('/accounts', protect, getUserAccounts);

module.exports = router;