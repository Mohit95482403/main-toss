/**
 * IRONMAN TOSS BOOK - Health & Diagnostics Routes
 */

const express = require('express');
const router = express.Router();
const { testConnection, dbConfig } = require('../config/db');

/**
 * GET /api/health or /api/health/live
 * Standard liveness probe: verifies process is responsive.
 */
function livenessProbe(req, res) {
  res.status(200).json({
    success: true,
    status: 'healthy',
    probe: 'liveness',
    service: 'ironman-toss-book-api',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
}

router.get('/', livenessProbe);
router.get('/live', livenessProbe);

/**
 * GET /api/health/db or /api/health/ready
 * Readiness probe: verifies essential dependencies (MySQL database) are responsive.
 * In production, sensitive network topology (host/port/database) is sanitized.
 */
async function readinessProbe(req, res) {
  const isProduction = process.env.NODE_ENV === 'production';
  const dbStatus = await testConnection();
  
  const response = {
    success: dbStatus.connected,
    status: dbStatus.connected ? 'ready' : 'unavailable',
    probe: 'readiness',
    service: 'ironman-toss-book-api',
    database: {
      status: dbStatus.status,
      details: dbStatus.message,
      ...(isProduction
        ? {} // Sanitize internal topology in production
        : {
            host: dbConfig.host,
            port: dbConfig.port,
            database: dbConfig.database
          }),
      ...(dbStatus.error ? { code: dbStatus.error } : {})
    },
    timestamp: new Date().toISOString()
  };

  res.status(dbStatus.connected ? 200 : 503).json(response);
}

router.get('/db', readinessProbe);
router.get('/ready', readinessProbe);

module.exports = router;
