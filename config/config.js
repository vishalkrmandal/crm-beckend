// backend/config/config.js
require('dotenv').config();

module.exports = {
    NODE_ENV: process.env.NODE_ENV || 'production',
    PORT: process.env.PORT || 5000,
    MONGO_URI: process.env.MONGO_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRE: process.env.JWT_EXPIRE || '30d',
    EMAIL_SERVICE: process.env.EMAIL_SERVICE || 'gmail',
    EMAIL_USERNAME: process.env.EMAIL_USERNAME,
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
    EMAIL_FROM: process.env.EMAIL_FROM,
    CLIENT_URL: process.env.CLIENT_URL || 'https://raisecrm.vercel.app',
    SERVER_URL: process.env.SERVER_URL || 'https://vishal-test.testcrm.top'
};