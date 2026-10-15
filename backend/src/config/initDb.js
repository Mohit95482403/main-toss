/**
 * IRONMAN TOSS BOOK - Database Schema Initializer
 * Safely executes DDL definitions if tables do not exist.
 */

const { getPool, testConnection } = require('./db');

const TABLES_DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    username VARCHAR(30) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(20) DEFAULT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin', 'super_admin') DEFAULT 'user',
    status ENUM('active', 'suspended', 'banned') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_username (username),
    INDEX idx_users_email (email),
    INDEX idx_users_status (status),
    INDEX idx_users_role (role),
    INDEX idx_users_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS wallets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    available_balance DECIMAL(12, 2) DEFAULT 0.00,
    exposure_balance DECIMAL(12, 2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'INR',
    version INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sessions_token (token_hash),
    INDEX idx_sessions_expires (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  `CREATE TABLE IF NOT EXISTS user_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    dark_mode_enabled BOOLEAN DEFAULT FALSE,
    toss_alerts BOOLEAN DEFAULT TRUE,
    match_reminders BOOLEAN DEFAULT TRUE,
    wallet_notices BOOLEAN DEFAULT TRUE,
    promo_updates BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    admin_username VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id INT DEFAULT NULL,
    target_identifier VARCHAR(100) DEFAULT NULL,
    details JSON DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_audit_admin (admin_id),
    INDEX idx_audit_action (action_type),
    INDEX idx_audit_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
];

async function initializeDatabase() {
  const dbStatus = await testConnection();
  if (!dbStatus.connected) {
    console.warn('[DB INIT] Database connection unavailable. Skipping table initialization.');
    return false;
  }

  try {
    const pool = getPool();
    for (const ddl of TABLES_DDL) {
      await pool.query(ddl);
    }

    // Ensure performance indexes exist idempotently on existing tables
    try {
      const [userIndexes] = await pool.query('SHOW INDEX FROM users');
      const uIndexNames = userIndexes.map(i => i.Key_name);
      if (!uIndexNames.includes('idx_users_role')) {
        await pool.query('ALTER TABLE users ADD INDEX idx_users_role (role)');
      }
      if (!uIndexNames.includes('idx_users_created')) {
        await pool.query('ALTER TABLE users ADD INDEX idx_users_created (created_at)');
      }

      const [sessionIndexes] = await pool.query('SHOW INDEX FROM sessions');
      const sIndexNames = sessionIndexes.map(i => i.Key_name);
      if (!sIndexNames.includes('idx_sessions_expires')) {
        await pool.query('ALTER TABLE sessions ADD INDEX idx_sessions_expires (expires_at)');
      }
    } catch (idxErr) {
      console.warn('[DB INIT] Performance index verification notice:', idxErr.message);
    }

    console.log('[DB INIT] Core authentication & ledger tables verified successfully.');
    return true;
  } catch (err) {
    console.error('[DB INIT] Error initializing tables:', err.message);
    return false;
  }
}

module.exports = {
  initializeDatabase
};
