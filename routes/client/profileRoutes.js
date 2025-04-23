const express = require('express');
const router = express.Router();
const profileController = require('../../controllers/client/profileController');
const { protect } = require('../../middlewares/auth');

// All routes require authentication
router.use(protect);

// Get profile
router.get('/', profileController.getProfile);

// Update personal information
router.post('/personal-info', profileController.uploadDocuments, profileController.updatePersonalInfo);

// Update account details
router.post('/account-details', profileController.updateAccountDetails);

// Update wallet details
router.post('/wallet-details', profileController.updateWalletDetails);

module.exports = router;