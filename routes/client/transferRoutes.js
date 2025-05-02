
// routes/client/transferRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth');
const { getTransfers, createTransfer, getUserAccounts } = require('../../controllers/client/transferController');

// Get all transfers (for users: their own transfers, for admins: all transfers)
router.get('/', protect, getTransfers);

// Create new transfer (only for regular users)
router.post('/', protect, createTransfer);

// Get user accounts for transfer form
router.get('/accounts', protect, getUserAccounts);

module.exports = router;