// backend/routes/authRoutes.js
const express = require('express');
const { signup, verifyEmail, login, adminSignup, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.post('/signup', signup);
router.post('/admin/signup', protect, authorize('superadmin'), adminSignup);
router.get('/verify-email/:token', verifyEmail);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;