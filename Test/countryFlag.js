// This script fetches currency exchange rates and country data to create a simplified mapping
// between currencies, their exchange rates, and origin country flags

async function createSimpleCurrencyFlagMap() {
    try {
        // Fetch exchange rates
        const exchangeRateResponse = await fetch('https://api.exchangerate-api.com/v4/latest/usd');
        const exchangeRateData = await exchangeRateResponse.json();

        // Fetch country data
        const countriesResponse = await fetch('https://restcountries.com/v3.1/all?fields=name,currencies,flags,cca3');
        const countriesData = await countriesResponse.json();

        // Create a mapping of currency codes to primary country
        const currencyToCountry = {};

        // Process each country
        countriesData.forEach(country => {
            // Check if the country has currencies defined
            if (country.currencies) {
                // Get all currency codes used by this country
                const currencyCodes = Object.keys(country.currencies);

                // Map each currency to this country
                currencyCodes.forEach(currencyCode => {
                    // Only store if we haven't already assigned a country to this currency
                    // or if this is the "primary" country for this currency
                    if (!currencyToCountry[currencyCode] || isPrimaryCurrencyCountry(country, currencyCode)) {
                        currencyToCountry[currencyCode] = {
                            country: country.name.common,
                            flag: country.flags.svg || country.flags.png
                        };
                    }
                });
            }
        });

        // Create the final simplified mapping
        const result = {
            currencies: {}
        };

        // Process each currency rate
        Object.keys(exchangeRateData.rates).forEach(currencyCode => {
            // Only include if we have country data for this currency
            if (currencyToCountry[currencyCode]) {
                let flag = currencyToCountry[currencyCode].flag;
                let country = currencyToCountry[currencyCode].country;

                // Special case: Assign EU flag for EUR
                if (currencyCode === "EUR") {
                    flag = "https://flagcdn.com/eu.svg";
                    country = "European Union";
                }
                result.currencies[currencyCode] = {
                    rate: exchangeRateData.rates[currencyCode],
                    country: country,
                    flag: flag
                };
            }
        });

        // Convert to JSON string with pretty formatting
        return JSON.stringify(result, null, 2);
    } catch (error) {
        console.error('Error creating currency-flag map:', error);
        return JSON.stringify({ error: 'Failed to fetch or process data' });
    }
}

// Helper function to determine if a country is the "primary" country for a currency
function isPrimaryCurrencyCountry(country, currencyCode) {
    // Simple heuristic for primary currencies:
    // USD -> USA, EUR -> European country, GBP -> United Kingdom, etc.
    const primaryMappings = {
        "USD": "USA",
        "EUR": "EU", // European Union isn't a country but we'll match it specially
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

    // Special case for EUR and European Union
    if (currencyCode === "EUR" && country.name.common === "European Union") {
        return true;
    }

    return primaryMappings[currencyCode] === country.cca3;
}

// Execute the function and output the result
createSimpleCurrencyFlagMap().then(jsonResult => {
    console.log(jsonResult);
    // Alternatively, you could save this to a file in a Node.js environment:
    require('fs').writeFileSync('currency-flag-map-simple.json', jsonResult);
});