const { getPool, closePool } = require('../backend/src/config/db');

const BASE_URL = 'http://localhost:5000/api';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return {
    status: res.status,
    ok: res.ok,
    data: json
  };
}

async function runRegressionTests() {
  console.log('===============================================================');
  console.log(' DADDY TOSS BOOK: MANDATORY FIRST-LOGIN PASSWORD CHANGE TESTS ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  const pool = getPool();
  let adminToken = '';
  let testUserId = null;
  const testUsername = `user_pwc_${Date.now()}`;
  const tempPassword = 'TempPassword@123';
  const newPassword = 'SecureNewPassword@2026';

  try {
    // 0. ADMIN AUTHENTICATION
    console.log('--- STEP 0: Authenticate as Super Admin ---');
    const adminLoginRes = await request('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'Admin@Ironman2026' }
    });
    assert(adminLoginRes.status === 200, 'Admin login succeeded');
    assert(adminLoginRes.data.user.role === 'super_admin', 'Admin role verified');
    assert(adminLoginRes.data.user.mustChangePassword === false, 'Admin mustChangePassword is false');
    adminToken = adminLoginRes.data.token;

    // SCENARIO A: Admin creates a new account
    console.log('\n--- SCENARIO A: Admin creates a new account ---');
    const createRes = await request('/admin/users/create', {
      method: 'POST',
      token: adminToken,
      body: {
        displayName: 'Mandatory Test Player',
        username: testUsername,
        password: tempPassword,
        confirmPassword: tempPassword,
        initialCoinBalance: 500,
        accountStatus: 'active'
      }
    });

    assert(createRes.status === 201, 'Admin user creation returned HTTP 201');
    assert(createRes.data.success === true, 'Admin user creation success flag is true');
    assert(createRes.data.data.mustChangePassword === true, 'Response data indicates mustChangePassword: true');
    assert(typeof createRes.data.message === 'string' && createRes.data.message.includes('must change temporary password'), 'Success message explicitly confirms mandatory password change on first login');

    testUserId = createRes.data.data.user.id;

    // Verify directly in MySQL
    const [userRows] = await pool.query('SELECT id, username, password_hash, must_change_password FROM users WHERE id = ?', [testUserId]);
    assert(userRows.length === 1, 'Created user found in MySQL database');
    assert(userRows[0].must_change_password === 1, 'Database field must_change_password is TRUE (1)');
    assert(userRows[0].password_hash.startsWith('scrypt$'), 'Password hash uses secure scrypt hashing format, not plain text');
    assert(!userRows[0].password_hash.includes(tempPassword), 'Stored hash does not contain plain text password');

    // SCENARIO B: First login with temporary credentials
    console.log('\n--- SCENARIO B: First login with temporary credentials ---');
    const firstLoginRes = await request('/auth/login', {
      method: 'POST',
      body: { username: testUsername, password: tempPassword }
    });

    assert(firstLoginRes.status === 200, 'Login with temporary password succeeded (200)');
    assert(firstLoginRes.data.mustChangePassword === true, 'Top-level response contains mustChangePassword: true');
    assert(firstLoginRes.data.user.mustChangePassword === true, 'User payload contains mustChangePassword: true');
    assert(Boolean(firstLoginRes.data.token), 'JWT/Auth token received');
    const playerToken = firstLoginRes.data.token;

    // SCENARIO C: Attempt to bypass the password change (Backend Enforcement)
    console.log('\n--- SCENARIO C: Strict Backend Authorization Enforcement ---');
    
    // Test wallet balance
    const walletRes = await request('/wallet/balance', { token: playerToken });
    assert(walletRes.status === 403, 'GET /wallet/balance blocked with HTTP 403');
    const walletCode = walletRes.data.code || walletRes.data.error?.code;
    assert(walletCode === 'PASSWORD_CHANGE_REQUIRED', 'GET /wallet/balance returned machine-readable code PASSWORD_CHANGE_REQUIRED');
    assert(walletRes.data.mustChangePassword === true || walletRes.data.error?.code === 'PASSWORD_CHANGE_REQUIRED', 'GET /wallet/balance returned mustChangePassword: true');

    // Test bet placement
    const betRes = await request('/bets/place', {
      method: 'POST',
      token: playerToken,
      body: { matchId: 1, betType: 'toss_winner', selectedTeam: 'team_one', stakeAmount: 100 }
    });
    assert(betRes.status === 403, 'POST /bets/place blocked with HTTP 403');
    assert((betRes.data.code || betRes.data.error?.code) === 'PASSWORD_CHANGE_REQUIRED', 'POST /bets/place returned PASSWORD_CHANGE_REQUIRED');

    // Test passbook transactions
    const passbookRes = await request('/passbook/transactions', { token: playerToken });
    assert(passbookRes.status === 403, 'GET /passbook/transactions blocked with HTTP 403');
    assert((passbookRes.data.code || passbookRes.data.error?.code) === 'PASSWORD_CHANGE_REQUIRED', 'GET /passbook/transactions returned PASSWORD_CHANGE_REQUIRED');

    // Test profile update
    const profileRes = await request('/auth/profile', {
      method: 'PUT',
      token: playerToken,
      body: { fullName: 'Hacked Name' }
    });
    assert(profileRes.status === 403, 'PUT /auth/profile blocked with HTTP 403');
    assert((profileRes.data.code || profileRes.data.error?.code) === 'PASSWORD_CHANGE_REQUIRED', 'PUT /auth/profile returned PASSWORD_CHANGE_REQUIRED');

    // Test permitted operations (auth inspection & logout)
    const meRes = await request('/auth/me', { token: playerToken });
    assert(meRes.status === 200, 'GET /auth/me remains accessible (200)');
    assert(meRes.data.user.mustChangePassword === true, 'GET /auth/me returns authoritative mustChangePassword: true');

    // SCENARIO D: Invalid password change attempts
    console.log('\n--- SCENARIO D: Validation and Rejection of Invalid Password Changes ---');

    // 1. Wrong current password
    const wrongCurrentRes = await request('/auth/change-password', {
      method: 'POST',
      token: playerToken,
      body: {
        currentPassword: 'IncorrectOldPassword999',
        newPassword: newPassword,
        confirmPassword: newPassword
      }
    });
    assert(wrongCurrentRes.status === 400, 'Incorrect current password rejected with HTTP 400');
    assert((wrongCurrentRes.data.code || wrongCurrentRes.data.error?.code) === 'INVALID_CURRENT_PASSWORD', 'Error code is INVALID_CURRENT_PASSWORD');

    // 2. Short new password (< 8 chars)
    const shortPwdRes = await request('/auth/change-password', {
      method: 'POST',
      token: playerToken,
      body: {
        currentPassword: tempPassword,
        newPassword: 'short',
        confirmPassword: 'short'
      }
    });
    assert(shortPwdRes.status === 400, 'Short new password rejected with HTTP 400');
    assert(['INVALID_PASSWORD_LENGTH', 'VALIDATION_ERROR'].includes(shortPwdRes.data.code || shortPwdRes.data.error?.code), 'Error code is INVALID_PASSWORD_LENGTH or VALIDATION_ERROR');

    // 3. Mismatched confirmation
    const mismatchRes = await request('/auth/change-password', {
      method: 'POST',
      token: playerToken,
      body: {
        currentPassword: tempPassword,
        newPassword: newPassword,
        confirmPassword: 'DifferentNewPassword@2026'
      }
    });
    assert(mismatchRes.status === 400, 'Mismatched confirm password rejected with HTTP 400');
    assert((mismatchRes.data.code || mismatchRes.data.error?.code) === 'PASSWORD_MISMATCH', 'Error code is PASSWORD_MISMATCH');

    // 4. Same password as temporary
    const samePwdRes = await request('/auth/change-password', {
      method: 'POST',
      token: playerToken,
      body: {
        currentPassword: tempPassword,
        newPassword: tempPassword,
        confirmPassword: tempPassword
      }
    });
    assert(samePwdRes.status === 400, 'New password same as current password rejected with HTTP 400');
    assert((samePwdRes.data.code || samePwdRes.data.error?.code) === 'SAME_PASSWORD', 'Error code is SAME_PASSWORD');

    // Verify DB still holds must_change_password = 1
    const [userRowsAfterFails] = await pool.query('SELECT must_change_password FROM users WHERE id = ?', [testUserId]);
    assert(userRowsAfterFails[0].must_change_password === 1, 'Database must_change_password remains 1 after failed attempts');

    // SCENARIO E: Successful password change
    console.log('\n--- SCENARIO E: Successful password change ---');
    const changeSuccessRes = await request('/auth/change-password', {
      method: 'POST',
      token: playerToken,
      body: {
        currentPassword: tempPassword,
        newPassword: newPassword,
        confirmPassword: newPassword
      }
    });

    assert(changeSuccessRes.status === 200, 'Password change request succeeded with HTTP 200');
    assert(changeSuccessRes.data.success === true, 'Success flag is true');
    assert(changeSuccessRes.data.mustChangePassword === false, 'Response confirms mustChangePassword: false');
    assert(Boolean(changeSuccessRes.data.token), 'Refreshed token returned');

    // Verify DB updated to must_change_password = 0
    const [userRowsAfterSuccess] = await pool.query('SELECT password_hash, must_change_password FROM users WHERE id = ?', [testUserId]);
    assert(userRowsAfterSuccess[0].must_change_password === 0, 'Database must_change_password successfully updated to 0 (FALSE)');
    assert(userRowsAfterSuccess[0].password_hash !== userRows[0].password_hash, 'Password hash in DB changed to new hash');

    // Verify protected endpoints immediately unblock using refreshed token
    const refreshedToken = changeSuccessRes.data.token;
    const walletAfterRes = await request('/wallet/balance', { token: refreshedToken });
    assert(walletAfterRes.status === 200, 'Protected GET /wallet/balance now succeeds (200)');
    assert(walletAfterRes.data.success === true, 'Wallet data retrieved successfully');

    // Even using original token, backend verifies live DB and unblocks!
    const walletWithOldTokenRes = await request('/wallet/balance', { token: playerToken });
    assert(walletWithOldTokenRes.status === 200, 'Backend checks live DB status so old valid token is also unblocked');

    // SCENARIO F: Subsequent login
    console.log('\n--- SCENARIO F: Subsequent login verification ---');
    // 1. Old temp password should now fail
    const oldLoginRes = await request('/auth/login', {
      method: 'POST',
      body: { username: testUsername, password: tempPassword }
    });
    assert(oldLoginRes.status === 401, 'Old temporary password rejected (HTTP 401)');

    // 2. New password succeeds and does NOT require password change
    const newLoginRes = await request('/auth/login', {
      method: 'POST',
      body: { username: testUsername, password: newPassword }
    });
    assert(newLoginRes.status === 200, 'Login with new password succeeded (HTTP 200)');
    assert(newLoginRes.data.mustChangePassword === false, 'mustChangePassword is FALSE on subsequent login');
    assert(newLoginRes.data.user.mustChangePassword === false, 'User mustChangePassword is FALSE on subsequent login');

    // SCENARIO G: Existing users remain unaffected
    console.log('\n--- SCENARIO G: Existing users remain unaffected ---');
    // 1. Verify dtb1 preserved user in database has must_change_password = 0
    const [dtb1Check] = await pool.query('SELECT username, must_change_password FROM users WHERE username = ?', ['dtb1']);
    assert(dtb1Check.length > 0, 'Existing production user dtb1 exists in database');
    assert(dtb1Check[0].must_change_password === 0, 'Existing user dtb1 has must_change_password = 0 (FALSE)');

    // 2. Simulate an existing pre-feature player account with must_change_password = 0
    const { hashPassword } = require('../backend/src/utils/crypto');
    const legacyUsername = `legacy_${Date.now()}`;
    const legacyPass = 'LegacyPassword@2025';
    const legacyHash = hashPassword(legacyPass);
    const [legacyInsert] = await pool.query(
      `INSERT INTO users (uuid, full_name, username, email, password_hash, role, status, must_change_password)
       VALUES (UUID(), 'Legacy Player', ?, ?, ?, 'user', 'active', FALSE)`,
      [legacyUsername, `${legacyUsername}@example.com`, legacyHash]
    );
    const legacyUserId = legacyInsert.insertId;
    await pool.query('INSERT INTO wallets (user_id, available_balance, exposure_balance) VALUES (?, 1000, 0)', [legacyUserId]);

    const legacyLoginRes = await request('/auth/login', {
      method: 'POST',
      body: { username: legacyUsername, password: legacyPass }
    });
    assert(legacyLoginRes.status === 200, 'Legacy existing user login succeeded');
    assert(legacyLoginRes.data.mustChangePassword === false, 'Legacy user mustChangePassword is FALSE');
    assert(legacyLoginRes.data.user.mustChangePassword === false, 'Legacy user payload has mustChangePassword: false');

    const legacyToken = legacyLoginRes.data.token;
    const legacyWalletRes = await request('/wallet/balance', { token: legacyToken });
    assert(legacyWalletRes.status === 200, 'Existing user accesses protected wallet with zero restrictions');

    // Clean up legacy test user
    await pool.query('DELETE FROM wallets WHERE user_id = ?', [legacyUserId]);
    await pool.query('DELETE FROM users WHERE id = ?', [legacyUserId]);

    // SCENARIO H: Admin and Authorization Regression
    console.log('\n--- SCENARIO H: Admin permissions and cross-user security ---');
    const forbiddenAdminRes = await request('/admin/dashboard/stats', { token: refreshedToken });
    assert(forbiddenAdminRes.status === 403, 'Ordinary user blocked from accessing admin dashboard (403 FORBIDDEN)');

    // SCENARIO I: Admin password reset functionality
    console.log('\n--- SCENARIO I: Admin password reset with mandatory change ---');
    const adminResetRes = await request(`/admin/users/${testUserId}/reset-password`, {
      method: 'POST',
      token: adminToken,
      body: {
        newPassword: 'AdminResetPassword@2026',
        requirePasswordChange: true
      }
    });
    assert(adminResetRes.status === 200, 'Admin password reset succeeded (200)');
    assert(adminResetRes.data.data.mustChangePassword === true, 'Admin reset sets mustChangePassword: true');

    // Verify DB flag
    const [userRowsAfterReset] = await pool.query('SELECT must_change_password FROM users WHERE id = ?', [testUserId]);
    assert(userRowsAfterReset[0].must_change_password === 1, 'Database must_change_password is TRUE (1) after admin reset');

    // User logs in with reset password
    const resetLoginRes = await request('/auth/login', {
      method: 'POST',
      body: { username: testUsername, password: 'AdminResetPassword@2026' }
    });
    assert(resetLoginRes.status === 200, 'Login with reset password succeeded');
    assert(resetLoginRes.data.mustChangePassword === true, 'Reset login requires password change (mustChangePassword: true)');

    // User is blocked again from protected operations
    const blockedAgainRes = await request('/wallet/balance', { token: resetLoginRes.data.token });
    assert(blockedAgainRes.status === 403, 'User blocked again until changing password');
    assert((blockedAgainRes.data.code || blockedAgainRes.data.error?.code) === 'PASSWORD_CHANGE_REQUIRED', 'Error code is PASSWORD_CHANGE_REQUIRED');

    // User sets final password
    const secondChangeRes = await request('/auth/change-password', {
      method: 'POST',
      token: resetLoginRes.data.token,
      body: {
        currentPassword: 'AdminResetPassword@2026',
        newPassword: 'FinalPlayerPassword@2026',
        confirmPassword: 'FinalPlayerPassword@2026'
      }
    });
    assert(secondChangeRes.status === 200, 'Final password change succeeded (200)');
    assert(secondChangeRes.data.mustChangePassword === false, 'mustChangePassword cleared back to false');

    // Clean up test user
    console.log('\n--- CLEANUP: Removing test user ---');
    await pool.query('DELETE FROM wallets WHERE user_id = ?', [testUserId]);
    await pool.query('DELETE FROM sessions WHERE user_id = ?', [testUserId]);
    await pool.query('DELETE FROM user_preferences WHERE user_id = ?', [testUserId]);
    await pool.query('DELETE FROM admin_audit_logs WHERE target_id = ? OR target_identifier = ?', [testUserId, testUsername]);
    await pool.query('DELETE FROM users WHERE id = ?', [testUserId]);
    console.log(`  [CLEANUP] Cleaned up temporary test user ${testUsername} (id: ${testUserId})`);

    console.log('\n===============================================================');
    console.log(` ALL REGRESSION TESTS PASSED! (${passed} checks passed, 0 failed)`);
    console.log('===============================================================\n');
  } catch (err) {
    console.error('\n[FATAL ERROR IN TEST SUITE]:', err);
    // Cleanup if test user was created
    if (testUserId) {
      try {
        await pool.query('DELETE FROM wallets WHERE user_id = ?', [testUserId]);
        await pool.query('DELETE FROM sessions WHERE user_id = ?', [testUserId]);
        await pool.query('DELETE FROM user_preferences WHERE user_id = ?', [testUserId]);
        await pool.query('DELETE FROM admin_audit_logs WHERE target_id = ? OR target_identifier = ?', [testUserId, testUsername]);
        await pool.query('DELETE FROM users WHERE id = ?', [testUserId]);
      } catch (_) {}
    }
    process.exit(1);
  } finally {
    await closePool();
  }
}

runRegressionTests();
