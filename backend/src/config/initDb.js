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
    team_two VARCHAR(100) NOT NULL,
    team_two_abbr VARCHAR(10) DEFAULT NULL,
    team_two_rate DECIMAL(5, 2) NOT NULL DEFAULT 1.90,
    scheduled_time VARCHAR(100) DEFAULT NULL,
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
    status ENUM('pending', 'live', 'won', 'lost', 'no_result') NOT NULL DEFAULT 'live',
    settlement_status ENUM('pending', 'settled') NOT NULL DEFAULT 'pending',
    payout DECIMAL(12, 2) DEFAULT 0.00,
    settled_at TIMESTAMP NULL DEFAULT NULL,
    settled_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (settled_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_bets_user (user_id),
    INDEX idx_bets_match (match_id),
    INDEX idx_bets_status (status),
    INDEX idx_bets_settlement (settlement_status),
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
    admin_id INT NOT NULL,
    admin_username VARCHAR(50) NOT NULL,
    action_type ENUM('ADMIN_CREDIT', 'ADMIN_DEBIT') NOT NULL,
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
  try {
    // 1. Check if matches table is empty
    const [[matchCount]] = await pool.query('SELECT COUNT(*) AS c FROM matches');
    if (parseInt(matchCount.c, 10) === 0) {
      console.log('[DB INIT] Seeding initial cricket match fixtures...');
      const fixtures = [
        ['MATCH-2026-001', "ICC MEN'S T20 WORLD CUP", 'Super 8 - Match 24', 'India vs Australia', 'India', 'IND', 1.95, 'Australia', 'AUS', 1.90, 'Today, 03:00 PM', 'Melbourne Cricket Ground, Melbourne', 'live', null, 0, null, null],
        ['MATCH-2026-002', 'IPL 2026 - T20 LEAGUE', 'League Match 38', 'Mumbai Indians vs Chennai Super Kings', 'Mumbai Indians', 'MI', 1.90, 'Chennai Super Kings', 'CSK', 1.92, 'Today, 07:30 PM', 'Wankhede Stadium, Mumbai', 'upcoming', null, 0, null, null],
        ['MATCH-2026-003', "ICC MEN'S T20 WORLD CUP", 'Super 8 - Match 26', 'England vs South Africa', 'England', 'ENG', 1.88, 'South Africa', 'SA', 1.94, 'Tomorrow, 02:30 PM', 'Kensington Oval, Barbados', 'upcoming', null, 0, null, null],
        ['MATCH-2026-004', 'BIG BASH LEAGUE 2026', 'Opening Fixture', 'Sydney Sixers vs Perth Scorchers', 'Sydney Sixers', 'SYS', 1.91, 'Perth Scorchers', 'PRS', 1.91, '16 Oct 2026, 01:45 PM', 'Sydney Cricket Ground, Sydney', 'upcoming', null, 0, null, null],
        ['MATCH-2026-005', 'ASIA CUP T20 2026', 'Super 4 Round', 'Pakistan vs Sri Lanka', 'Pakistan', 'PAK', 1.88, 'Sri Lanka', 'SL', 1.92, '14 Oct 2026, 07:00 PM', 'R. Premadasa Stadium, Colombo', 'completed', 'Sri Lanka', 1, '2026-10-14 22:30:00', null]
      ];

      for (const f of fixtures) {
        await pool.query(
          `INSERT INTO matches (id, competition, stage, match_title, team_one, team_one_abbr, team_one_rate, team_two, team_two_abbr, team_two_rate, scheduled_time, venue, status, toss_winner, settled, settled_at, settled_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          f
        );
      }
      console.log('[DB INIT] Successfully seeded 5 match fixtures.');
    }

    // 2. Check if bets table is empty
    const [[betCount]] = await pool.query('SELECT COUNT(*) AS c FROM bets');
    if (parseInt(betCount.c, 10) === 0) {
      console.log('[DB INIT] Checking available users for initial player bets...');
      const [users] = await pool.query("SELECT id, username FROM users WHERE role = 'user' ORDER BY id ASC LIMIT 5");

      if (users.length > 0) {
        const u1 = users[0].id;
        const u2 = users[1] ? users[1].id : u1;
        const u3 = users[2] ? users[2].id : u1;
        const u4 = users[3] ? users[3].id : u1;
        const u5 = users[4] ? users[4].id : u1;

        const initialBets = [
          ['BET-2026-1049', u1, 'MATCH-2026-001', 'Toss Winner', 'India', 500.00, 1.95, 975.00, 'live', 'pending', 0.00, null, null],
          ['BET-2026-1050', u2, 'MATCH-2026-001', 'Toss Winner', 'Australia', 1000.00, 1.90, 1900.00, 'live', 'pending', 0.00, null, null],
          ['BET-2026-1051', u3, 'MATCH-2026-001', 'Toss Winner', 'India', 250.00, 1.95, 487.50, 'live', 'pending', 0.00, null, null],
          ['BET-2026-1048', u1, 'MATCH-2026-002', 'Toss Winner', 'Mumbai Indians', 1000.00, 1.90, 1900.00, 'pending', 'pending', 0.00, null, null],
          ['BET-2026-1047', u4, 'MATCH-2026-002', 'Toss Winner', 'Chennai Super Kings', 800.00, 1.92, 1536.00, 'pending', 'pending', 0.00, null, null],
          ['BET-2026-1039', u5, 'MATCH-2026-005', 'Toss Winner', 'Pakistan', 400.00, 1.88, 752.00, 'lost', 'settled', 0.00, '2026-10-14 22:30:00', null]
        ];

        for (const b of initialBets) {
          await pool.query(
            `INSERT INTO bets (id, user_id, match_id, market_name, selection, stake, odds, potential_return, status, settlement_status, payout, settled_at, settled_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            b
          );
        }

        // Sync wallets exposure balance for pending bets
        await pool.query(`
          UPDATE wallets w
          SET exposure_balance = (
            SELECT COALESCE(SUM(b.stake), 0.00)
            FROM bets b
            WHERE b.user_id = w.user_id AND b.settlement_status = 'pending'
          )
        `);

        console.log('[DB INIT] Successfully seeded player bets and aligned wallet exposures.');
      }
    }
  } catch (seedErr) {
    console.warn('[DB INIT] Seeding notice:', seedErr.message);
  }
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
