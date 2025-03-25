// backend/config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log('MongoDB Connected:');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// // Handle cleanup on process termination
// process.on('SIGINT', async () => {
//   await syncManager.close();
//   await mongoose.connection.close();
//   process.exit(0);
// });

module.exports = connectDB;
