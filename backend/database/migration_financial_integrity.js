/**
 * DADDY TOSS BOOK — Financial Integrity & Concurrency Safety Schema Migration
 * 
 * 1. Creates `idempotency_records` table:
 *    - Guarantees strict at-most-once processing across all financial endpoints.
 *    - Persists request payload hashes to detect parameter conflicts on key reuse.
 *    - Stores serialized response payloads for deterministic retries.
 * 
 * 2. Extends `coin_transactions` table:
 *    - Expands action_type ENUM to support BET_STAKE_DEBIT.
 *    - Adds optional foreign correlation columns: bet_id, match_id, settlement_uuid.
 * 
 * 3. Extends `bets` table:
 *    - Adds nullable UNIQUE idempotency_key for database-level duplicate bet ticket prevention.
 */

const { getPool } = require('../src/config/db');

async function runMigration() {
  const pool = getPool();
  try {
    console.log('[MIGRATION] Starting financial integrity schema migration...');

    // 1. Create idempotency_records table
    console.log('[MIGRATION] Ensuring idempotency_records table exists...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS idempotency_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idempotency_key VARCHAR(150) NOT NULL UNIQUE,
        user_id INT NULL,
        scope VARCHAR(50) NOT NULL,
        request_hash VARCHAR(64) NOT NULL,
        status ENUM('processing', 'completed', 'failed') NOT NULL DEFAULT 'processing',
        response_status INT NULL,
        response_body MEDIUMTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        INDEX idx_idem_user_scope (user_id, scope),
        INDEX idx_idem_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2. Extend coin_transactions action_type ENUM to include BET_STAKE_DEBIT
    console.log('[MIGRATION] Updating coin_transactions action_type ENUM to support BET_STAKE_DEBIT...');
    await pool.query(`
      ALTER TABLE coin_transactions
      MODIFY COLUMN action_type ENUM(
        'ADMIN_CREDIT',
        'ADMIN_DEBIT',
        'BET_CANCEL_REFUND',
        'BET_WON_PAYOUT',
        'SETTLEMENT_REVERSAL_DEBIT',
        'BET_RESETTLEMENT_PAYOUT',
        'BET_STAKE_DEBIT'
      ) NOT NULL
    `);

    // 3. Add correlation columns to coin_transactions (bet_id, match_id, settlement_uuid)
    const [existingCols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coin_transactions'"
    );
    const colNames = existingCols.map(c => c.COLUMN_NAME);

    if (!colNames.includes('bet_id')) {
      console.log('[MIGRATION] Adding bet_id to coin_transactions...');
      await pool.query('ALTER TABLE coin_transactions ADD COLUMN bet_id VARCHAR(50) NULL AFTER reason');
      await pool.query('ALTER TABLE coin_transactions ADD INDEX idx_coin_tx_bet (bet_id)');
    }
    if (!colNames.includes('match_id')) {
      console.log('[MIGRATION] Adding match_id to coin_transactions...');
      await pool.query('ALTER TABLE coin_transactions ADD COLUMN match_id VARCHAR(50) NULL AFTER bet_id');
      await pool.query('ALTER TABLE coin_transactions ADD INDEX idx_coin_tx_match (match_id)');
    }
    if (!colNames.includes('settlement_uuid')) {
      console.log('[MIGRATION] Adding settlement_uuid to coin_transactions...');
      await pool.query('ALTER TABLE coin_transactions ADD COLUMN settlement_uuid VARCHAR(50) NULL AFTER match_id');
      await pool.query('ALTER TABLE coin_transactions ADD INDEX idx_coin_tx_settlement (settlement_uuid)');
    }

    // 4. Add idempotency_key to bets table
    const [betCols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bets' AND COLUMN_NAME = 'idempotency_key'"
    );
    if (betCols.length === 0) {
      console.log('[MIGRATION] Adding idempotency_key column to bets table...');
      await pool.query('ALTER TABLE bets ADD COLUMN idempotency_key VARCHAR(150) NULL UNIQUE AFTER settlement_version');
      await pool.query('ALTER TABLE bets ADD INDEX idx_bets_idempotency (idempotency_key)');
    }

    console.log('[MIGRATION] Financial integrity schema migration completed successfully.');
    return true;
  } catch (err) {
    console.error('[MIGRATION FAILED]', err);
    throw err;
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigration };
