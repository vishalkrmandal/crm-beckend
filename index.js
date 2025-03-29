// Backend\index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const config = require('./config/config');
const authRoutes = require('./routes/authRoutes');
const leverageRoutes = require('./routes/leverageRoutes');
const groupRoutes = require('./routes/groupRoutes');
const paymentMethodRoutes = require('./routes/paymentMethodRoutes');
const exchangeRoutes = require('./routes/exchangeRoutes');


// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend URL
  credentials: true
}));

// Logging in development
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leverages', leverageRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/api/exchanges', exchangeRoutes);

// Error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message,
    stack: config.NODE_ENV === 'production' ? '🥞' : err.stack
  });
});

const PORT = config.PORT;

app.listen(PORT, () => {
  console.log(`Server running in ${config.NODE_ENV} mode on port ${PORT}`);
});