const { getPool, closePool } = require('../backend/src/config/db');

async function deleteAllTestUsers() {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    console.log('[CLEANUP] Starting test user audit and removal...');

    const [allUsers] = await connection.query(
      'SELECT id, username, email, full_name, role, status, created_at FROM users ORDER BY id ASC'
    );

    console.log(`[CLEANUP] Total users currently in database: ${allUsers.length}`);

    const protectedUsernames = ['admin', 'dtb1'];

    const testUsers = allUsers.filter(u => {
      if (protectedUsernames.includes(u.username.toLowerCase())) {
        return false;
      }
      return /^(user_|player_|player6_|val_user|priv_target_|player_susp_|ghost_user_|del_)/i.test(u.username);
    });

    console.log(`[CLEANUP] Found ${testUsers.length} test user account(s) to remove.`);

    const preservedUsers = allUsers.filter(u => !testUsers.some(tu => tu.id === u.id));
    console.log(`[CLEANUP] Preserving ${preservedUsers.length} legitimate account(s):`);
    preservedUsers.forEach(u => console.log(`   - ID: ${u.id}, Username: ${u.username}, Role: ${u.role}, Full Name: "${u.full_name}"`));

    if (testUsers.length === 0) {
      console.log('[CLEANUP] No test users found. Database is already clean.');
    } else {
      const testUserIds = testUsers.map(u => u.id);
      const testUsernames = testUsers.map(u => u.username);

      await connection.beginTransaction();

      console.log('\n[CLEANUP] Deleting dependent records for test users...');

      const [betResult] = await connection.query('DELETE FROM bets WHERE user_id IN (?)', [testUserIds]);
      console.log(`   - Removed ${betResult.affectedRows} test bet(s)`);

      const [txResult] = await connection.query('DELETE FROM coin_transactions WHERE user_id IN (?)', [testUserIds]);
      console.log(`   - Removed ${txResult.affectedRows} test coin transaction(s)`);

      const [sessionResult] = await connection.query('DELETE FROM sessions WHERE user_id IN (?)', [testUserIds]);
      console.log(`   - Removed ${sessionResult.affectedRows} test session(s)`);

      const [prefResult] = await connection.query('DELETE FROM user_preferences WHERE user_id IN (?)', [testUserIds]);
      console.log(`   - Removed ${prefResult.affectedRows} test user preference record(s)`);

      const [walletResult] = await connection.query('DELETE FROM wallets WHERE user_id IN (?)', [testUserIds]);
      console.log(`   - Removed ${walletResult.affectedRows} test wallet record(s)`);

      const [auditResult] = await connection.query('DELETE FROM admin_audit_logs WHERE target_id IN (?) OR target_identifier IN (?)', [testUserIds, testUsernames]);
      console.log(`   - Removed ${auditResult.affectedRows} test admin audit log(s)`);

      const [userResult] = await connection.query('DELETE FROM users WHERE id IN (?)', [testUserIds]);
      console.log(`   - Removed ${userResult.affectedRows} test user account(s) from users table`);

      await connection.commit();
      console.log('\n[CLEANUP] Transaction committed successfully.');
    }

    const [remainingUsers] = await connection.query(
      'SELECT id, username, email, full_name, role, status FROM users ORDER BY id ASC'
    );
    console.log(`\n[CLEANUP VERIFICATION] Remaining users in database (${remainingUsers.length}):`);
    console.table(remainingUsers);

    const [remainingWallets] = await connection.query(
      'SELECT w.user_id, u.username, w.available_balance, w.exposure_balance FROM wallets w JOIN users u ON w.user_id = u.id'
    );
    console.log(`[CLEANUP VERIFICATION] Remaining wallets:`);
    console.table(remainingWallets);
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    console.error('[CLEANUP ERROR] Failed to delete test users:', error);
    throw error;
  } finally {
    connection.release();
    await closePool();
  }
}

deleteAllTestUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
