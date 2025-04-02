const Exchange = require('../models/Exchange');
const axios = require('axios');

// Helper to fetch live exchange rates
const fetchLiveRates = async (base = 'USD') => {
    try {
        const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${base}`);
        return response.data.rates;
    } catch (error) {
        console.error('Error fetching exchange rates:', error);
        throw new Error('Unable to fetch current exchange rates');
    }
};

// Helper to fetch country data for flags
const fetchCountryData = async () => {
    try {
        const response = await axios.get('https://restcountries.com/v3.1/all?fields=name,currencies,flags,cca3');
        return response.data;
    } catch (error) {
        console.error('Error fetching country data:', error);
        throw new Error('Unable to fetch country data');
    }
};

// Get all supported currencies with flags
exports.getSupportedCurrencies = async (req, res) => {
    try {
        const [rates, countries] = await Promise.all([
            fetchLiveRates(),
            fetchCountryData()
        ]);

        const currencyMap = {};

        // Map currencies to countries for flags
        countries.forEach(country => {
            if (country.currencies) {
                Object.keys(country.currencies).forEach(currencyCode => {
                    if (!currencyMap[currencyCode] || isPrimaryCurrencyCountry(country, currencyCode)) {
                        currencyMap[currencyCode] = {
                            code: currencyCode,
                            name: country.currencies[currencyCode].name || currencyCode,
                            symbol: country.currencies[currencyCode].symbol || '',
                            country: country.name.common,
                            flag: country.flags.svg || country.flags.png
                        };
                    }
                });
            }
        });

        // Special case for EUR
        if (currencyMap['EUR']) {
            currencyMap['EUR'].flag = "https://flagcdn.com/eu.svg";
            currencyMap['EUR'].country = "European Union";
        }

        // Add exchange rates
        Object.keys(rates).forEach(code => {
            if (currencyMap[code]) {
                currencyMap[code].rate = rates[code];
            }
        });

        const result = Object.values(currencyMap);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Helper function to determine primary country for a currency
function isPrimaryCurrencyCountry(country, currencyCode) {
    const primaryMappings = {
        "USD": "USA",
        "EUR": "EU",
        "GBP": "GBR",
        "JPY": "JPN",
        "AUD": "AUS",
        "CAD": "CAN",
        "CHF": "CHE",
        "CNY": "CHN",
        "INR": "IND",
        "BRL": "BRA",
        "RUB": "RUS"
    };

    if (currencyCode === "EUR" && country.name.common === "European Union") {
        return true;
    }

    return primaryMappings[currencyCode] === country.cca3;
}

// Get all exchanges
exports.getAllExchanges = async (req, res) => {
    try {
        const exchanges = await Exchange.find().sort({ baseCurrency: 1, targetCurrency: 1 });
        res.json({
            success: true,
            data: exchanges
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get exchange rate
exports.getExchangeRate = async (req, res) => {
    try {
        const { baseCurrency, targetCurrency, type } = req.params;

        let exchange = await Exchange.findOne({
            baseCurrency,
            targetCurrency,
            type: type || 'deposit'
        });

        if (!exchange) {
            // If no custom rate found, get live rate
            const rates = await fetchLiveRates(baseCurrency);
            const rate = rates[targetCurrency];

            if (!rate) {
                return res.status(404).json({
                    success: false,
                    message: `Exchange rate for ${baseCurrency} to ${targetCurrency} not found`
                });
            }

            return res.json({
                success: true,
                data: {
                    baseCurrency,
                    targetCurrency,
                    rate,
                    isCustomRate: false,
                    type: type || 'deposit'
                }
            });
        }

        res.json({
            success: true,
            data: exchange
        });

        console.log(res.data);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Create exchange rate
exports.createExchange = async (req, res) => {
    try {
        const { baseCurrency, targetCurrency, rate, type } = req.body;

        // Validate inputs
        if (!baseCurrency || !targetCurrency || !rate || !type) {
            return res.status(400).json({
                success: false,
                message: 'Base currency, target currency, rate, and type are required'
            });
        }

        // Check if exchange already exists
        const existingExchange = await Exchange.findOne({
            baseCurrency,
            targetCurrency,
            type
        });

        if (existingExchange) {
            return res.status(400).json({
                success: false,
                message: 'Exchange rate already exists. Use update endpoint.'
            });
        }

        // Create new exchange
        const exchange = new Exchange({
            baseCurrency,
            targetCurrency,
            rate,
            type,
            isCustomRate: true
        });

        await exchange.save();

        res.status(201).json({
            success: true,
            data: exchange
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Update exchange rate
exports.updateExchange = async (req, res) => {
    try {
        const { id } = req.params;
        const { rate, type } = req.body;

        if (!rate) {
            return res.status(400).json({
                success: false,
                message: 'Rate is required'
            });
        }

        const exchange = await Exchange.findByIdAndUpdate(
            id,
            {
                rate,
                type: type || 'deposit',
                isCustomRate: true,
                lastUpdated: Date.now()
            },
            { new: true }
        );

        if (!exchange) {
            return res.status(404).json({
                success: false,
                message: 'Exchange not found'
            });
        }

        res.json({
            success: true,
            data: exchange
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Delete exchange
exports.deleteExchange = async (req, res) => {
    try {
        const { id } = req.params;

        const exchange = await Exchange.findByIdAndDelete(id);

        if (!exchange) {
            return res.status(404).json({
                success: false,
                message: 'Exchange not found'
            });
        }

        res.json({
            success: true,
            message: 'Exchange deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};