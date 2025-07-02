const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const {
    createAccount,
    getAccounts,
    getAccount
} = require('../controllers/client/accountController');

router.post('/create', protect, authorize('client'), createAccount);
router.get('/', protect, getAccounts);
router.get('/:accountId/refresh', protect, getAccount);

module.exports = router;