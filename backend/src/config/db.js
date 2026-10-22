/**
 * IRONMAN TOSS BOOK - Database Configuration & Diagnostics Module
 * Handles MySQL connection pool setup and non-blocking connectivity diagnostics.
 */

const mysql = require('mysql2/promise');

/**
 * Build database connection configuration from environment
 * Supports discrete parameters (DB_HOST, etc.) or connection URI (DATABASE_URL / MYSQL_URL)
 */
const fs = require('fs');
const path = require('path');

/**
 * Resolve CA certificate from environment variables or standard secret paths
 */
function resolveSslCa() {
  const caEnv = process.env.DB_SSL_CA || process.env.AIVEN_CA_CERT || process.env.MYSQL_CA_CERT;
  if (caEnv && caEnv.trim()) {
    const raw = caEnv.trim();
    // 1. Inline PEM certificate string
    if (raw.includes('BEGIN CERTIFICATE')) {
      return raw.replace(/\\n/g, '\n');
    }
    // 2. Base64-encoded PEM string
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded.includes('BEGIN CERTIFICATE')) {
        return decoded;
      }
    } catch (_) {}
    // 3. File path
    try {
      const caPath = path.resolve(raw);
      if (fs.existsSync(caPath)) {
        return fs.readFileSync(caPath, 'utf8');
      }
    } catch (_) {}
  }

  // 4. Standard Render secret files and project CA locations
  const candidatePaths = [
    '/etc/secrets/ca.pem',
    '/etc/secrets/aiven-ca.pem',
    path.resolve(__dirname, '../../../ca.pem'),
    path.resolve(__dirname, '../../ca.pem'),
    path.resolve(__dirname, '../ca.pem')
  ];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, 'utf8');
        if (content.includes('BEGIN CERTIFICATE')) {
          return content;
        }
      }
    } catch (_) {}
  }

  return undefined;
}

/**
 * Build database connection configuration from environment
 * Supports discrete parameters (DB_HOST, etc.) or connection URI (DATABASE_URL / MYSQL_URL)
 */
function buildDbConfig() {
  const connectionUri = (process.env.DATABASE_URL || process.env.MYSQL_URL || '').trim();

  // Parse connection URI if provided (common on Render / Aiven)
  if (connectionUri) {
    try {
      const parsed = new URL(connectionUri);
      const host = parsed.hostname;
      const isAiven = host.includes('aivencloud.com') || connectionUri.includes('ssl-mode');
      const isSslRequested = process.env.DB_SSL === 'true' || isAiven;

      let sslConfig = undefined;
      if (isSslRequested) {
        const ca = resolveSslCa();
        sslConfig = {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ...(ca ? { ca } : {}),
          ...(host ? { servername: host } : {})
        };
      }

      return {
        host,
        port: parseInt(parsed.port || '3306', 10),
        database: (parsed.pathname || '').replace(/^\//, '') || 'daddy_toss_book',
        user: decodeURIComponent(parsed.username || 'root'),
        password: decodeURIComponent(parsed.password || ''),
        waitForConnections: true,
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
        queueLimit: 0,
        connectTimeout: 15000,
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

  const host = process.env.DB_HOST || 'localhost';
  const isAiven = host.includes('aivencloud.com');
  const isSslRequested = process.env.DB_SSL === 'true' || isAiven;

  let sslConfig = undefined;
  if (isSslRequested) {
    const ca = resolveSslCa();
    sslConfig = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      ...(ca ? { ca } : {}),
      ...(host ? { servername: host } : {})
    };
  }

  return {
    host,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'daddy_toss_book',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    queueLimit: 0,
    connectTimeout: 15000,
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
