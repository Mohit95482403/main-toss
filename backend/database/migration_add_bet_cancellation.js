/**
 * Safe Migration: Add Bet Cancellation & Stake Refund Schema Extensions
 * 
 * 1. bets table:
 *    - Extends status ENUM to include 'cancelled'
 *    - Extends settlement_status ENUM to include 'cancelled'
 *    - Adds nullable cancelled_at TIMESTAMP
 *    - Adds refund_amount DECIMAL(12, 2)
 *    - Adds index idx_bets_cancelled (cancelled_at)
 * 
 * 2. matches table:
 *    - Adds nullable match_start_time DATETIME
 * 
 * 3. coin_transactions table:
 *    - Extends action_type ENUM to include 'BET_CANCEL_REFUND'
 *    - Modifies admin_id & admin_username to be NULLABLE (for user-driven refunds)
 */

const { getPool } = require('../src/config/db');

async function runMigration() {
  const pool = getPool();
  try {
    console.log('[MIGRATION] Starting bet cancellation schema migration...');

    // 1. Alter bets.status and settlement_status ENUMs
    console.log('[MIGRATION] Updating bets.status and bets.settlement_status ENUM definitions...');
    await pool.query(
      "ALTER TABLE bets MODIFY COLUMN status ENUM('pending', 'live', 'won', 'lost', 'no_result', 'cancelled') NOT NULL DEFAULT 'live'"
    );
    await pool.query(
      "ALTER TABLE bets MODIFY COLUMN settlement_status ENUM('pending', 'settled', 'cancelled') NOT NULL DEFAULT 'pending'"
    );

    // 2. Add cancelled_at column to bets
    const [cancelledCol] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bets' AND COLUMN_NAME = 'cancelled_at'"
    );
    if (cancelledCol.length === 0) {
      console.log('[MIGRATION] Adding cancelled_at column to bets table...');
      await pool.query('ALTER TABLE bets ADD COLUMN cancelled_at TIMESTAMP NULL DEFAULT NULL AFTER settled_by');
      await pool.query('ALTER TABLE bets ADD INDEX idx_bets_cancelled (cancelled_at)');
    }

    // 3. Add refund_amount column to bets
    const [refundCol] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bets' AND COLUMN_NAME = 'refund_amount'"
    );
    if (refundCol.length === 0) {
      console.log('[MIGRATION] Adding refund_amount column to bets table...');
      await pool.query('ALTER TABLE bets ADD COLUMN refund_amount DECIMAL(12, 2) DEFAULT 0.00 AFTER payout');
    }

    // 4. Add match_start_time to matches table if not exists
    const [startTimeCol] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'match_start_time'"
    );
    if (startTimeCol.length === 0) {
      console.log('[MIGRATION] Adding match_start_time column to matches table...');
      await pool.query('ALTER TABLE matches ADD COLUMN match_start_time DATETIME NULL DEFAULT NULL AFTER scheduled_time');
    }

    // 5. Update coin_transactions table
    console.log('[MIGRATION] Updating coin_transactions schema for bet cancel refunds...');
    await pool.query(
      "ALTER TABLE coin_transactions MODIFY COLUMN admin_id INT NULL"
    );
    await pool.query(
      "ALTER TABLE coin_transactions MODIFY COLUMN admin_username VARCHAR(50) NULL"
    );
    await pool.query(
      "ALTER TABLE coin_transactions MODIFY COLUMN action_type ENUM('ADMIN_CREDIT', 'ADMIN_DEBIT', 'BET_CANCEL_REFUND') NOT NULL"
    );

    console.log('[MIGRATION] Bet cancellation schema migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('[MIGRATION FAILED]', err);
    process.exit(1);
  }
}

runMigration();
