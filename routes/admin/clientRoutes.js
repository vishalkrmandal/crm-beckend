// Backend\routes\admin\clientRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth');
const {
    getAllClients,
    getClientDetails,
    updateClient,
    updateClientPassword,
    getClientPassword,
    suspendClient,
    activateClient,
    exportToExcel,
    exportToPdf,
    getUserAccounts,
    getAccountDetails
} = require('../../controllers/admin/clientController');

// Protected routes
router.use(protect);

// Admin/Superadmin only routes
router.use(authorize('admin', 'superadmin'));

// Get all clients
router.get('/', getAllClients);

// Get single client
router.get('/:id', getClientDetails);

// Update client
router.put('/:id', updateClient);

// Password management
router.put('/:id/update-password', updateClientPassword);
router.get('/:id/password', getClientPassword);

// Status management
router.put('/:id/suspend', suspendClient);
router.put('/:id/activate', activateClient);

// Export data
router.get('/export/excel', exportToExcel);
router.get('/export/pdf', exportToPdf);

// Get accounts for a specific user
router.get('/users/:userId/accounts', protect, authorize('admin'), getUserAccounts);

module.exports = router;