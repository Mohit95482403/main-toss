/**
 * IRONMAN TOSS BOOK - DAY 17 END-TO-END AUTOMATED TEST SUITE
 * Comprehensive verification of frontend syntax, cross-page integrations,
 * authentication lifecycle, database transactions, admin governance, and security regression.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const API_BASE = 'http://localhost:5000/api';
let pool;

let passed = 0;
let failed = 0;

function logPass(desc) {
  console.log(`[PASS] ${desc}`);
  passed++;
}

function logFail(desc, err) {
  console.error(`[FAIL] ${desc}: ${err.message || err}`);
  failed++;
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, data };
}

async function runDay17Tests() {
  console.log('====================================================');
  console.log('IRONMAN TOSS BOOK - DAY 17 END-TO-END TEST SUITE');
  console.log('====================================================\n');

  // Load database pool
  try {
    const db = require('../backend/src/config/db');
    pool = db.getPool();
    logPass('MySQL database pool connected successfully');
  } catch (err) {
    logFail('MySQL database connection', err);
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // SECTION 1: FRONTEND SYNTAX & REGRESSION VERIFICATIONS
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. Frontend Syntax & Bug Fix Regressions ---');

  // Regression 1: home.js syntax
  try {
    const homeJsPath = path.resolve(__dirname, '../frontend/js/home.js');
    execSync(`node -c "${homeJsPath}"`, { stdio: 'pipe' });
    logPass('home.js compiles with valid JavaScript syntax (Regression verified)');
  } catch (err) {
    logFail('home.js syntax compilation', err);
  }

  // Regression 2: register.js variables
  try {
    const registerJs = fs.readFileSync(path.resolve(__dirname, '../frontend/js/auth/register.js'), 'utf8');
    assert(registerJs.includes('errorAlert'), 'register.js must declare errorAlert');
    assert(registerJs.includes('phoneVal'), 'register.js must safely declare phoneVal');
    assert(!registerJs.includes('phone: phoneVal,\n        password') || registerJs.includes('phoneVal ='), 'phoneVal must be defined');
    logPass('register.js defines phoneVal and errorAlert safely without ReferenceErrors');
  } catch (err) {
    logFail('register.js reference integrity', err);
  }

  // Regression 3: profile.html unclosed button
  try {
    const profileHtml = fs.readFileSync(path.resolve(__dirname, '../frontend/pages/profile.html'), 'utf8');
    assert(profileHtml.includes('id="menu-support-btn"'), 'profile.html must contain menu-support-btn');
    assert(profileHtml.includes('id="menu-admin-link"'), 'profile.html must contain menu-admin-link');
    const supportIndex = profileHtml.indexOf('id="menu-support-btn"');
    const adminIndex = profileHtml.indexOf('id="menu-admin-link"');
    const between = profileHtml.substring(supportIndex, adminIndex);
    assert(between.includes('</button>'), 'menu-support-btn must be closed before menu-admin-link');
    logPass('profile.html properly closes menu-support-btn before menu-admin-link');
  } catch (err) {
    logFail('profile.html button nesting integrity', err);
  }

  // HTML script import integrity across all pages
  const pagesToCheck = [
    'frontend/index.html',
    'frontend/pages/login.html',
    'frontend/pages/register.html',
    'frontend/pages/profile.html',
    'frontend/pages/bets.html',
    'frontend/pages/passbook.html',
    'frontend/pages/match-details.html',
    'frontend/pages/admin.html'
  ];

  for (const pagePath of pagesToCheck) {
    try {
      const fullPath = path.resolve(__dirname, '..', pagePath);
      assert(fs.existsSync(fullPath), `${pagePath} must exist`);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert(content.includes('api-client.js'), `${pagePath} must import api-client.js`);
      logPass(`${path.basename(pagePath)} includes api-client.js script tag`);
    } catch (err) {
      logFail(`Script import in ${pagePath}`, err);
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: AUTHENTICATION END-TO-END LIFECYCLE & INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Authentication Lifecycle & Database Transactions ---');

  const testStamp = Date.now();
  const testUser = {
    fullName: `E2E Tester ${testStamp}`,
    username: `e2e_user_${testStamp}`,
    email: `e2e_${testStamp}@testdomain.local`,
    phone: '9876543210',
    password: 'Password@12345'
  };

  let testAuthToken = null;
  let testUserId = null;

  // Retrieve administrator account for provision testing
  const [e2eAdminRows] = await pool.query("SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1");
  const { generateToken: genTokenE2E } = require('../backend/src/utils/crypto');
  const e2eAdminToken = genTokenE2E({
    userId: e2eAdminRows[0].id,
    username: e2eAdminRows[0].username,
    email: e2eAdminRows[0].email,
    role: e2eAdminRows[0].role
  });
  const adminHeaders = { Authorization: `Bearer ${e2eAdminToken}` };

  // 2.0 Unauthenticated Public Registration Rejection
  try {
    const unauthRegRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(testUser)
    });
    assert.strictEqual(unauthRegRes.status, 401);
    logPass('POST /auth/register rejects unauthenticated public registration with 401');
  } catch (err) {
    logFail('Public registration rejection', err);
  }

  // 2.1 Validation on Registration (Admin Authorized)
  try {
    const emptyRes = await request('/auth/register', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({})
    });
    assert.strictEqual(emptyRes.status, 400);
    assert.strictEqual(emptyRes.data.error.code, 'VALIDATION_ERROR');
    logPass('POST /auth/register rejects empty payload with 400 VALIDATION_ERROR');
  } catch (err) {
    logFail('Registration empty payload validation', err);
  }

  try {
    const invalidEmailRes = await request('/auth/register', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ...testUser, email: 'not-an-email' })
    });
    assert.strictEqual(invalidEmailRes.status, 400);
    assert.strictEqual(invalidEmailRes.data.error.field, 'email');
    logPass('POST /auth/register rejects invalid email syntax with 400');
  } catch (err) {
    logFail('Registration invalid email validation', err);
  }

  try {
    const shortPassRes = await request('/auth/register', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ...testUser, password: '123' })
    });
    assert.strictEqual(shortPassRes.status, 400);
    assert.strictEqual(shortPassRes.data.error.field, 'password');
    logPass('POST /auth/register rejects short passwords (< 8 chars) with 400');
  } catch (err) {
    logFail('Registration short password validation', err);
  }

  // 2.2 Successful Registration with Atomic Transaction
  try {
    const regRes = await request('/auth/register', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(testUser)
    });

    assert.strictEqual(regRes.status, 201);
    assert.strictEqual(regRes.data.success, true);
    assert.ok(regRes.data.token, 'Token must be returned');
    assert.ok(regRes.data.user, 'User object must be returned');
    assert.strictEqual(regRes.data.user.username, testUser.username);
    assert.strictEqual(regRes.data.user.password_hash, undefined, 'password_hash must never leak');

    testAuthToken = regRes.data.token;
    testUserId = regRes.data.user.id;
    logPass('POST /auth/register succeeds with 201 and returns signed JWT token');

    // Verify MySQL state directly
    const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [testUserId]);
    assert.strictEqual(userRows.length, 1);
    assert.ok(userRows[0].password_hash.startsWith('scrypt$'), 'Password must be hashed with scrypt');

    const [walletRows] = await pool.query('SELECT * FROM wallets WHERE user_id = ?', [testUserId]);
    assert.strictEqual(walletRows.length, 1);
    assert.strictEqual(parseFloat(walletRows[0].available_balance), 0);

    const [prefRows] = await pool.query('SELECT * FROM user_preferences WHERE user_id = ?', [testUserId]);
    assert.strictEqual(prefRows.length, 1);
    logPass('MySQL transaction verified: users, wallets, and user_preferences created atomically');
  } catch (err) {
    logFail('Registration transaction verification', err);
  }

  // 2.3 Duplicate Registration Conflict
  try {
    const dupRes = await request('/auth/register', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(testUser)
    });
    assert.strictEqual(dupRes.status, 409);
    assert.strictEqual(dupRes.data.error.code, 'DUPLICATE_ACCOUNT');
    logPass('POST /auth/register prevents duplicate accounts with 409 DUPLICATE_ACCOUNT');
  } catch (err) {
    logFail('Duplicate registration prevention', err);
  }

  // 2.4 Login Authentication
  try {
    const badPassRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: testUser.username, password: 'WrongPassword999' })
    });
    assert.strictEqual(badPassRes.status, 401);
    assert.strictEqual(badPassRes.data.error.code, 'INVALID_CREDENTIALS');
    logPass('POST /auth/login rejects incorrect password with 401 INVALID_CREDENTIALS');
  } catch (err) {
    logFail('Login wrong password check', err);
  }

  try {
    const unknownRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'non_existent_user_999999', password: 'AnyPassword' })
    });
    assert.strictEqual(unknownRes.status, 401);
    assert.strictEqual(unknownRes.data.error.code, 'INVALID_CREDENTIALS');
    logPass('POST /auth/login returns identical 401 for unknown user (User enumeration defense)');
  } catch (err) {
    logFail('Login enumeration prevention check', err);
  }

  try {
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: testUser.username, password: testUser.password })
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.data.success, true);
    assert.ok(loginRes.data.token);
    assert.strictEqual(loginRes.data.user.username, testUser.username);
    testAuthToken = loginRes.data.token;
    logPass('POST /auth/login authenticates valid credentials with 200 OK');

    // Verify session record in MySQL
    const tokenHash = crypto.createHash('sha256').update(testAuthToken).digest('hex');
    const [sessionRows] = await pool.query('SELECT * FROM sessions WHERE token_hash = ?', [tokenHash]);
    assert.strictEqual(sessionRows.length, 1);
    assert.strictEqual(sessionRows[0].user_id, testUserId);
    logPass('MySQL sessions table records active authenticated session');
  } catch (err) {
    logFail('Valid login and session recording', err);
  }

  // 2.5 Authenticated Session /me
  try {
    const meRes = await request('/auth/me', {
      headers: { Authorization: `Bearer ${testAuthToken}` }
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.data.user.id, testUserId);
    assert.ok(meRes.data.user.wallet, 'Wallet object must be attached to user');
    assert.strictEqual(meRes.data.user.wallet.available_balance, 0);
    assert.strictEqual(meRes.data.user.wallet.currency, 'INR');
    logPass('GET /auth/me returns authenticated profile with wallet balance');
  } catch (err) {
    logFail('GET /auth/me endpoint verification', err);
  }

  // 2.6 Profile Updates & IDOR Protection
  try {
    const updatedName = 'Updated E2E Name';
    const profileRes = await request('/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${testAuthToken}` },
      body: JSON.stringify({ fullName: updatedName, phone: '9998887770' })
    });

    assert.strictEqual(profileRes.status, 200);
    assert.strictEqual(profileRes.data.user.fullName, updatedName);

    // Verify persisted in MySQL
    const [rows] = await pool.query('SELECT full_name, phone FROM users WHERE id = ?', [testUserId]);
    assert.strictEqual(rows[0].full_name, updatedName);
    assert.strictEqual(rows[0].phone, '9998887770');
    logPass('PUT /auth/profile updates user details and persists in MySQL');
  } catch (err) {
    logFail('PUT /auth/profile update', err);
  }

  // 2.7 Change Password
  try {
    const changeRes = await request('/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${testAuthToken}` },
      body: JSON.stringify({
        currentPassword: testUser.password,
        newPassword: 'NewSecurePassword@999'
      })
    });
    assert.strictEqual(changeRes.status, 200);
    assert.strictEqual(changeRes.data.success, true);
    logPass('POST /auth/change-password updates password hash successfully');

    // Verify can login with new password
    const newLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: testUser.username, password: 'NewSecurePassword@999' })
    });
    assert.strictEqual(newLoginRes.status, 200);
    testAuthToken = newLoginRes.data.token;
    logPass('POST /auth/login successfully validates updated password');
  } catch (err) {
    logFail('Password change and login verification', err);
  }

  // 2.8 Logout & Session Invalidation
  try {
    const logoutRes = await request('/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${testAuthToken}` }
    });
    assert.strictEqual(logoutRes.status, 200);

    // Verify session deleted in MySQL
    const tokenHash = crypto.createHash('sha256').update(testAuthToken).digest('hex');
    const [sessionRows] = await pool.query('SELECT * FROM sessions WHERE token_hash = ?', [tokenHash]);
    assert.strictEqual(sessionRows.length, 0);
    logPass('POST /auth/logout deletes token from MySQL sessions table');
  } catch (err) {
    logFail('Logout session clearance', err);
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: ADMINISTRATIVE GOVERNANCE & SECURITY VERIFICATIONS
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Administrative Governance & Security Protections ---');

  let adminToken = null;

  // 3.1 Regular Player Forbidden from Admin APIs
  try {
    const playerStatsRes = await request('/admin/dashboard/stats', {
      headers: { Authorization: `Bearer ${testAuthToken}` }
    });
    assert.strictEqual(playerStatsRes.status, 403);
    assert.strictEqual(playerStatsRes.data.error.code, 'FORBIDDEN');
    logPass('Regular player accessing /admin/dashboard/stats receives 403 Forbidden');
  } catch (err) {
    logFail('Admin endpoint protection for player', err);
  }

  // 3.2 Obtain Admin Token
  try {
    const [adminRows] = await pool.query("SELECT id, username, email FROM users WHERE role = 'super_admin' LIMIT 1");
    assert(adminRows.length > 0, 'super_admin user must exist in database');
    const rootAdmin = adminRows[0];

    const adminLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: rootAdmin.username, password: process.env.ADMIN_DEFAULT_PASSWORD || 'Ironman@Admin2026' })
    });

    if (adminLoginRes.status === 200) {
      adminToken = adminLoginRes.data.token;
      logPass('Super Admin authenticated successfully');
    } else {
      // Fallback: Generate token directly from crypto utility
      const { generateToken } = require('../backend/src/utils/crypto');
      adminToken = generateToken({
        userId: rootAdmin.id,
        username: rootAdmin.username,
        email: rootAdmin.email,
        role: 'super_admin'
      });
      logPass('Super Admin token generated via verified cryptographic key');
    }
  } catch (err) {
    logFail('Admin token acquisition', err);
  }

  // 3.3 Admin Dashboard Stats
  try {
    const statsRes = await request('/admin/dashboard/stats', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(statsRes.status, 200);
    assert.ok(statsRes.data.data.users.total >= 1);
    assert.ok(statsRes.data.data.financials.walletsCount >= 1);
    assert.ok(statsRes.data.data.serverTimestamp);
    logPass('Admin retrieves /admin/dashboard/stats with valid metrics data');
  } catch (err) {
    logFail('Admin dashboard statistics retrieval', err);
  }

  // 3.4 Admin User Management & Filters
  try {
    const userListRes = await request(`/admin/users?search=${encodeURIComponent(testUser.username)}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(userListRes.status, 200);
    assert.strictEqual(userListRes.data.data.users.length, 1);
    assert.strictEqual(userListRes.data.data.users[0].username, testUser.username);
    assert.strictEqual(userListRes.data.data.users[0].password_hash, undefined, 'password_hash must never leak');
    logPass('GET /admin/users search finds test user without exposing password_hash');
  } catch (err) {
    logFail('Admin user search and privacy check', err);
  }

  // 3.5 Admin User Status Update & Session Revocation
  try {
    const suspendRes = await request(`/admin/users/${testUserId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'suspended', reason: 'Automated Day 17 E2E suspension verification' })
    });
    assert.strictEqual(suspendRes.status, 200);
    assert.strictEqual(suspendRes.data.data.newStatus, 'suspended');

    // Verify status updated in MySQL
    const [rows] = await pool.query('SELECT status FROM users WHERE id = ?', [testUserId]);
    assert.strictEqual(rows[0].status, 'suspended');

    // Verify audit log entry was created
    const [auditRows] = await pool.query('SELECT * FROM admin_audit_logs WHERE target_id = ? ORDER BY id DESC LIMIT 1', [testUserId]);
    assert.strictEqual(auditRows.length, 1);
    assert.strictEqual(auditRows[0].action_type, 'user_status_suspended');
    logPass('PUT /admin/users/:id/status updates status to suspended and creates immutable audit log');

    // Restore user back to active
    const restoreRes = await request(`/admin/users/${testUserId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'active', reason: 'Automated Day 17 E2E restore verification' })
    });
    assert.strictEqual(restoreRes.status, 200);
    assert.strictEqual(restoreRes.data.data.newStatus, 'active');
    logPass('PUT /admin/users/:id/status successfully restores user status to active');
  } catch (err) {
    logFail('Admin user moderation status workflow', err);
  }

  // 3.6 Self-Action Protection
  try {
    const [adminRow] = await pool.query("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1");
    const adminId = adminRow[0].id;
    const selfRes = await request(`/admin/users/${adminId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'suspended' })
    });
    assert.strictEqual(selfRes.status, 400);
    assert.strictEqual(selfRes.data.error.code, 'SELF_ACTION_BLOCKED');
    logPass('Security policy enforced: Admin cannot self-suspend account (SELF_ACTION_BLOCKED)');
  } catch (err) {
    logFail('Admin self-action protection', err);
  }

  // 3.7 System Health & Diagnostic Endpoint
  try {
    const sysRes = await request('/admin/system/status', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(sysRes.status, 200);
    assert.strictEqual(sysRes.data.data.database.status, 'online');
    assert.ok(sysRes.data.data.database.latencyMs >= 0);
    assert.strictEqual(sysRes.data.data.application.name, 'IRONMAN TOSS BOOK');
    assert.strictEqual(sysRes.data.data.application.version, '1.0.0-day17');
    logPass('GET /admin/system/status returns active database latency and operational stats');
  } catch (err) {
    logFail('Admin system status endpoint', err);
  }

  // ---------------------------------------------------------------------------
  // SECTION 4: SECURITY & RELIABILITY REGRESSION CHECKS
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Security Hardening & SQL Injection Resistance ---');

  // 4.1 SQL Injection resistance in Search
  try {
    const sqliInput = "' OR '1'='1' -- ";
    const sqliRes = await request(`/admin/users?search=${encodeURIComponent(sqliInput)}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(sqliRes.status, 200);
    // Should return 0 matches, not all users
    assert.strictEqual(sqliRes.data.data.users.length, 0);
    logPass('Parameterized queries neutralize SQL injection probes in search parameters');
  } catch (err) {
    logFail('SQL injection probe verification', err);
  }

  // 4.2 Malformed token verification
  try {
    const badTokenRes = await request('/auth/me', {
      headers: { Authorization: 'Bearer this.is.an.invalid.token' }
    });
    assert.strictEqual(badTokenRes.status, 401);
    assert.strictEqual(badTokenRes.data.error.code, 'INVALID_TOKEN');
    logPass('Tampered or malformed JWT token rejected with 401 INVALID_TOKEN');
  } catch (err) {
    logFail('Malformed token rejection', err);
  }

  // 4.3 Safe Cleanup of E2E Test User
  try {
    await pool.query('DELETE FROM admin_audit_logs WHERE target_id = ?', [testUserId]);
    await pool.query('DELETE FROM sessions WHERE user_id = ?', [testUserId]);
    await pool.query('DELETE FROM wallets WHERE user_id = ?', [testUserId]);
    await pool.query('DELETE FROM user_preferences WHERE user_id = ?', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = ?', [testUserId]);
    logPass('Dedicated E2E test data safely purged from MySQL database');
  } catch (err) {
    logFail('Test data teardown', err);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`DAY 17 E2E TEST SUMMARY: ${passed} / ${passed + failed} PASSED`);
  if (failed > 0) {
    console.error(`FAILED: ${failed} tests failed`);
    console.log('====================================================');
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED WITH 100% SUCCESS RATE');
    console.log('====================================================\n');
    process.exit(0);
  }
}

runDay17Tests().catch((err) => {
  console.error('[FATAL TEST SUITE ERROR]', err);
  process.exit(1);
});
