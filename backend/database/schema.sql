-- ==============================================================================
-- IRONMAN TOSS BOOK - Core Relational Schema (Day 13 Security & Auth)
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS ironman_toss_book
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ironman_toss_book;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  available_balance DECIMAL(12, 2) DEFAULT 0.00,
  exposure_balance DECIMAL(12, 2) DEFAULT 0.00,
  currency VARCHAR(10) DEFAULT 'INR',
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Sessions & Tokens Table
CREATE TABLE IF NOT EXISTS sessions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  dark_mode_enabled BOOLEAN DEFAULT FALSE,
  toss_alerts BOOLEAN DEFAULT TRUE,
  match_reminders BOOLEAN DEFAULT TRUE,
  wallet_notices BOOLEAN DEFAULT TRUE,
  promo_updates BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Admin Audit Logs Table (Day 14 Governance & Accountability)
CREATE TABLE IF NOT EXISTS admin_audit_logs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Matches Fixtures Table (Match Monitoring & Toss Markets)
CREATE TABLE IF NOT EXISTS matches (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Bets Ledger Table (Player Toss Wagers)
CREATE TABLE IF NOT EXISTS bets (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Settlements Table (Idempotent Settlement Records & Audit)
CREATE TABLE IF NOT EXISTS settlements (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Coin Transactions Ledger (Admin Player Coin Management)
CREATE TABLE IF NOT EXISTS coin_transactions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
