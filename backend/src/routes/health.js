/**
 * IRONMAN TOSS BOOK - Health & Diagnostics Routes
 */

const express = require('express');
const router = express.Router();
const { testConnection, dbConfig } = require('../config/db');

/**
 * GET /api/health
 * Standard health check endpoint required by architecture specification
 */
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'IRONMAN TOSS BOOK API is running',
    service: 'ironman-toss-book-api',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /api/health/db
 * Database connectivity diagnostic probe
 */
router.get('/db', async (req, res) => {
  const dbStatus = await testConnection();
  
  res.status(dbStatus.connected ? 200 : 503).json({
    success: dbStatus.connected,
    service: 'ironman-toss-book-api',
    database: {
      status: dbStatus.status,
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      details: dbStatus.message,
      ...(dbStatus.error ? { code: dbStatus.error } : {})
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
