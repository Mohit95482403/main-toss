/**
 * IRONMAN TOSS BOOK - Express Application Server (Day 1)
 */

const path = require('path');
const fs = require('fs');
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
const matchRoutes = require('./src/routes/matches');
const betRoutes = require('./src/routes/bets');
const passbookRoutes = require('./src/routes/passbook');
const walletRoutes = require('./src/routes/wallet');
const { initializeDatabase } = require('./src/config/initDb');
const { seedAdmin } = require('./src/config/seedAdmin');
const { validateEnvironment } = require('./src/config/envValidator');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// 1. Production Reverse Proxy Trust (ALB, Nginx, Cloudflare, Heroku/Render)
if (NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// 2. HTTP Security Headers
app.use(securityHeaders);

// 3. Safe Request Logging
app.use(requestLogger);

// 4. CORS Configuration
function buildAllowedOrigins() {
  const defaults = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ];
  const list = [...defaults];
  const addOrigin = (raw) => {
    if (!raw) return;
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (trimmed && !list.includes(trimmed)) {
      list.push(trimmed);
    }
  };

  addOrigin(process.env.FRONTEND_ORIGIN);
  addOrigin(process.env.FRONTEND_URL);

  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach(addOrigin);
  }

  return list;
}

const allowedOrigins = buildAllowedOrigins();
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === 'true';

app.use(cors({
  origin: function (origin, callback) {
    // Allow non-browser requests (e.g. curl, server-to-server, health checks)
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/+$/, '');

    // Check explicit whitelist
    if (allowedOrigins.includes(normalized)) {
      return callback(null, true);
    }

    // Optional: allow *.vercel.app preview deployments if configured
    if (allowVercelPreviews && /^https:\/\/[a-z0-9\-]+(\-[a-z0-9]+)?\.vercel\.app$/i.test(normalized)) {
      return callback(null, true);
    }

    if (NODE_ENV === 'production') {
      // In production, reject unauthorized origins cleanly without throwing a 500 error
      return callback(null, false);
    }

    // In development, allow origin
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// 5. Body Parsing & Compression Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(compression);

// 6. Static Frontend Serving (Serves user interface and static assets)
const SERVE_STATIC_FRONTEND = process.env.SERVE_STATIC_FRONTEND !== 'false';
const frontendDir = path.resolve(__dirname, '../frontend');
if (SERVE_STATIC_FRONTEND) {
  app.use(express.static(frontendDir, {
    index: false,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));
}

// 6.5 Persistent Static Uploads Serving (Team Logos & Media)
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(path.join(uploadsDir, 'team-logos'), { recursive: true });
}
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// 7. API Routes Mounting
// Mount health checks at both /health and /api/health for Render/cloud load balancer compatibility
app.use(['/health', '/api/health'], healthRoutes);
app.get(['/healthz', '/live'], (req, res) => res.status(200).json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/passbook', passbookRoutes);
app.use('/api/wallet', walletRoutes);

// Direct admin page route alias
app.get(['/admin', '/admin.html', '/admin/'], (req, res) => {
  res.redirect('/pages/admin.html');
});

// Root informational endpoint
app.get('/', (req, res) => {
  if (SERVE_STATIC_FRONTEND && req.accepts('html') && req.get('accept') && req.get('accept').includes('text/html')) {
    return res.sendFile(path.join(frontendDir, 'index.html'));
  }
  res.status(200).json({
    service: 'DADDY TOSS BOOK API',
    status: 'active',
    version: '1.0.0-day19',
    environment: NODE_ENV,
    documentation: '/docs',
    endpoints: {
      health: '/api/health',
      healthLive: '/api/health/live',
      healthReady: '/api/health/ready',
      databaseDiagnostic: '/api/health/db',
      authRegister: 'POST /api/auth/register',
      authLogin: 'POST /api/auth/login',
      authMe: 'GET /api/auth/me',
      authProfile: 'PUT /api/auth/profile',
      authPassword: 'POST /api/auth/change-password',
      authLogout: 'POST /api/auth/logout',
      adminStats: 'GET /api/admin/dashboard/stats',
      adminUsers: 'GET /api/admin/users',
      adminUserCreate: 'POST /api/admin/users/create',
      adminUserDetail: 'GET /api/admin/users/:id',
      adminUserStatus: 'PUT /api/admin/users/:id/status',
      adminUserRole: 'PUT /api/admin/users/:id/role',
      adminAuditLogs: 'GET /api/admin/audit-logs',
      adminSystemStatus: 'GET /api/admin/system/status'
    }
  });
});

// 8. Unmatched 404 Handler
app.use(notFoundHandler);

// 9. Centralized Error Handler
app.use(centralErrorHandler);

// 10. Start Server Listener (only if not required by a test suite)
if (require.main === module) {
  // Validate Environment Variables on Startup
  const envCheck = validateEnvironment();
  if (envCheck.warnings && envCheck.warnings.length > 0) {
    envCheck.warnings.forEach(w => console.warn('[STARTUP WARNING]', w));
  }
  if (!envCheck.valid && envCheck.isProduction) {
    console.error('[STARTUP CRITICAL ERROR] Production environment validation failed:');
    envCheck.errors.forEach(e => console.error('  - ', e));
    process.exit(1);
  }

  // Ensure tables and root administrator exist
  initializeDatabase()
    .then(() => seedAdmin())
    .catch((err) => {
      console.warn('[STARTUP] Database auto-initialization note:', err.message);
    });

  const HOST = process.env.HOST || '0.0.0.0';
  const server = app.listen(PORT, HOST, () => {
    console.log(`====================================================`);
    console.log(`  DADDY TOSS BOOK API Server`);
    console.log(`  Status      : Online`);
    console.log(`  Environment : ${NODE_ENV}`);
    console.log(`  Host        : ${HOST}`);
    console.log(`  Port        : ${PORT}`);
    console.log(`  Health URL  : http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/health`);
    console.log(`  Liveness    : http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api/health/live`);
    console.log(`  Readiness   : http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api/health/ready`);
    console.log(`====================================================`);
  });

  const { closePool } = require('./src/config/db');

  // Hardened Graceful shutdown handling with 10s deadline
  async function handleGracefulShutdown(signal) {
    console.log(`\nReceived ${signal}. Gracefully shutting down...`);
    const shutdownTimer = setTimeout(() => {
      console.error('[SHUTDOWN] Forceful shutdown triggered after 10s timeout.');
      process.exit(1);
    }, 10000);
    shutdownTimer.unref();

    try {
      await closePool();
      server.close(() => {
        console.log('[SHUTDOWN] HTTP server closed gracefully.');
        process.exit(0);
      });
    } catch (shutdownErr) {
      console.error('[SHUTDOWN ERROR]', shutdownErr.message);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
}

module.exports = app;
