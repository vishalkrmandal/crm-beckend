// routes/exchangeRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const {
    createExchange,
    getAllExchanges,
    updateExchange,
    deleteExchange,
    getSupportedCurrencies
} = require('../controllers/exchangeController');

router.route('/')
    .post(protect, authorize('admin'), createExchange)
    .get(protect, getAllExchanges);

router.route('/:id')
    .put(protect, authorize('admin'), updateExchange)
    .delete(protect, authorize('admin'), deleteExchange);

router.route('/currencies')
    .get(protect, authorize('admin'), getSupportedCurrencies);

module.exports = router;