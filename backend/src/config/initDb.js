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
    email VARCHAR(150) DEFAULT NULL UNIQUE,
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS matches (
    id VARCHAR(50) PRIMARY KEY,
    competition VARCHAR(150) NOT NULL,
    stage VARCHAR(100) DEFAULT NULL,
    match_title VARCHAR(200) NOT NULL,
    team_one VARCHAR(100) NOT NULL,
    team_one_abbr VARCHAR(10) DEFAULT NULL,
    team_one_rate DECIMAL(5, 2) NOT NULL DEFAULT 1.90,
    team_one_logo VARCHAR(255) DEFAULT NULL,
    team_two VARCHAR(100) NOT NULL,
    team_two_abbr VARCHAR(10) DEFAULT NULL,
    team_two_rate DECIMAL(5, 2) NOT NULL DEFAULT 1.90,
    team_two_logo VARCHAR(255) DEFAULT NULL,
    scheduled_time VARCHAR(100) DEFAULT NULL,
    match_end_time DATETIME NULL DEFAULT NULL,
    venue VARCHAR(200) DEFAULT NULL,
    status ENUM('upcoming', 'live', 'completed', 'abandoned') NOT NULL DEFAULT 'upcoming',
    toss_winner VARCHAR(100) DEFAULT NULL,
    settled BOOLEAN NOT NULL DEFAULT FALSE,
    settled_at TIMESTAMP NULL DEFAULT NULL,
    settled_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (settled_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_matches_status (status),
    INDEX idx_matches_settled (settled),
    INDEX idx_matches_end_time (match_end_time),
    INDEX idx_matches_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS bets (
    id VARCHAR(50) PRIMARY KEY,
    user_id INT NOT NULL,
    match_id VARCHAR(50) NOT NULL,
    market_name VARCHAR(100) NOT NULL DEFAULT 'Toss Winner',
    selection VARCHAR(100) NOT NULL,
    stake DECIMAL(12, 2) NOT NULL,
    odds DECIMAL(5, 2) NOT NULL,
    potential_return DECIMAL(12, 2) NOT NULL,
    status ENUM('pending', 'live', 'won', 'lost', 'no_result', 'cancelled') NOT NULL DEFAULT 'live',
    settlement_status ENUM('pending', 'settled', 'cancelled') NOT NULL DEFAULT 'pending',
    payout DECIMAL(12, 2) DEFAULT 0.00,
    refund_amount DECIMAL(12, 2) DEFAULT 0.00,
    settled_at TIMESTAMP NULL DEFAULT NULL,
    settled_by INT DEFAULT NULL,
    cancelled_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (settled_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_bets_user (user_id),
    INDEX idx_bets_match (match_id),
    INDEX idx_bets_status (status),
    INDEX idx_bets_settlement (settlement_status),
    INDEX idx_bets_cancelled (cancelled_at),
    INDEX idx_bets_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS settlements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    settlement_uuid VARCHAR(36) NOT NULL UNIQUE,
    match_id VARCHAR(50) NOT NULL,
    declared_outcome VARCHAR(100) NOT NULL,
    admin_id INT NOT NULL,
    admin_username VARCHAR(50) NOT NULL,
    total_bets INT NOT NULL DEFAULT 0,
    won_bets INT NOT NULL DEFAULT 0,
    lost_bets INT NOT NULL DEFAULT 0,
    no_result_bets INT NOT NULL DEFAULT 0,
    total_stake DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    total_payout DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_settlement_match (match_id),
    INDEX idx_settlement_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS coin_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_uuid VARCHAR(36) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    username VARCHAR(30) NOT NULL,
    admin_id INT NULL,
    admin_username VARCHAR(50) NULL,
    action_type ENUM('ADMIN_CREDIT', 'ADMIN_DEBIT', 'BET_CANCEL_REFUND') NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    balance_before DECIMAL(12, 2) NOT NULL,
    balance_after DECIMAL(12, 2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(100) DEFAULT NULL UNIQUE,
    status ENUM('completed', 'failed') NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_coin_tx_user (user_id),
    INDEX idx_coin_tx_username (username),
    INDEX idx_coin_tx_action (action_type),
    INDEX idx_coin_tx_created (created_at),
    INDEX idx_coin_tx_idempotency (idempotency_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
];

async function seedMatchesAndBetsIfEmpty(pool) {
  // Demo data seeding permanently disabled: only genuine data retrieved from MySQL
  return;
}

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

    // Ensure email is nullable for admin-provisioned users without email
    try {
      const [emailCol] = await pool.query(
        "SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email'"
      );
      if (emailCol.length > 0 && emailCol[0].IS_NULLABLE === 'NO') {
        await pool.query('ALTER TABLE users MODIFY COLUMN email VARCHAR(150) NULL DEFAULT NULL');
        console.log('[DB INIT] Successfully altered users.email to NULL DEFAULT NULL.');
      }
    } catch (colErr) {
      console.warn('[DB INIT] users.email nullability check notice:', colErr.message);
    }

    // Ensure match_end_time column exists in matches table
    try {
      const [colRows] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'match_end_time'"
      );
      if (colRows.length === 0) {
        await pool.query('ALTER TABLE matches ADD COLUMN match_end_time DATETIME NULL DEFAULT NULL AFTER scheduled_time');
        await pool.query('ALTER TABLE matches ADD INDEX idx_matches_end_time (match_end_time)');
        console.log('[DB INIT] Successfully added match_end_time column and index to matches table.');
      }
      // Historical backfill
      await pool.query(`
        UPDATE matches 
        SET match_end_time = COALESCE(settled_at, created_at)
        WHERE match_end_time IS NULL AND (settled = 1 OR status IN ('completed', 'abandoned'))
      `);
    } catch (mErr) {
      console.warn('[DB INIT] match_end_time column verification notice:', mErr.message);
    }

    // Ensure team_one_logo and team_two_logo columns exist in matches table
    try {
      const [colRows] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME IN ('team_one_logo', 'team_two_logo')"
      );
      const existingCols = colRows.map(r => r.COLUMN_NAME);
      if (!existingCols.includes('team_one_logo')) {
        await pool.query('ALTER TABLE matches ADD COLUMN team_one_logo VARCHAR(255) NULL DEFAULT NULL AFTER team_one_rate');
        console.log('[DB INIT] Successfully added team_one_logo column to matches table.');
      }
      if (!existingCols.includes('team_two_logo')) {
        await pool.query('ALTER TABLE matches ADD COLUMN team_two_logo VARCHAR(255) NULL DEFAULT NULL AFTER team_two_rate');
        console.log('[DB INIT] Successfully added team_two_logo column to matches table.');
      }
    } catch (logoErr) {
      console.warn('[DB INIT] team logo columns verification notice:', logoErr.message);
    }

    // Ensure bet cancellation & refund support exists idempotently
    try {
      await pool.query(
        "ALTER TABLE bets MODIFY COLUMN status ENUM('pending', 'live', 'won', 'lost', 'no_result', 'cancelled') NOT NULL DEFAULT 'live'"
      );
      await pool.query(
        "ALTER TABLE bets MODIFY COLUMN settlement_status ENUM('pending', 'settled', 'cancelled') NOT NULL DEFAULT 'pending'"
      );
      const [betCols] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bets' AND COLUMN_NAME IN ('cancelled_at', 'refund_amount')"
      );
      const existingBetCols = betCols.map(r => r.COLUMN_NAME);
      if (!existingBetCols.includes('cancelled_at')) {
        await pool.query('ALTER TABLE bets ADD COLUMN cancelled_at TIMESTAMP NULL DEFAULT NULL AFTER settled_by');
        await pool.query('ALTER TABLE bets ADD INDEX idx_bets_cancelled (cancelled_at)');
      }
      if (!existingBetCols.includes('refund_amount')) {
        await pool.query('ALTER TABLE bets ADD COLUMN refund_amount DECIMAL(12, 2) DEFAULT 0.00 AFTER payout');
      }

      await pool.query('ALTER TABLE coin_transactions MODIFY COLUMN admin_id INT NULL');
      await pool.query('ALTER TABLE coin_transactions MODIFY COLUMN admin_username VARCHAR(50) NULL');
      await pool.query("ALTER TABLE coin_transactions MODIFY COLUMN action_type ENUM('ADMIN_CREDIT', 'ADMIN_DEBIT', 'BET_CANCEL_REFUND') NOT NULL");

      const [startCol] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'match_start_time'"
      );
      if (startCol.length === 0) {
        await pool.query('ALTER TABLE matches ADD COLUMN match_start_time DATETIME NULL DEFAULT NULL AFTER scheduled_time');
      }
    } catch (cancelErr) {
      console.warn('[DB INIT] Bet cancellation schema verification notice:', cancelErr.message);
    }

    // Schema verification complete (automatic demo data seeding disabled)
    console.log('[DB INIT] Core authentication, ledger, match & bet tables verified successfully.');
    return true;
  } catch (err) {
    console.error('[DB INIT] Error initializing tables:', err.message);
    return false;
  }
}

module.exports = {
  initializeDatabase,
  seedMatchesAndBetsIfEmpty
};
