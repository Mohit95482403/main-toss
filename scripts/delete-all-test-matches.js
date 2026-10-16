const { getPool, closePool } = require('../backend/src/config/db');

async function deleteAllTestMatches() {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    console.log('[CLEANUP] Starting match fixture audit and removal...');

    const [allMatches] = await connection.query(
      'SELECT id, competition, match_title, team_one, team_two, scheduled_time, status, settled, created_at FROM matches ORDER BY created_at ASC'
    );

    console.log(`[CLEANUP] Total matches currently in database: ${allMatches.length}`);
    if (allMatches.length === 0) {
      console.log('[CLEANUP] No matches found. Database is already clean of matches.');
      return;
    }

    console.log('[CLEANUP] Matches to remove:');
    allMatches.forEach(m => console.log(`   - ID: ${m.id}, Title: "${m.match_title}", Competition: "${m.competition}", Status: ${m.status}`));

    const matchIds = allMatches.map(m => m.id);

    await connection.beginTransaction();

    console.log('\n[CLEANUP] Removing dependent records for matches...');

    // 1. Remove bets associated with these matches (if any)
    const [betResult] = await connection.query(
      'DELETE FROM bets WHERE match_id IN (?)',
      [matchIds]
    );
    console.log(`   - Removed ${betResult.affectedRows} bet(s) referencing test matches`);

    // 2. Remove settlements associated with these matches
    const [settleResult] = await connection.query(
      'DELETE FROM settlements WHERE match_id IN (?)',
      [matchIds]
    );
    console.log(`   - Removed ${settleResult.affectedRows} settlement record(s) referencing test matches`);

    // 3. Remove admin audit logs referencing these matches
    const [auditResult] = await connection.query(
      `DELETE FROM admin_audit_logs 
       WHERE target_identifier IN (?) 
          OR (target_type = 'MATCH' AND target_identifier LIKE 'MATCH-%')`,
      [matchIds]
    );
    console.log(`   - Removed ${auditResult.affectedRows} admin audit log(s) referencing test matches`);

    // 4. Remove matches
    const [matchResult] = await connection.query(
      'DELETE FROM matches WHERE id IN (?)',
      [matchIds]
    );
    console.log(`   - Removed ${matchResult.affectedRows} match fixture(s) from matches table`);

    await connection.commit();
    console.log('\n[CLEANUP] Transaction committed successfully.');

    // 5. Verification
    const [remainingMatches] = await connection.query('SELECT COUNT(*) AS count FROM matches');
    const [remainingSettlements] = await connection.query('SELECT COUNT(*) AS count FROM settlements');
    const [remainingBets] = await connection.query('SELECT COUNT(*) AS count FROM bets');

    console.log('\n[CLEANUP VERIFICATION] Current table counts:');
    console.log(`   - matches: ${remainingMatches[0].count}`);
    console.log(`   - settlements: ${remainingSettlements[0].count}`);
    console.log(`   - bets: ${remainingBets[0].count}`);

  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    console.error('[CLEANUP ERROR] Failed to delete test matches:', error);
    throw error;
  } finally {
    connection.release();
    await closePool();
  }
}

deleteAllTestMatches().catch(err => {
  console.error(err);
  process.exit(1);
});
