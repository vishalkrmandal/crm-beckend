# Financial Trading Platform Backend

## Overview

This is a Node.js Express backend for a financial trading platform that manages user accounts, deposits, withdrawals, transfers, and other financial transactions. The system includes both client-facing and administrative functionalities with secure authentication.

## Features

- **Authentication & Authorization**: Secure user login and registration with JWT
- **Financial Management**:
  - Account management
  - Deposits and withdrawals
  - Internal transfers
  - Transaction history
- **Trading Features**:
  - Leverage settings
  - Exchange integrations
  - Payment method management
- **Administrative Panel**:
  - Client management
  - Transaction oversight
  - Deposit and withdrawal approval

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT, bcrypt
- **Validation**: Joi, Zod
- **File Handling**: multer, express-fileupload
- **Document Generation**: PDF (pdfkit), Excel (exceljs), Word (docx)
- **Email**: nodemailer
- **Security**: helmet, express-mongo-sanitize, express-rate-limit

## Installation

1. Clone the repository
   ```
   git clone <repository-url>
   cd backend
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Set up environment variables
   Create a `.env` file in the root directory with the following variables:
   ```
   NODE_ENV=development
   PORT=5000
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRE=30d
   ```

4. Start the development server
   ```
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - User login

### Client Endpoints
- `/api/accounts` - Account management
- `/api/clientdeposits` - Deposit funds
- `/api/withdrawals` - Request withdrawals
- `/api/transfers` - Internal transfers
- `/api/transactions` - Transaction history
- `/api/profile` - User profile management

### Admin Endpoints
- `/api/admindeposits` - Manage deposit requests
- `/api/adminwithdrawals` - Manage withdrawal requests
- `/api/clients` - Manage client accounts
- `/api/admin/transactions` - Review all transactions

### System Configuration
- `/api/leverages` - Configure leverage options
- `/api/groups` - Manage user groups
- `/api/payment-methods` - Configure payment methods
- `/api/exchanges` - Manage exchange integrations

## Configuration

Configuration settings are stored in `./config/config.js` and include:
- Environment mode (development/production)
- Port settings
- Database connection options
- Security configurations

## Security Features

This backend implements several security best practices:
- Password hashing with bcrypt
- JWT authentication
- Request rate limiting
- MongoDB query sanitization
- Helmet for secure HTTP headers

## Development

To run the server in development mode with auto-reload:
```
npm start
```

## File Structure

```
backend/
├── config/
│   ├── db.js           # Database connection
│   └── config.js       # Configuration variables
├── controllers/        # Request handlers
├── middleware/         # Custom middleware
├── models/             # Mongoose schemas
├── routes/             # API routes
│   ├── admin/          # Admin routes
│   └── client/         # Client routes
├── uploads/            # Uploaded files
├── utils/              # Helper functions
├── index.js            # Entry point
└── package.json        # Dependencies
```

## License

ISC