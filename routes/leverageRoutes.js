// backend/routes/leverageRoutes.js
const express = require('express');
const {
    getLeverages,
    createLeverage,
    updateLeverage,
    deleteLeverage
} = require('../controllers/leverageController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
    .get(getLeverages)
    .post(protect, authorize('admin'), createLeverage);

router.route('/:id')
    .put(protect, authorize('admin'), updateLeverage)
    .delete(protect, authorize('admin'), deleteLeverage);

module.exports = router;