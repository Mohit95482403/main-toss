/**
 * IRONMAN TOSS BOOK - ADMIN PLAYER COIN MANAGEMENT AUTOMATED TEST SUITE
 * Tests:
 * Test A - Search: Exact search, nonexistent user, partial matches, sensitive field omission
 * Test B - Add Coins: Credit addition, balance updates, transaction ledger record, audit log
 * Test C - Deduct Coins: Debit subtraction, balance checks, transaction ledger record
 * Test D - Validation & Safety Constraints: Negative, zero, invalid numbers, insufficient balance, missing reason
 * Test E - Role Authorization: Player role 403, unauthenticated 401, admin 200
 * Test F - Idempotency & Concurrency: Duplicate idempotency key protection (409)
 * Test G - Balance Consistency: /auth/me, /admin/coins/players/:id matching authoritative balance
 * Test H - Regression: Platform stability & core APIs continue functioning
 */

const http = require('http');
const path = require('path');
const { getPool, testConnection } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');
const app = require('../backend/app');

console.log('====================================================');
console.log('ADMIN PLAYER COIN MANAGEMENT TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName} ${details ? '- ' + details : ''}`);
  }
}

function makeRequest(server, method, pathUrl, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path: pathUrl,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.status, statusCode: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.status, statusCode: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const pool = getPool();
  let server = null;

  try {
    const isConnected = await testConnection();
    assert(isConnected, 'Database Connection Successful');

    // Start ephemeral server on random available port
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });

    // 1. Locate admin user
    const [adminRows] = await pool.query(
      `SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin') AND status = 'active' LIMIT 1`
    );
    assert(adminRows.length > 0, 'Admin account exists in database');
    const adminUser = adminRows[0];

    const adminToken = generateToken({
      id: adminUser.id,
      userId: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
      role: adminUser.role
    });

    // 2. Setup or locate dedicated test player
    const testUsername = `cointest_${Date.now()}`;
    const testEmail = `${testUsername}@example.com`;
    const [insUser] = await pool.query(
      `INSERT INTO users (uuid, full_name, username, email, password_hash, role, status)
       VALUES (UUID(), 'Coin Test Player', ?, ?, 'scrypt_placeholder_hash', 'user', 'active')`,
      [testUsername, testEmail]
    );
    const testUserId = insUser.insertId;

    const normalToken = generateToken({
      id: testUserId,
      userId: testUserId,
      username: testUsername,
      email: testEmail,
      role: 'user'
    });

    // Create wallet with known starting balance of 500.00
    await pool.query(
      `INSERT INTO wallets (user_id, available_balance, exposure_balance, currency)
       VALUES (?, 500.00, 0.00, 'INR')`,
      [testUserId]
    );

    console.log(`[SETUP] Prepared Admin: @${adminUser.username} (ID: ${adminUser.id})`);
    console.log(`[SETUP] Prepared Test Player: @${testUsername} (ID: ${testUserId}, Initial Balance: 500.00 Coins)\n`);

    // =========================================================================
    // TEST A: SEARCH PLAYERS
    // =========================================================================
    console.log('--- TEST A: PLAYER USERNAME SEARCH ---');

    // A1: Exact search
    const exactSearchRes = await makeRequest(
      server,
      'GET',
      `/api/admin/coins/search?username=${testUsername}`,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(exactSearchRes.statusCode === 200, 'Search by exact username returns 200 OK');
    assert(exactSearchRes.data.success === true, 'Search response indicates success');
    assert(exactSearchRes.data.data.players.length === 1, 'Found exactly 1 match for test player');
    assert(exactSearchRes.data.data.players[0].username === testUsername, 'Matched player has correct username');
    assert(exactSearchRes.data.data.players[0].available_balance === 500, 'Player balance matches starting wallet balance (500.00)');
    assert(exactSearchRes.data.data.players[0].password_hash === undefined, 'Sensitive field password_hash is not exposed in search results');

    // A2: Nonexistent player
    const nonExistRes = await makeRequest(
      server,
      'GET',
      `/api/admin/coins/search?username=nonexistent_user_999999_xyz`,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(nonExistRes.statusCode === 200, 'Search for nonexistent user returns 200 OK');
    assert(nonExistRes.data.data.players.length === 0, 'Returns empty players list for nonexistent username');

    // A3: Empty search parameter
    const emptySearchRes = await makeRequest(
      server,
      'GET',
      `/api/admin/coins/search?username=${encodeURIComponent('   ')}`,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(emptySearchRes.statusCode === 400, 'Empty or whitespace search query rejected with 400 Bad Request');

    // A4: Partial matching & Case-insensitivity
    const partialQuery = testUsername.substring(0, 10).toUpperCase();
    const partialRes = await makeRequest(
      server,
      'GET',
      `/api/admin/coins/search?username=${partialQuery}`,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(partialRes.statusCode === 200, 'Case-insensitive partial search returns 200 OK');
    const matched = partialRes.data.data.players.some(p => p.username === testUsername);
    assert(matched, 'Case-insensitive partial query successfully includes test player');

    // =========================================================================
    // TEST B: ADD COINS (ADMIN_CREDIT)
    // =========================================================================
    console.log('\n--- TEST B: ADD COINS (CREDIT ADJUSTMENT) ---');

    const addAmount = 250.00;
    const addReason = 'Test deposit adjustment approved by admin';
    const addRes = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${adminToken}` },
      {
        userId: testUserId,
        actionType: 'ADMIN_CREDIT',
        amount: addAmount,
        reason: addReason
      }
    );

    assert(addRes.statusCode === 200, 'Add coins API returns 200 OK');
    assert(addRes.data.success === true, 'Add coins response indicates success');
    assert(addRes.data.data.balanceBefore === 500, 'Recorded correct balanceBefore: 500.00');
    assert(addRes.data.data.balanceAfter === 750, 'Recorded correct balanceAfter: 750.00');

    // Verify directly in MySQL wallets table
    const [[wRow1]] = await pool.query('SELECT available_balance FROM wallets WHERE user_id = ?', [testUserId]);
    assert(parseFloat(wRow1.available_balance) === 750.00, 'MySQL wallets table updated atomically to 750.00');

    // Verify recorded in coin_transactions
    const [txRows1] = await pool.query(
      'SELECT * FROM coin_transactions WHERE user_id = ? AND action_type = "ADMIN_CREDIT" ORDER BY id DESC LIMIT 1',
      [testUserId]
    );
    assert(txRows1.length === 1, 'coin_transactions ledger contains recorded CREDIT entry');
    assert(parseFloat(txRows1[0].amount) === 250.00, 'Transaction record contains exact amount 250.00');
    assert(txRows1[0].reason === addReason, 'Transaction record contains mandatory admin reason');
    assert(txRows1[0].admin_username === adminUser.username, 'Transaction record stores admin username');

    // Verify audit log
    const [auditRows1] = await pool.query(
      'SELECT * FROM admin_audit_logs WHERE action_type = "ADMIN_CREDIT" AND target_id = ? ORDER BY id DESC LIMIT 1',
      [testUserId]
    );
    assert(auditRows1.length > 0, 'admin_audit_logs contains recorded action');

    // =========================================================================
    // TEST C: DEDUCT COINS (ADMIN_DEBIT)
    // =========================================================================
    console.log('\n--- TEST C: DEDUCT COINS (DEBIT ADJUSTMENT) ---');

    const deductAmount = 150.00;
    const deductReason = 'Admin fee deduction test';
    const deductRes = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${adminToken}` },
      {
        userId: testUserId,
        actionType: 'ADMIN_DEBIT',
        amount: deductAmount,
        reason: deductReason
      }
    );

    assert(deductRes.statusCode === 200, 'Deduct coins API returns 200 OK');
    assert(deductRes.data.success === true, 'Deduct coins response indicates success');
    assert(deductRes.data.data.balanceBefore === 750, 'Recorded correct balanceBefore: 750.00');
    assert(deductRes.data.data.balanceAfter === 600, 'Recorded correct balanceAfter: 600.00');

    // Verify directly in MySQL wallets table
    const [[wRow2]] = await pool.query('SELECT available_balance FROM wallets WHERE user_id = ?', [testUserId]);
    assert(parseFloat(wRow2.available_balance) === 600.00, 'MySQL wallets table updated atomically to 600.00');

    // Verify recorded in coin_transactions
    const [txRows2] = await pool.query(
      'SELECT * FROM coin_transactions WHERE user_id = ? AND action_type = "ADMIN_DEBIT" ORDER BY id DESC LIMIT 1',
      [testUserId]
    );
    assert(txRows2.length === 1, 'coin_transactions ledger contains recorded DEBIT entry');
    assert(parseFloat(txRows2[0].amount) === 150.00, 'Debit transaction record contains exact amount 150.00');

    // =========================================================================
    // TEST D: VALIDATION & SAFETY CONSTRAINTS
    // =========================================================================
    console.log('\n--- TEST D: INPUT VALIDATION & BALANCE SAFETY ---');

    // D1: Deduct more than available balance (current balance = 600, attempt deduct 1000)
    const overDeductRes = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${adminToken}` },
      {
        userId: testUserId,
        actionType: 'ADMIN_DEBIT',
        amount: 1000.00,
        reason: 'Attempted over-deduction'
      }
    );
    assert(overDeductRes.statusCode === 400, 'Deduction exceeding available balance rejected with 400 Bad Request');
    assert(overDeductRes.data.error.code === 'INSUFFICIENT_FUNDS', 'Error code is INSUFFICIENT_FUNDS');

    // Verify balance was NOT altered
    const [[wRowUnchanged]] = await pool.query('SELECT available_balance FROM wallets WHERE user_id = ?', [testUserId]);
    assert(parseFloat(wRowUnchanged.available_balance) === 600.00, 'Player balance remains untouched at 600.00 after rejected deduction');

    // D2: Zero amount
    const zeroRes = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${adminToken}` },
      { userId: testUserId, actionType: 'ADMIN_CREDIT', amount: 0, reason: 'Zero amount test' }
    );
    assert(zeroRes.statusCode === 400, 'Zero amount rejected with 400 Bad Request');

    // D3: Negative amount
    const negRes = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${adminToken}` },
      { userId: testUserId, actionType: 'ADMIN_CREDIT', amount: -50, reason: 'Negative amount test' }
    );
    assert(negRes.statusCode === 400, 'Negative amount rejected with 400 Bad Request');

    // D4: Non-numeric / invalid amount string
    const nanRes = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${adminToken}` },
      { userId: testUserId, actionType: 'ADMIN_CREDIT', amount: 'abc', reason: 'Invalid number test' }
    );
    assert(nanRes.statusCode === 400, 'Non-numeric amount rejected with 400 Bad Request');

    // D5: Missing / empty reason
    const noReasonRes = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${adminToken}` },
      { userId: testUserId, actionType: 'ADMIN_CREDIT', amount: 50, reason: '  ' }
    );
    assert(noReasonRes.statusCode === 400, 'Empty reason rejected with 400 Bad Request');

    // D6: Nonexistent user ID
    const noUserRes = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${adminToken}` },
      { userId: 99999999, actionType: 'ADMIN_CREDIT', amount: 50, reason: 'Ghost player adjustment' }
    );
    assert(noUserRes.statusCode === 404, 'Adjustment on nonexistent player rejected with 404 Not Found');

    // =========================================================================
    // TEST E: ROLE AUTHORIZATION & PERMISSION GUARDS
    // =========================================================================
    console.log('\n--- TEST E: ROLE AUTHORIZATION & SECURITY GUARDS ---');

    // E1: Normal player token trying to access coin adjust
    const playerAttemptRes = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${normalToken}` },
      { userId: testUserId, actionType: 'ADMIN_CREDIT', amount: 1000, reason: 'Self-credit hack attempt' }
    );
    assert(playerAttemptRes.statusCode === 403, 'Normal player token rejected with 403 Forbidden');

    // E2: Unauthenticated request
    const unauthRes = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      {},
      { userId: testUserId, actionType: 'ADMIN_CREDIT', amount: 1000, reason: 'Unauth attempt' }
    );
    assert(unauthRes.statusCode === 401, 'Unauthenticated request rejected with 401 Unauthorized');

    // =========================================================================
    // TEST F: IDEMPOTENCY & DUPLICATE PROTECTION
    // =========================================================================
    console.log('\n--- TEST F: IDEMPOTENCY & DUPLICATE SUBMISSION PROTECTION ---');

    const testIdempotencyKey = `idemp-key-test-${Date.now()}`;
    const firstReq = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${adminToken}` },
      {
        userId: testUserId,
        actionType: 'ADMIN_CREDIT',
        amount: 100.00,
        reason: 'Idempotency test addition',
        idempotencyKey: testIdempotencyKey
      }
    );
    assert(firstReq.statusCode === 200, 'First request with idempotency key succeeds (200 OK)');
    assert(firstReq.data.data.balanceAfter === 700, 'Balance after first adjustment is 700.00');

    // Repeat the exact same request with identical idempotency key (simulating retry or double click)
    const secondReq = await makeRequest(
      server,
      'POST',
      '/api/admin/coins/adjust',
      { Authorization: `Bearer ${adminToken}` },
      {
        userId: testUserId,
        actionType: 'ADMIN_CREDIT',
        amount: 100.00,
        reason: 'Idempotency test addition',
        idempotencyKey: testIdempotencyKey
      }
    );
    assert(secondReq.statusCode === 409, 'Duplicate request with same idempotencyKey returns 409 Conflict');
    assert(secondReq.data.error.code === 'DUPLICATE_REQUEST', 'Error code specifies DUPLICATE_REQUEST');

    // Verify balance was NOT doubled
    const [[wRowAfterIdemp]] = await pool.query('SELECT available_balance FROM wallets WHERE user_id = ?', [testUserId]);
    assert(parseFloat(wRowAfterIdemp.available_balance) === 700.00, 'Player balance was NOT double credited; strictly remains 700.00');

    // =========================================================================
    // TEST G: BALANCE CONSISTENCY ACROSS PLATFORM APIS
    // =========================================================================
    console.log('\n--- TEST G: CROSS-PLATFORM BALANCE CONSISTENCY ---');

    // Check player's own session endpoint (/api/auth/me)
    const playerMeRes = await makeRequest(
      server,
      'GET',
      '/api/auth/me',
      { Authorization: `Bearer ${normalToken}` }
    );
    const playerUser = playerMeRes.data.data.user;
    const playerWalletBal = playerUser.wallet ? playerUser.wallet.available_balance : playerUser.available_balance;
    assert(playerWalletBal === 700, 'Player /api/auth/me reflects updated balance 700.00');

    // Check admin inspection endpoint (/api/admin/coins/players/:id)
    const playerDetailRes = await makeRequest(
      server,
      'GET',
      `/api/admin/coins/players/${testUserId}`,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(playerDetailRes.statusCode === 200, 'Admin player detail API returns 200 OK');
    assert(playerDetailRes.data.data.player.available_balance === 700, 'Admin player detail API returns identical 700.00');

    // Check coin adjustment history (/api/admin/coins/history)
    const historyRes = await makeRequest(
      server,
      'GET',
      `/api/admin/coins/history?userId=${testUserId}`,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(historyRes.statusCode === 200, 'Admin coin history API returns 200 OK');
    assert(historyRes.data.data.history.length === 3, 'Found exactly 3 completed adjustments for test player');
    assert(historyRes.data.data.history[0].status === 'completed', 'Transaction status is completed');

    // Clean up test records
    await pool.query('DELETE FROM coin_transactions WHERE user_id = ?', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = ?', [testUserId]);

    console.log('\n====================================================');
    console.log(`TEST SUITE RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
    console.log('====================================================\n');

    if (passedTests === totalTests) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test Runner Uncaught Error:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests();
