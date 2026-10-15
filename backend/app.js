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
const securityHeaders = require('./src/middleware/securityHeaders');
const compression = require('./src/middleware/compression');
const { notFoundHandler, centralErrorHandler } = require('./src/middleware/errorHandler');
const healthRoutes = require('./src/routes/health');
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const { initializeDatabase } = require('./src/config/initDb');
const { seedAdmin } = require('./src/config/seedAdmin');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// 1. HTTP Security Headers
app.use(securityHeaders);

// 2. Safe Request Logging
app.use(requestLogger);

// 3. CORS Configuration
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || 'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (NODE_ENV === 'production') {
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS policy: Access denied for this origin.'));
    }
    return callback(null, true);
  },
  credentials: true
}));

// 4. Body Parsing & Compression Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(compression);

// 5. API Routes Mounting
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Root informational endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'IRONMAN TOSS BOOK API',
    status: 'active',
    version: '1.0.0-day16',
    documentation: '/docs',
    endpoints: {
      health: '/api/health',
      databaseDiagnostic: '/api/health/db',
      authRegister: 'POST /api/auth/register',
      authLogin: 'POST /api/auth/login',
      authMe: 'GET /api/auth/me',
      authProfile: 'PUT /api/auth/profile',
      authPassword: 'POST /api/auth/change-password',
      authLogout: 'POST /api/auth/logout',
      adminStats: 'GET /api/admin/dashboard/stats',
      adminUsers: 'GET /api/admin/users',
      adminUserDetail: 'GET /api/admin/users/:id',
      adminUserStatus: 'PUT /api/admin/users/:id/status',
      adminUserRole: 'PUT /api/admin/users/:id/role',
      adminAuditLogs: 'GET /api/admin/audit-logs',
      adminSystemStatus: 'GET /api/admin/system/status'
    }
  });
});

// 5. Unmatched 404 Handler
app.use(notFoundHandler);

// 6. Centralized Error Handler
app.use(centralErrorHandler);

// 7. Start Server Listener (only if not required by a test suite)
if (require.main === module) {
  // Ensure tables and root administrator exist
  initializeDatabase()
    .then(() => seedAdmin())
    .catch((err) => {
      console.warn('[STARTUP] Database auto-initialization note:', err.message);
    });

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
