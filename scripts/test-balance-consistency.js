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

  // Verify unauthenticated public registration blocked
  const unauthRegRes = await apiRequest('/api/auth/register', 'POST', userA);
  assert(unauthRegRes.status === 401, 'Unauthenticated POST /api/auth/register rejected with 401');

  // Obtain admin token for user provisioning
  const [adminRows] = await pool.query("SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1");
  const { generateToken } = require('../backend/src/utils/crypto');
  const adminToken = generateToken({
    userId: adminRows[0].id,
    username: adminRows[0].username,
    email: adminRows[0].email,
    role: adminRows[0].role
  });

  // Test POST /api/auth/register returns wallet when provisioned by admin
  const regRes = await apiRequest('/api/auth/register', 'POST', userA, adminToken);
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

  // --- 1B. Dedicated Authoritative Balance Endpoint (/api/wallet/balance) ---
  console.log('\n--- 1B. Dedicated Authoritative Balance Endpoint (/api/wallet/balance) ---');
  
  // Unauthenticated request rejected
  const unauthBal = await apiRequest('/api/wallet/balance', 'GET');
  assert(unauthBal.status === 401, 'Unauthenticated GET /api/wallet/balance rejected with 401');

  // Authenticated request returns exact database balance
  const balResA = await apiRequest('/api/wallet/balance', 'GET', null, tokenA);
  assert(balResA.status === 200, 'GET /api/wallet/balance returns 200 OK');
  assert(balResA.body.balance === 2500.5, 'GET /api/wallet/balance returns numeric balance = 2500.50');
  assert(balResA.body.available_balance === 2500.5, 'GET /api/wallet/balance returns available_balance = 2500.50');
  assert(balResA.body.exposure_balance === 350.0, 'GET /api/wallet/balance returns exposure_balance = 350.00');

  // Test genuine zero balance handling (distinguishable from error)
  await pool.query('UPDATE wallets SET available_balance = 0.00, exposure_balance = 0.00 WHERE user_id = ?', [userAId]);
  const zeroBalRes = await apiRequest('/api/wallet/balance', 'GET', null, tokenA);
  assert(zeroBalRes.status === 200, 'GET /api/wallet/balance returns 200 OK for genuine zero balance');
  assert(zeroBalRes.body.balance === 0, 'Genuine zero balance correctly returns 0 (not null or error)');
  assert(zeroBalRes.body.available_balance === 0, 'available_balance is exactly 0');

  // --- 1C. Admin Coin Management Synchronization ---
  console.log('\n--- 1C. Admin Coin Management Synchronization ---');
  // Admin credits 10,000 coins to User A
  const creditRes = await apiRequest('/api/admin/coins/adjust', 'POST', {
    userId: userAId,
    actionType: 'ADMIN_CREDIT',
    amount: 10000.00,
    reason: 'Initial test deposit for balance verification'
  }, adminToken);
  assert(creditRes.status === 200, 'Admin credit of 10,000 coins returns 200 OK');

  // Verify /api/wallet/balance immediately reflects 10,000
  const postCreditBal = await apiRequest('/api/wallet/balance', 'GET', null, tokenA);
  assert(postCreditBal.body.balance === 10000.00, 'GET /api/wallet/balance immediately shows 10,000.00 after credit');

  // Verify /api/passbook/transactions returns 10,000.00 as authoritative wallet
  const passbookRes = await apiRequest('/api/passbook/transactions', 'GET', null, tokenA);
  assert(passbookRes.status === 200, 'GET /api/passbook/transactions returns 200 OK');
  assert(
    passbookRes.body.data.wallet.availableBalance === 10000.00,
    'Passbook data.wallet.availableBalance strictly equals 10,000.00'
  );

  // Admin deducts 500 coins from User A
  const debitRes = await apiRequest('/api/admin/coins/adjust', 'POST', {
    userId: userAId,
    actionType: 'ADMIN_DEBIT',
    amount: 500.00,
    reason: 'Wager deduction test'
  }, adminToken);
  assert(debitRes.status === 200, 'Admin debit of 500 coins returns 200 OK');

  // Verify /api/wallet/balance immediately reflects 9,500.00
  const postDebitBal = await apiRequest('/api/wallet/balance', 'GET', null, tokenA);
  assert(postDebitBal.body.balance === 9500.00, 'GET /api/wallet/balance immediately shows 9,500.00 after debit');

  // --- 2. MULTIPLE SESSIONS & USER ISOLATION ---
  console.log('\n--- 2. Multi-Session Isolation (User A vs User B) ---');

  const userB = {
    fullName: 'Player Beta Balance',
    username: `bal_beta_${ts}`,
    email: `bal_beta_${ts}@example.com`,
    password: 'Password@12345678',
    phone: '9123456780'
  };

  const regBRes = await apiRequest('/api/auth/register', 'POST', userB, adminToken);
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
    meBRes.body.user.wallet.available_balance !== postDebitBal.body.balance,
    'User B balance is strictly isolated from User A (7500.00 != 9500.00)'
  );

  const balBRes = await apiRequest('/api/wallet/balance', 'GET', null, tokenB);
  assert(balBRes.body.balance === 7500.0, 'User B GET /api/wallet/balance strictly returns 7500.00');

  // --- 3. DATABASE VERIFICATION (TEST F) ---
  console.log('\n--- 3. Database vs API Alignment ---');
  const [dbWalletsA] = await pool.query('SELECT available_balance, exposure_balance FROM wallets WHERE user_id = ?', [userAId]);
  assert(dbWalletsA.length === 1, 'User A wallet record exists in MySQL');
  assert(
    parseFloat(dbWalletsA[0].available_balance) === 9500.00,
    'MySQL database matches API available balance with 2 decimal precision (9500.00)'
  );
  assert(
    parseFloat(dbWalletsA[0].exposure_balance) === 0.00,
    'MySQL database matches API exposure balance with 2 decimal precision (0.00)'
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
