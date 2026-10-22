const { getPool, closePool } = require('../backend/src/config/db');

async function deleteAllTestMatchesAndUsers() {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    console.log('================================================================');
    console.log('DADDY TOSS BOOK — COMPREHENSIVE PURGE SCRIPT');
    console.log('Target: Remove ALL Matches & ALL Test Users EXCEPT "dtb1" & "admin"');
    console.log('================================================================\n');

    // 1. Audit Current Matches
    const [allMatches] = await connection.query(
      'SELECT id, competition, match_title, team_one, team_two, status FROM matches'
    );
    console.log(`[AUDIT] Total matches currently in database: ${allMatches.length}`);
    allMatches.forEach(m => console.log(`   - [MATCH #${m.id}] ${m.competition}: ${m.match_title || (m.team_one + ' vs ' + m.team_two)} (${m.status})`));

    // 2. Audit Current Users
    const [allUsers] = await connection.query(
      'SELECT id, username, full_name, email, role, status FROM users ORDER BY id ASC'
    );
    console.log(`\n[AUDIT] Total users currently in database: ${allUsers.length}`);

    // Preserved accounts
    const preservedUsernames = ['admin', 'dtb1'];
    const preservedUsers = allUsers.filter(u => preservedUsernames.includes(u.username.toLowerCase()));
    const targetUsersToDelete = allUsers.filter(u => !preservedUsernames.includes(u.username.toLowerCase()));

    console.log(`[AUDIT] Preserved accounts (${preservedUsers.length}):`);
    preservedUsers.forEach(u => console.log(`   ✓ KEEP: ID ${u.id} | @${u.username} (${u.role}) - ${u.full_name || 'N/A'}`));

    console.log(`[AUDIT] Test accounts marked for deletion: ${targetUsersToDelete.length}`);

    await connection.beginTransaction();

    // -------------------------------------------------------------------------
    // STEP A: DELETE ALL BETS AND SETTLEMENTS
    // -------------------------------------------------------------------------
    console.log('\n[CLEANUP STEP 1] Removing all bets and settlements...');
    const [betDeleteResult] = await connection.query('DELETE FROM bets');
    console.log(`   - Deleted ${betDeleteResult.affectedRows} bet(s) across all matches`);

    const [settleDeleteResult] = await connection.query('DELETE FROM settlements');
    console.log(`   - Deleted ${settleDeleteResult.affectedRows} settlement(s) across all matches`);

    // -------------------------------------------------------------------------
    // STEP B: DELETE ALL MATCHES
    // -------------------------------------------------------------------------
    console.log('\n[CLEANUP STEP 2] Removing all match fixtures...');
    const [matchDeleteResult] = await connection.query('DELETE FROM matches');
    console.log(`   - Deleted ${matchDeleteResult.affectedRows} match fixture(s)`);

    // Remove audit logs referencing matches
    const [matchAuditResult] = await connection.query(
      "DELETE FROM admin_audit_logs WHERE target_type = 'MATCH' OR target_identifier LIKE 'MATCH-%'"
    );
    console.log(`   - Cleaned ${matchAuditResult.affectedRows} admin audit log(s) referencing matches`);

    // -------------------------------------------------------------------------
    // STEP C: DELETE TEST USERS (EXCEPT admin & dtb1)
    // -------------------------------------------------------------------------
    if (targetUsersToDelete.length > 0) {
      const deleteUserIds = targetUsersToDelete.map(u => u.id);
      console.log(`\n[CLEANUP STEP 3] Deleting ${deleteUserIds.length} test user account(s)...`);

      // 3.1 Remove sessions
      const [sessResult] = await connection.query(
        'DELETE FROM sessions WHERE user_id IN (?)',
        [deleteUserIds]
      );
      console.log(`   - Removed ${sessResult.affectedRows} session(s)`);

      // 3.2 Remove user preferences
      const [prefResult] = await connection.query(
        'DELETE FROM user_preferences WHERE user_id IN (?)',
        [deleteUserIds]
      );
      console.log(`   - Removed ${prefResult.affectedRows} user preference row(s)`);

      // 3.3 Remove coin transactions for test users
      const [coinResult] = await connection.query(
        'DELETE FROM coin_transactions WHERE user_id IN (?)',
        [deleteUserIds]
      );
      console.log(`   - Removed ${coinResult.affectedRows} coin transaction(s) for deleted test users`);

      // 3.4 Remove wallets for test users
      const [walletResult] = await connection.query(
        'DELETE FROM wallets WHERE user_id IN (?)',
        [deleteUserIds]
      );
      console.log(`   - Removed ${walletResult.affectedRows} wallet(s)`);

      // 3.5 Remove audit logs for deleted users
      const deleteUsernames = targetUsersToDelete.map(u => u.username);
      const [userAuditResult] = await connection.query(
        `DELETE FROM admin_audit_logs 
         WHERE target_type = 'USER' 
           AND target_identifier IN (?)`,
        [deleteUsernames]
      );
      console.log(`   - Cleaned ${userAuditResult.affectedRows} admin audit log(s) for test users`);

      // 3.6 Delete the user accounts from users table
      const [userDeleteResult] = await connection.query(
        'DELETE FROM users WHERE id IN (?)',
        [deleteUserIds]
      );
      console.log(`   - Permanently deleted ${userDeleteResult.affectedRows} user record(s) from users table`);
    } else {
      console.log('\n[CLEANUP STEP 3] No extra test users to delete.');
    }

    // -------------------------------------------------------------------------
    // STEP D: RESET EXPOSURE TO 0 FOR PRESERVED USERS
    // -------------------------------------------------------------------------
    console.log('\n[CLEANUP STEP 4] Resetting exposure balances to 0.00 for preserved users...');
    const preservedUserIds = preservedUsers.map(u => u.id);
    if (preservedUserIds.length > 0) {
      await connection.query(
        'UPDATE wallets SET exposure_balance = 0.00 WHERE user_id IN (?)',
        [preservedUserIds]
      );
      console.log(`   ✓ Exposure set to 0.00 for ${preservedUserIds.length} preserved account(s)`);
    }

    await connection.commit();
    console.log('\n[SUCCESS] Transaction committed successfully to MySQL database.');

    // -------------------------------------------------------------------------
    // STEP E: FINAL VERIFICATION AUDIT
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('FINAL DATABASE VERIFICATION');
    console.log('================================================================');

    const [remainingMatches] = await connection.query('SELECT COUNT(*) AS count FROM matches');
    const [remainingSettlements] = await connection.query('SELECT COUNT(*) AS count FROM settlements');
    const [remainingBets] = await connection.query('SELECT COUNT(*) AS count FROM bets');
    const [remainingUsers] = await connection.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.status, 
              COALESCE(w.available_balance, 0.00) AS available_balance, 
              COALESCE(w.exposure_balance, 0.00) AS exposure_balance
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       ORDER BY u.id ASC`
    );

    console.log(`Matches in database     : ${remainingMatches[0].count}`);
    console.log(`Settlements in database : ${remainingSettlements[0].count}`);
    console.log(`Bets in database        : ${remainingBets[0].count}`);
    console.log(`Users in database       : ${remainingUsers.length}`);

    console.log('\nPreserved Users in System:');
    remainingUsers.forEach(u => {
      console.log(`   ➤ User #${u.id}: @${u.username} (${u.role.toUpperCase()}) | Balance: ₹${parseFloat(u.available_balance).toLocaleString('en-IN', {minimumFractionDigits: 2})} | Exposure: ₹${parseFloat(u.exposure_balance).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
    });
    console.log('================================================================\n');

  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    console.error('[CLEANUP CRITICAL ERROR]:', error);
    throw error;
  } finally {
    connection.release();
    await closePool();
  }
}

deleteAllTestMatchesAndUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
