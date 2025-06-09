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

// Import the trade sync service
const tradeSyncService = require('./services/tradeSyncService');


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
const ibConfigurationRoutes = require('./routes/admin/ibAdminConfigurationRoutes');
const adminClientRoutes = require('./routes/adminClientRoutes');
const ibClientConfigurationRoutes = require('./routes/client/ibClientConfigurationRoutes');
const ibWithdrawalRoutes = require('./routes/client/ibwithdrawalRoutes');
const tradingRoutes = require('./routes/client/tradingRoutes');
const adminDashboardRoutes = require('./routes/admin/adminDashboardRoutes');
const clientDashboardRoutes = require('./routes/client/clientDashboardRoutes');
const adminIBWithdrawalRoutes = require('./routes/admin/ibWithdrawalRoutes');

// Import the new commission routes
const commissionRoutes = require('./routes/client/commissionRoutes');


// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Set up WebSocket server
const io = setupWebSocket(server);


// Middleware
app.use(express.json());
// app.use(cors({
//   origin: config.CLIENT_URL,
//   credentials: true
// }));

app.use(cors({
  origin: "*"
}));

// Logging in development
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Sync status route (public) - Add this before authentication routes
app.get('/api/sync/status', (req, res) => {
  try {
    const syncStatus = tradeSyncService.getSyncStatus();
    res.status(200).json({
      success: true,
      syncStatus
    });
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status'
    });
  }
});


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leverages', leverageRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/admindeposits', adminDepositRoutes);
app.use('/api/adminwithdrawals', adminWithdrawalRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/admin/clients', adminClientRoutes);
app.use('/api/admin/transactions', adminTransactionRoutes);
app.use('/api/ib-configurations', ibConfigurationRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/ib-withdrawals', adminIBWithdrawalRoutes);


// Client Routes
app.use('/api/accounts', accountRoutes);
app.use('/api/clientdeposits', depositRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/ibclients/withdrawals', ibWithdrawalRoutes);
app.use('/api/ibclients/ib-configurations', ibClientConfigurationRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/client/dashboard', clientDashboardRoutes);


// Commission Routes - NEW
app.use('/api/ibclients/commission', commissionRoutes);

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


// Start the server and auto sync service
const PORT = config.PORT;
server.listen(PORT, async () => {
  console.log(`
🚀 Server is running successfully!
📍 Environment: ${process.env.NODE_ENV || 'development'}
🌐 Port: ${PORT}
📊 Database: ${process.env.MONGO_URI ? '✅ Connected' : '❌ Not configured'}
🔗 Client URL: ${process.env.CLIENT_URL || 'http://localhost:5173'}
⏰ Started at: ${new Date().toLocaleString()}
 `);

  // Start the automated trade sync service
  try {
    await tradeSyncService.startAutoSync();
    console.log('🔄 Automated trade sync service started successfully!');
  } catch (error) {
    console.error('❌ Failed to start trade sync service:', error);
  }
});