/**
 * Safe Migration: Add match_end_time column & index to matches table
 */
const { getPool } = require('../src/config/db');

async function runMigration() {
  const pool = getPool();
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'match_end_time'"
    );

    if (cols.length === 0) {
      console.log('[MIGRATION] Adding match_end_time column to matches table...');
      await pool.query('ALTER TABLE matches ADD COLUMN match_end_time DATETIME NULL DEFAULT NULL AFTER scheduled_time');
      await pool.query('ALTER TABLE matches ADD INDEX idx_matches_end_time (match_end_time)');
      console.log('[MIGRATION] Successfully added match_end_time column and index.');
    } else {
      console.log('[MIGRATION] Column match_end_time already exists.');
    }

    // Historical compatibility: For existing settled or completed matches where match_end_time is null,
    // explicitly backfill with settled_at or created_at
    const [updateResult] = await pool.query(`
      UPDATE matches 
      SET match_end_time = COALESCE(settled_at, created_at)
      WHERE match_end_time IS NULL AND (settled = 1 OR status IN ('completed', 'abandoned'))
    `);
    console.log(`[MIGRATION] Backfilled ${updateResult.affectedRows} historical matches with match_end_time.`);

    const [desc] = await pool.query('DESCRIBE matches');
    console.log('[MIGRATION] Current columns in matches table:', desc.map(c => c.Field));
    process.exit(0);
  } catch (err) {
    console.error('[MIGRATION FAILED]', err);
    process.exit(1);
  }
}

runMigration();
