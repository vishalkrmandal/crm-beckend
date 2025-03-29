// controllers/exchangeController.js
const Exchange = require('../models/Exchange');
const axios = require('axios');

// Helper function to get live exchange rate
const getLiveExchangeRate = async (fromCurrency, toCurrency) => {
    try {
        const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
        return response.data.rates[toCurrency];
    } catch (error) {
        console.error('Error fetching live exchange rate:', error);
        return null;
    }
};

exports.createExchange = async (req, res) => {
    try {
        const {
            fromCurrency,
            toCurrency,
            exchangeRate,
            type,
            isCustomRate
        } = req.body;

        // If not a custom rate, fetch live rate
        const finalExchangeRate = isCustomRate
            ? exchangeRate
            : await getLiveExchangeRate(fromCurrency.code, toCurrency.code);

        const exchange = await Exchange.create({
            fromCurrency,
            toCurrency,
            exchangeRate: finalExchangeRate,
            type,
            isCustomRate,
            createdBy: req.user._id
        });

        res.status(201).json({
            success: true,
            data: exchange
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getAllExchanges = async (req, res) => {
    try {
        const exchanges = await Exchange.find();
        res.status(200).json({
            success: true,
            data: exchanges
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateExchange = async (req, res) => {
    try {
        const exchange = await Exchange.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!exchange) {
            return res.status(404).json({
                success: false,
                message: 'Exchange not found'
            });
        }

        res.status(200).json({
            success: true,
            data: exchange
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteExchange = async (req, res) => {
    try {
        const exchange = await Exchange.findByIdAndDelete(req.params.id);

        if (!exchange) {
            return res.status(404).json({
                success: false,
                message: 'Exchange not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};