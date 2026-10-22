/**
 * IRONMAN TOSS BOOK - Database Configuration & Diagnostics Module
 * Handles MySQL connection pool setup and non-blocking connectivity diagnostics.
 */

const mysql = require('mysql2/promise');

/**
 * Build database connection configuration from environment
 * Supports discrete parameters (DB_HOST, etc.) or connection URI (DATABASE_URL / MYSQL_URL)
 */
function buildDbConfig() {
  const connectionUri = (process.env.DATABASE_URL || process.env.MYSQL_URL || '').trim();

  let sslConfig = undefined;
  if (process.env.DB_SSL === 'true') {
    let ca = undefined;
    if (process.env.DB_SSL_CA) {
      const rawCa = process.env.DB_SSL_CA.trim();
      if (rawCa.includes('BEGIN CERTIFICATE')) {
        ca = rawCa;
      } else {
        try {
          const fs = require('fs');
          const path = require('path');
          const caPath = path.resolve(rawCa);
          if (fs.existsSync(caPath)) {
            ca = fs.readFileSync(caPath, 'utf8');
          }
        } catch (_) {}
      }
    }
    sslConfig = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      ...(ca ? { ca } : {})
    };
  }

  // Parse connection URI if provided (common on Render / cloud MySQL)
  if (connectionUri) {
    try {
      const parsed = new URL(connectionUri);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '3306', 10),
        database: (parsed.pathname || '').replace(/^\//, ''),
        user: decodeURIComponent(parsed.username || 'root'),
        password: decodeURIComponent(parsed.password || ''),
        waitForConnections: true,
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
        queueLimit: 0,
        connectTimeout: 10000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        maxIdle: 10,
        idleTimeout: 60000,
        ...(sslConfig ? { ssl: sslConfig } : {})
      };
    } catch (parseErr) {
      console.warn('[DB CONFIG] Failed to parse DATABASE_URL, falling back to discrete parameters:', parseErr.message);
    }
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'ironman_toss_book',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    maxIdle: 10,
    idleTimeout: 60000,
    ...(sslConfig ? { ssl: sslConfig } : {})
  };
}

const dbConfig = buildDbConfig();

let pool = null;

/**
 * Returns or initializes the MySQL connection pool
 */
function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

/**
 * Diagnostic method to test MySQL database connectivity.
 * Accurately reports connection state without crashing the application.
 */
async function testConnection() {
  try {
    const connectionPool = getPool();
    const connection = await connectionPool.getConnection();
    try {
      const [rows] = await connection.query('SELECT 1 as test');
      return {
        connected: true,
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        status: 'online',
        message: 'Database connection established successfully'
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    return {
      connected: false,
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      status: 'unavailable',
      error: error.code || 'CONNECTION_FAILED',
      message: error.message || 'Unable to establish connection to MySQL database'
    };
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  testConnection,
  closePool,
  dbConfig: {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    connectionLimit: dbConfig.connectionLimit,
    ssl: Boolean(dbConfig.ssl)
  }
};
