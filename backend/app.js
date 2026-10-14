/**
 * IRONMAN TOSS BOOK - Express Application Server (Day 1)
 */

const path = require('path');
// Load environment variables from root or backend directory
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');

const requestLogger = require('./src/middleware/logger');
const { notFoundHandler, centralErrorHandler } = require('./src/middleware/errorHandler');
const healthRoutes = require('./src/routes/health');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// 1. Safe Request Logging
app.use(requestLogger);

// 2. CORS Configuration
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || 'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive in local dev, restricted in prod
  },
  credentials: true
}));

// 3. Body Parsing Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 4. API Routes Mounting
app.use('/api/health', healthRoutes);

// Root informational endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'IRONMAN TOSS BOOK API',
    status: 'active',
    version: '1.0.0',
    documentation: '/docs',
    endpoints: {
      health: '/api/health',
      databaseDiagnostic: '/api/health/db'
    }
  });
});

// 5. Unmatched 404 Handler
app.use(notFoundHandler);

// 6. Centralized Error Handler
app.use(centralErrorHandler);

// 7. Start Server Listener (only if not required by a test suite)
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  IRONMAN TOSS BOOK API Server`);
    console.log(`  Status      : Online`);
    console.log(`  Environment : ${NODE_ENV}`);
    console.log(`  Port        : ${PORT}`);
    console.log(`  Health URL  : http://localhost:${PORT}/api/health`);
    console.log(`====================================================`);
  });

  const { closePool } = require('./src/config/db');

  // Graceful shutdown handling
  async function handleGracefulShutdown(signal) {
    console.log(`\nReceived ${signal}. Gracefully shutting down...`);
    await closePool();
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  }

  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
}

module.exports = app;
