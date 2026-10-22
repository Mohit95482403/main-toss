/**
 * IRONMAN TOSS BOOK - Complete Database Cleanup Script
 * Removes all matches, bets, settlements, and all non-admin users (including test users and dtb1).
 * Preserves the root super_admin account with full referential integrity.
 */

const { getPool, closePool } = require('../backend/src/config/db');

async function cleanupDatabase() {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    console.log('====================================================');
    console.log('>>> IRONMAN TOSS BOOK: DATABASE PURGE & CLEANUP <<<');
    console.log('====================================================\n');

    // 1. Identify admin account(s) to protect
    const [adminUsers] = await connection.query(
      "SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin')"
    );

    if (adminUsers.length === 0) {
      throw new Error('No administrator account found! Aborting cleanup to prevent complete lock-out.');
    }

    const adminIds = adminUsers.map(a => a.id);
    const primaryAdmin = adminUsers[0];
    console.log(`[PROTECTED] Preserving Administrator Account:`);
    adminUsers.forEach(a => console.log(`   - ID: ${a.id} | Username: ${a.username} | Role: ${a.role} | Email: ${a.email}`));

    // 2. Identify non-admin accounts to delete
    const [usersToDelete] = await connection.query(
      'SELECT id, username, role FROM users WHERE id NOT IN (?)',
      [adminIds]
    );
    console.log(`\n[AUDIT] Found ${usersToDelete.length} non-admin user account(s) to remove.`);

    const [allMatches] = await connection.query('SELECT id, match_title FROM matches');
    console.log(`[AUDIT] Found ${allMatches.length} match(es) to remove.`);

    const [allBets] = await connection.query('SELECT COUNT(*) as count FROM bets');
    console.log(`[AUDIT] Found ${allBets[0].count} bet record(s) to remove.`);

    const [allSettlements] = await connection.query('SELECT COUNT(*) as count FROM settlements');
    console.log(`[AUDIT] Found ${allSettlements[0].count} settlement record(s) to remove.`);

    const [allCoinTx] = await connection.query('SELECT COUNT(*) as count FROM coin_transactions');
    console.log(`[AUDIT] Found ${allCoinTx[0].count} coin transaction(s) to remove.`);

    // 3. Begin atomic transaction
    await connection.beginTransaction();

    console.log('\n[PURGE] Executing database cleanup in atomic transaction...');

    // A. Delete bets
    const [delBets] = await connection.query('DELETE FROM bets');
    console.log(`   ✓ Deleted ${delBets.affectedRows} bets.`);

    // B. Delete settlements
    const [delSettlements] = await connection.query('DELETE FROM settlements');
    console.log(`   ✓ Deleted ${delSettlements.affectedRows} settlements.`);

    // C. Delete all matches
    const [delMatches] = await connection.query('DELETE FROM matches');
    console.log(`   ✓ Deleted ${delMatches.affectedRows} matches.`);

    // D. Delete coin transactions (all belong to non-admins or match operations)
    const [delTx] = await connection.query('DELETE FROM coin_transactions');
    console.log(`   ✓ Deleted ${delTx.affectedRows} coin transactions.`);

    // E. Delete idempotency records
    const [delIdemp] = await connection.query('DELETE FROM idempotency_records');
    console.log(`   ✓ Deleted ${delIdemp.affectedRows} idempotency records.`);

    if (usersToDelete.length > 0) {
      const userIdsToDelete = usersToDelete.map(u => u.id);
      const usernamesToDelete = usersToDelete.map(u => u.username);

      // F. Delete non-admin sessions
      const [delSessions] = await connection.query(
        'DELETE FROM sessions WHERE user_id NOT IN (?)',
        [adminIds]
      );
      console.log(`   ✓ Deleted ${delSessions.affectedRows} user sessions.`);

      // G. Delete non-admin user preferences
      const [delPrefs] = await connection.query(
        'DELETE FROM user_preferences WHERE user_id NOT IN (?)',
        [adminIds]
      );
      console.log(`   ✓ Deleted ${delPrefs.affectedRows} user preference records.`);

      // H. Delete non-admin wallets
      const [delWallets] = await connection.query(
        'DELETE FROM wallets WHERE user_id NOT IN (?)',
        [adminIds]
      );
      console.log(`   ✓ Deleted ${delWallets.affectedRows} user wallets.`);

      // I. Delete non-admin users
      const [delUsers] = await connection.query(
        'DELETE FROM users WHERE id NOT IN (?)',
        [adminIds]
      );
      console.log(`   ✓ Deleted ${delUsers.affectedRows} user accounts.`);
    }

    // J. Clean up test/match audit logs, preserving initial system/admin audit events
    const [delAuditLogs] = await connection.query(
      `DELETE FROM admin_audit_logs 
       WHERE action_type != 'admin_provisioned' 
         AND (target_type IN ('match', 'MATCH', 'user', 'bet') OR target_id NOT IN (?))`,
      [adminIds]
    );
    console.log(`   ✓ Cleaned up ${delAuditLogs.affectedRows} test/match audit logs.`);

    // K. Ensure admin wallet is clean (0.00 available, 0.00 exposure)
    await connection.query(
      'UPDATE wallets SET available_balance = 0.00, exposure_balance = 0.00 WHERE user_id IN (?)',
      [adminIds]
    );
    console.log('   ✓ Verified administrator wallet balance and exposure are reset to 0.00.');

    await connection.commit();
    console.log('\n[SUCCESS] Transaction committed successfully!\n');

    // 4. Verify post-cleanup database state
    console.log('====================================================');
    console.log('>>> POST-CLEANUP VERIFICATION <<<');
    console.log('====================================================');

    const [finalUsers] = await connection.query('SELECT id, username, email, role, status FROM users');
    console.log(`Remaining Users (${finalUsers.length}):`);
    console.table(finalUsers);

    const [finalWallets] = await connection.query(
      'SELECT w.id, w.user_id, u.username, w.available_balance, w.exposure_balance FROM wallets w JOIN users u ON w.user_id = u.id'
    );
    console.log(`Remaining Wallets (${finalWallets.length}):`);
    console.table(finalWallets);

    const [finalMatches] = await connection.query('SELECT COUNT(*) as count FROM matches');
    const [finalBets] = await connection.query('SELECT COUNT(*) as count FROM bets');
    const [finalSettlements] = await connection.query('SELECT COUNT(*) as count FROM settlements');
    const [finalCoinTx] = await connection.query('SELECT COUNT(*) as count FROM coin_transactions');
    const [finalAudit] = await connection.query('SELECT COUNT(*) as count FROM admin_audit_logs');
    const [finalIdemp] = await connection.query('SELECT COUNT(*) as count FROM idempotency_records');

    console.log('\nDatabase State Summary:');
    console.log(` - Matches:           ${finalMatches[0].count}`);
    console.log(` - Bets:              ${finalBets[0].count}`);
    console.log(` - Settlements:       ${finalSettlements[0].count}`);
    console.log(` - Coin Transactions: ${finalCoinTx[0].count}`);
    console.log(` - Idempotency Keys:  ${finalIdemp[0].count}`);
    console.log(` - Audit Logs:        ${finalAudit[0].count}`);
    console.log(` - Non-admin Users:   ${finalUsers.filter(u => !['admin', 'super_admin'].includes(u.role)).length}`);
    console.log('====================================================\n');

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
        console.warn('[ROLLBACK] Transaction rolled back due to error.');
      } catch (rbErr) {
        console.error('[ROLLBACK ERROR]', rbErr);
      }
    }
    console.error('[CLEANUP FAILED]:', error);
    throw error;
  } finally {
    connection.release();
    await closePool();
  }
}

cleanupDatabase()
  .then(() => {
    console.log('[COMPLETED] All matches and test users removed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
