/**
 * DADDY TOSS BOOK — Complete Wallet & Transaction Ledger Schema Migration
 * 
 * Extends `coin_transactions` table to satisfy all Phase 3 ledger requirements:
 * 1. related_transaction_id (VARCHAR(64) NULL): Trace compensating entries (reversals, refunds, parent tx)
 * 2. metadata (LONGTEXT NULL): Validated JSON metadata for rich audit context
 * 3. updated_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)
 * 4. Indexes for efficient user audit, date range filtering, and correlation lookups
 */

const { getPool } = require('../src/config/db');

async function runWalletLedgerMigration() {
  const pool = getPool();
  try {
    console.log('[MIGRATION] Starting complete wallet ledger schema migration...');

    // 1. Check existing columns in coin_transactions
    const [cols] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'coin_transactions'
    `);
    const colNames = cols.map(c => c.COLUMN_NAME);

    // 2. Add related_transaction_id if missing
    if (!colNames.includes('related_transaction_id')) {
      console.log('[MIGRATION] Adding related_transaction_id to coin_transactions...');
      await pool.query(`
        ALTER TABLE coin_transactions 
        ADD COLUMN related_transaction_id VARCHAR(64) NULL AFTER settlement_uuid
      `);
      await pool.query(`
        ALTER TABLE coin_transactions 
        ADD INDEX idx_coin_tx_related_tx (related_transaction_id)
      `);
    }

    // 3. Add metadata if missing
    if (!colNames.includes('metadata')) {
      console.log('[MIGRATION] Adding metadata to coin_transactions...');
      await pool.query(`
        ALTER TABLE coin_transactions 
        ADD COLUMN metadata LONGTEXT NULL AFTER reason
      `);
    }

    // 4. Add updated_at if missing
    if (!colNames.includes('updated_at')) {
      console.log('[MIGRATION] Adding updated_at to coin_transactions...');
      await pool.query(`
        ALTER TABLE coin_transactions 
        ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at
      `);
    }

    // 5. Ensure composite indexes exist
    const [indexes] = await pool.query(`
      SHOW INDEX FROM coin_transactions
    `);
    const indexNames = indexes.map(i => i.Key_name);

    if (!indexNames.includes('idx_coin_tx_user_created')) {
      console.log('[MIGRATION] Adding composite index idx_coin_tx_user_created...');
      await pool.query(`
        ALTER TABLE coin_transactions 
        ADD INDEX idx_coin_tx_user_created (user_id, created_at)
      `);
    }

    if (!indexNames.includes('idx_coin_tx_user_action')) {
      console.log('[MIGRATION] Adding composite index idx_coin_tx_user_action...');
      await pool.query(`
        ALTER TABLE coin_transactions 
        ADD INDEX idx_coin_tx_user_action (user_id, action_type)
      `);
    }

    console.log('[MIGRATION] Complete wallet ledger schema migration finished successfully.');
    return true;
  } catch (err) {
    console.error('[MIGRATION FAILED]', err);
    throw err;
  }
}

if (require.main === module) {
  runWalletLedgerMigration()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { runWalletLedgerMigration };
