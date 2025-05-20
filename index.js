// Backend\index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const path = require('path');
const connectDB = require('./config/db');
const config = require('./config/config');
const setupWebSocket = require('./utils/socketServer');

// Import routes
const authRoutes = require('./routes/authRoutes');
const leverageRoutes = require('./routes/leverageRoutes');
const groupRoutes = require('./routes/groupRoutes');
const paymentMethodRoutes = require('./routes/paymentMethodRoutes');
const exchangeRoutes = require('./routes/exchangeRoutes');
const accountRoutes = require('./routes/accountRoutes');
const depositRoutes = require('./routes/depositRoutes');
const adminDepositRoutes = require('./routes/admin/adminDepositRoutes');
const withdrawalRoutes = require('./routes/client/withdrawalRoutes');
const adminWithdrawalRoutes = require('./routes/admin/withdrawalRoutes');
const transferRoutes = require('./routes/client/transferRoutes');
const transactionRoutes = require('./routes/client/transactionRoutes');
const profileRoutes = require('./routes/client/profileRoutes');
const clientRoutes = require('./routes/admin/clientRoutes');
const adminTransactionRoutes = require('./routes/admin/adminTransactionRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const ibConfigurationRoutes = require('./routes/admin/ibConfigurationRoutes');


// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Set up WebSocket server
const io = setupWebSocket(server);

// Middleware
app.use(express.json());
app.use(cors({
  origin: config.CLIENT_URL,
  credentials: true
}));

// Logging in development
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leverages', leverageRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/admindeposits', adminDepositRoutes);
app.use('/api/adminwithdrawals', adminWithdrawalRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/admin/transactions', adminTransactionRoutes);
app.use('/api/ib-configurations', ibConfigurationRoutes);


// Client Routes
app.use('/api/accounts', accountRoutes);
app.use('/api/clientdeposits', depositRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/profile', profileRoutes);

// Ticket routes
app.use('/api/tickets', ticketRoutes);

// Error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message,
    stack: config.NODE_ENV === 'production' ? '🥞' : err.stack
  });
});

// Start the server
const PORT = config.PORT;
server.listen(PORT, () => {
  console.log(`Server running in ${config.NODE_ENV} mode on port ${PORT}`);
});