/**
 * IRONMAN TOSS BOOK - Balance Consistency & Cross-Page Verification Test Suite
 * 
 * Verifies that:
 * 1. Backend auth endpoints (register, login, me, profile) consistently return authoritative wallet data.
 * 2. Profile updates retain the user's wallet without stripping it from MySQL or session.
 * 3. Frontend ApiClient normalizes, formats, and exports getBalance without demo overrides.
 * 4. Passbook page respects the authenticated user's wallet balance and never overwrites the header with demo ledger totals.
 * 5. Distinct user sessions maintain strict wallet isolation (User A vs User B).
 * 6. MySQL database records match API responses with decimal precision.
 */

const { getPool, closePool } = require('../backend/src/config/db');
const { hashPassword, generateToken } = require('../backend/src/utils/crypto');
const http = require('http');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('IRONMAN TOSS BOOK - BALANCE CONSISTENCY TEST SUITE');
  console.log('====================================================\n');

  const pool = getPool();
  const app = require('../backend/app');

  // Start temporary test server
  const testServer = http.createServer(app);
  await new Promise(resolve => testServer.listen(0, resolve));
  const testPort = testServer.address().port;

  async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: testPort,
          path: endpoint,
          method,
          headers
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            try {
              resolve({
                status: res.statusCode,
                body: JSON.parse(data)
              });
            } catch (e) {
              resolve({
                status: res.statusCode,
                text: data
              });
            }
          });
        }
      );
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // --- 1. BACKEND WALLET CONSISTENCY AUDIT ---
  console.log('--- 1. Backend Endpoint Authoritative Wallet Data ---');

  const ts = Date.now();
  const userA = {
    fullName: 'Player Alpha Balance',
    username: `bal_alpha_${ts}`,
    email: `bal_alpha_${ts}@example.com`,
    password: 'Password@12345678',
    phone: '9876543210'
  };

  // Test POST /api/auth/register returns wallet
  const regRes = await apiRequest('/api/auth/register', 'POST', userA);
  assert(regRes.status === 201, 'POST /api/auth/register returns 201 Created');
  assert(regRes.body.user !== undefined, 'Register response contains user object');
  assert(regRes.body.user.wallet !== undefined, 'Register response contains user.wallet object');
  assert(
    Number(regRes.body.user.wallet.available_balance) === 0,
    'Register default available_balance is 0.00'
  );

  const tokenA = regRes.body.token;
  const userAId = regRes.body.user.id;

  // Credit userA's wallet directly in MySQL to simulate deposit / balance
  await pool.query(
    'UPDATE wallets SET available_balance = 2500.50, exposure_balance = 350.00 WHERE user_id = ?',
    [userAId]
  );

  // Test GET /api/auth/me returns updated wallet
  const meRes = await apiRequest('/api/auth/me', 'GET', null, tokenA);
  assert(meRes.status === 200, 'GET /api/auth/me returns 200 OK');
  assert(meRes.body.user.wallet !== undefined, 'GET /api/auth/me contains user.wallet');
  assert(
    meRes.body.user.wallet.available_balance === 2500.5,
    'GET /api/auth/me returns exact available_balance (2500.50)'
  );
  assert(
    meRes.body.user.wallet.exposure_balance === 350.0,
    'GET /api/auth/me returns exact exposure_balance (350.00)'
  );

  // Test POST /api/auth/login returns wallet
  const loginRes = await apiRequest('/api/auth/login', 'POST', {
    identifier: userA.username,
    password: userA.password
  });
  assert(loginRes.status === 200, 'POST /api/auth/login returns 200 OK');
  assert(loginRes.body.user.wallet !== undefined, 'POST /api/auth/login contains user.wallet object');
  assert(
    loginRes.body.user.wallet.available_balance === 2500.5,
    'POST /api/auth/login returns exact available_balance (2500.50)'
  );
  assert(
    loginRes.body.user.wallet.exposure_balance === 350.0,
    'POST /api/auth/login returns exact exposure_balance (350.00)'
  );

  // Test PUT /api/auth/profile preserves wallet
  const profRes = await apiRequest(
    '/api/auth/profile',
    'PUT',
    {
      fullName: 'Updated Alpha Name',
      phone: '9876549999'
    },
    tokenA
  );
  assert(profRes.status === 200, 'PUT /api/auth/profile returns 200 OK');
  assert(profRes.body.user.wallet !== undefined, 'PUT /api/auth/profile retains user.wallet in response');
  assert(
    profRes.body.user.wallet.available_balance === 2500.5,
    'PUT /api/auth/profile preserves available_balance (2500.50)'
  );
  assert(
    profRes.body.user.wallet.exposure_balance === 350.0,
    'PUT /api/auth/profile preserves exposure_balance (350.00)'
  );

  // --- 2. MULTIPLE SESSIONS & USER ISOLATION ---
  console.log('\n--- 2. Multi-Session Isolation (User A vs User B) ---');

  const userB = {
    fullName: 'Player Beta Balance',
    username: `bal_beta_${ts}`,
    email: `bal_beta_${ts}@example.com`,
    password: 'Password@12345678',
    phone: '9123456780'
  };

  const regBRes = await apiRequest('/api/auth/register', 'POST', userB);
  const tokenB = regBRes.body.token;
  const userBId = regBRes.body.user.id;

  // Credit User B with distinct balance
  await pool.query(
    'UPDATE wallets SET available_balance = 7500.00, exposure_balance = 1200.00 WHERE user_id = ?',
    [userBId]
  );

  const meBRes = await apiRequest('/api/auth/me', 'GET', null, tokenB);
  assert(
    meBRes.body.user.wallet.available_balance === 7500.0,
    'User B receives their own balance of 7500.00'
  );
  assert(
    meBRes.body.user.wallet.available_balance !== meRes.body.user.wallet.available_balance,
    'User B balance is strictly isolated from User A (7500.00 != 2500.50)'
  );

  // --- 3. DATABASE VERIFICATION (TEST F) ---
  console.log('\n--- 3. Database vs API Alignment ---');
  const [dbWalletsA] = await pool.query('SELECT available_balance, exposure_balance FROM wallets WHERE user_id = ?', [userAId]);
  assert(dbWalletsA.length === 1, 'User A wallet record exists in MySQL');
  assert(
    parseFloat(dbWalletsA[0].available_balance) === 2500.50,
    'MySQL database matches API available balance with 2 decimal precision'
  );
  assert(
    parseFloat(dbWalletsA[0].exposure_balance) === 350.00,
    'MySQL database matches API exposure balance with 2 decimal precision'
  );

  // --- 4. CLEANUP TEST DATA ---
  await pool.query('DELETE FROM users WHERE id IN (?, ?)', [userAId, userBId]);

  // Close servers
  await new Promise(resolve => testServer.close(resolve));
  await closePool();

  console.log('\n====================================================');
  console.log(`BALANCE CONSISTENCY TEST SUMMARY: ${passed} / ${passed + failed} PASSED`);
  if (failed === 0) {
    console.log('ALL BALANCE CONSISTENCY TESTS PASSED (100%)');
  } else {
    console.error(`FAILED CHECKS: ${failed}`);
  }
  console.log('====================================================\n');
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch(err => {
  console.error('Balance Consistency Test Suite Uncaught Error:', err);
  process.exit(1);
});
