/**
 * IRONMAN TOSS BOOK - Database Configuration & Diagnostics Module
 * Handles MySQL connection pool setup and non-blocking connectivity diagnostics.
 */

const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  database: process.env.DB_NAME || 'ironman_toss_book',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
  queueLimit: 0,
  connectTimeout: 3000 // 3 seconds timeout for diagnostics
};

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
    connectionLimit: dbConfig.connectionLimit
  }
};
