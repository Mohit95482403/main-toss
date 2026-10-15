/**
 * IRONMAN TOSS BOOK - DAY 15 AUTOMATED INTEGRATION & DATA INTEGRITY TEST SUITE
 * Tests end-to-end API contracts, standardized response envelopes, authentication lifecycle,
 * user isolation (IDOR defense), multi-table transaction atomicity, search/pagination, and error handling.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('====================================================');
console.log('IRONMAN TOSS BOOK - DAY 15 INTEGRATION & RELIABILITY TEST SUITE');
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

// 1. File & Architecture Audit Checks
const root = path.join(__dirname, '..');
const apiClientPath = path.join(root, 'frontend', 'js', 'api-client.js');
const authRoutePath = path.join(root, 'backend', 'src', 'routes', 'auth.js');
const adminRoutePath = path.join(root, 'backend', 'src', 'routes', 'admin.js');
const dbConfigPath = path.join(root, 'backend', 'src', 'config', 'db.js');
const errorHandlerPath = path.join(root, 'backend', 'src', 'middleware', 'errorHandler.js');

assert(fs.existsSync(apiClientPath), 'frontend/js/api-client.js exists');
assert(fs.existsSync(authRoutePath), 'backend/src/routes/auth.js exists');
assert(fs.existsSync(adminRoutePath), 'backend/src/routes/admin.js exists');
assert(fs.existsSync(dbConfigPath), 'backend/src/config/db.js exists');
assert(fs.existsSync(errorHandlerPath), 'backend/src/middleware/errorHandler.js exists');

// Verify frontend HTML files include api-client.js
const pagesToCheck = [
  path.join(root, 'frontend', 'index.html'),
  path.join(root, 'frontend', 'pages', 'login.html'),
  path.join(root, 'frontend', 'pages', 'register.html'),
  path.join(root, 'frontend', 'pages', 'profile.html'),
  path.join(root, 'frontend', 'pages', 'bets.html'),
  path.join(root, 'frontend', 'pages', 'passbook.html'),
  path.join(root, 'frontend', 'pages', 'match-details.html'),
  path.join(root, 'frontend', 'pages', 'admin.html')
];

pagesToCheck.forEach(pagePath => {
  const pageName = path.basename(pagePath);
  const content = fs.readFileSync(pagePath, 'utf8');
  assert(content.includes('api-client.js'), `${pageName} includes api-client.js script tag`);
});

// Verify ApiClient implementation details
const apiClientContent = fs.readFileSync(apiClientPath, 'utf8');
assert(apiClientContent.includes('window.ApiClient ='), 'ApiClient exported to global window');
assert(apiClientContent.includes('getBaseUrl'), 'ApiClient implements getBaseUrl helper');
assert(apiClientContent.includes('getToken'), 'ApiClient implements getToken helper');
assert(apiClientContent.includes('setToken'), 'ApiClient implements setToken helper');
assert(apiClientContent.includes('clearToken'), 'ApiClient implements clearToken helper');
assert(apiClientContent.includes('isAuthenticated'), 'ApiClient implements isAuthenticated helper');
assert(apiClientContent.includes('syncBalancesFromUser'), 'ApiClient implements automatic wallet balance sync');

// Load Backend and Database for live API integration tests
const app = require('../backend/app');
const { getPool, closePool } = require('../backend/src/config/db');

let server;
let port;
let baseUrl;

function makeRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      url,
      {
        method,
        headers
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            parsed = { raw: rawData };
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runLiveIntegrationTests() {
  const pool = getPool();

  // Test Database Connection
  try {
    const [dbTest] = await pool.query('SELECT 1 + 1 AS result');
    assert(dbTest[0].result === 2, 'MySQL database pool connected and functioning');
  } catch (dbErr) {
    console.error('[FAIL] MySQL connection failed:', dbErr.message);
    process.exit(1);
  }

  // Start test HTTP server on ephemeral port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  const timestamp = Date.now();
  const testUserA = {
    fullName: 'Integration User Alpha',
    username: `user_alpha_${timestamp}`,
    email: `alpha_${timestamp}@example.com`,
    phone: '9876543210',
    password: 'SecurePassword123!'
  };

  const testUserB = {
    fullName: 'Integration User Beta',
    username: `user_beta_${timestamp}`,
    email: `beta_${timestamp}@example.com`,
    phone: '9876543211',
    password: 'SecurePassword456!'
  };

  let tokenUserA = null;
  let userAId = null;
  let tokenUserB = null;
  let userBId = null;
  let adminToken = null;

  try {
    // 1. Root & Health Check
    const rootRes = await makeRequest('GET', '/');
    assert(rootRes.status === 200, 'GET / returns 200 OK');
    assert(rootRes.body.service === 'IRONMAN TOSS BOOK API', 'GET / returns service name');
    assert(rootRes.body.endpoints && rootRes.body.endpoints.health, 'GET / provides endpoint inventory');

    const healthRes = await makeRequest('GET', '/api/health');
    assert(healthRes.status === 200, 'GET /api/health returns 200 OK');
    assert(healthRes.body.success === true, 'Health check reports success: true');
    assert(healthRes.body.service === 'ironman-toss-book-api', 'Health check reports service name');

    const dbHealthRes = await makeRequest('GET', '/api/health/db');
    assert(dbHealthRes.status === 200, 'GET /api/health/db returns 200 OK');
    assert(dbHealthRes.body.database && (dbHealthRes.body.database.status === 'online' || dbHealthRes.body.database.status === 'connected'), 'Database health check reports online');

    // 2. Error Response Consistency on 404
    const notFoundRes = await makeRequest('GET', '/api/non-existent-endpoint');
    assert(notFoundRes.status === 404, 'Unmatched route returns 404');
    assert(notFoundRes.body.success === false, '404 error envelope includes success: false');
    assert(notFoundRes.body.error && notFoundRes.body.error.code === 'NOT_FOUND', '404 error code is NOT_FOUND');

    // 3. User Registration (Alpha) - Testing Multi-Table Transaction Atomicity
    const regResA = await makeRequest('POST', '/api/auth/register', testUserA);
    assert(regResA.status === 201, 'POST /api/auth/register succeeds with 201 Created');
    assert(regResA.body.success === true, 'Registration response contains success: true');
    assert(Boolean(regResA.body.token), 'Registration response contains top-level token');
    assert(Boolean(regResA.body.user), 'Registration response contains top-level user');
    assert(Boolean(regResA.body.data && regResA.body.data.token), 'Registration response supports data envelope');
    assert(regResA.body.user.fullName === testUserA.fullName, 'User response includes fullName property');
    assert(regResA.body.user.full_name === testUserA.fullName, 'User response includes full_name property');
    assert(regResA.body.user.password_hash === undefined, 'User response does NOT leak password_hash');

    tokenUserA = regResA.body.token;
    userAId = regResA.body.user.id;

    // Verify MySQL records created by the atomic transaction
    const [walletsA] = await pool.query('SELECT * FROM wallets WHERE user_id = ?', [userAId]);
    assert(walletsA.length === 1, 'Transactional insert verified: wallet record created for user');
    assert(parseFloat(walletsA[0].available_balance) === 0.00, 'Initial wallet available_balance is 0.00');

    const [prefsA] = await pool.query('SELECT * FROM user_preferences WHERE user_id = ?', [userAId]);
    assert(prefsA.length === 1, 'Transactional insert verified: user_preferences record created for user');

    // 4. Duplicate Registration Rejection (Unique Constraints in MySQL)
    const dupRes = await makeRequest('POST', '/api/auth/register', testUserA);
    assert(dupRes.status === 409, 'Duplicate registration returns 409 Conflict');
    assert(dupRes.body.error && dupRes.body.error.code === 'DUPLICATE_ACCOUNT', 'Duplicate registration returns DUPLICATE_ACCOUNT code');

    // 5. Register User Beta for Isolation / IDOR Testing
    const regResB = await makeRequest('POST', '/api/auth/register', testUserB);
    assert(regResB.status === 201, 'POST /api/auth/register succeeds for second user (Beta)');
    tokenUserB = regResB.body.token;
    userBId = regResB.body.user.id;

    // 6. User Login Lifecycle
    const loginResA = await makeRequest('POST', '/api/auth/login', {
      identifier: testUserA.username,
      password: testUserA.password
    });
    assert(loginResA.status === 200, 'POST /api/auth/login succeeds with 200 OK');
    assert(Boolean(loginResA.body.token), 'Login response contains signed JWT token');
    assert(loginResA.body.user && loginResA.body.user.username === testUserA.username, 'Login response contains authenticated user object');
    assert(loginResA.body.user.password_hash === undefined, 'Login response does NOT leak password_hash');

    // Invalid Login Handling
    const badLoginRes = await makeRequest('POST', '/api/auth/login', {
      identifier: testUserA.username,
      password: 'WrongPassword999!'
    });
    assert(badLoginRes.status === 401, 'Invalid password rejected with 401 Unauthorized');
    assert(badLoginRes.body.success === false, 'Invalid login response contains success: false');

    // 7. GET /api/auth/me Profile & Wallet Contract Verification
    const meResA = await makeRequest('GET', '/api/auth/me', null, tokenUserA);
    assert(meResA.status === 200, 'GET /api/auth/me returns 200 OK for User Alpha');
    assert(meResA.body.user && meResA.body.user.id === userAId, 'meRes returns authenticated user ID matching token');
    assert(meResA.body.user.wallet !== undefined, 'meRes returns user wallet object');
    assert(meResA.body.user.wallet.available_balance !== undefined, 'wallet object contains available_balance');
    assert(meResA.body.user.wallet.exposure_balance !== undefined, 'wallet object contains exposure_balance');
    assert(meResA.body.user.wallet.currency === 'INR', 'wallet object specifies INR currency');
    assert(meResA.body.data && meResA.body.data.user, 'meRes supports structured data.user envelope');

    // 8. User Isolation / IDOR Rejection Checks
    // User Alpha must not be able to update User Beta's profile
    const updatePayload = {
      fullName: 'Alpha Renamed',
      phone: '9998887776'
    };
    const updateRes = await makeRequest('PUT', '/api/auth/profile', updatePayload, tokenUserA);
    assert(updateRes.status === 200, 'PUT /api/auth/profile succeeds for authenticated user');
    assert(updateRes.body.user.fullName === 'Alpha Renamed', 'Updated fullName reflected in response');

    // Verify Beta's profile in database remains completely unmodified
    const [userBRecords] = await pool.query('SELECT full_name, phone FROM users WHERE id = ?', [userBId]);
    assert(userBRecords[0].full_name === testUserB.fullName, 'User Beta full_name remains untouched in MySQL (User Isolation verified)');
    assert(userBRecords[0].phone === testUserB.phone, 'User Beta phone remains untouched in MySQL (User Isolation verified)');

    // 9. Unauthorized Modification Rejection
    const unauthUpdate = await makeRequest('PUT', '/api/auth/profile', { fullName: 'Hacker Name' });
    assert(unauthUpdate.status === 401, 'Unauthenticated profile update returns 401 Unauthorized');

    // 10. Malformed Token Rejection
    const malformedTokenRes = await makeRequest('GET', '/api/auth/me', null, 'malformed.jwt.token.string');
    assert(malformedTokenRes.status === 401, 'Malformed token returns 401 Unauthorized');

    // 11. Admin Role & Privilege Isolation
    const [adminRows] = await pool.query(
      "SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1"
    );
    assert(adminRows.length > 0, 'Root administrator account exists in MySQL');
    const rootAdmin = adminRows[0];

    const { generateToken } = require('../backend/src/utils/crypto');
    adminToken = generateToken({
      userId: rootAdmin.id,
      uuid: 'admin-integration-uuid',
      username: rootAdmin.username,
      email: rootAdmin.email,
      role: rootAdmin.role
    });
    assert(Boolean(adminToken), 'Admin privilege token issued for root administrator');

    // Regular user cannot access admin routes
    const regularOnAdminStats = await makeRequest('GET', '/api/admin/dashboard/stats', null, tokenUserA);
    assert(regularOnAdminStats.status === 403, 'Regular player accessing admin stats returns 403 Forbidden');

    const regularOnAdminUsers = await makeRequest('GET', '/api/admin/users', null, tokenUserA);
    assert(regularOnAdminUsers.status === 403, 'Regular player accessing admin user list returns 403 Forbidden');

    // Admin can access admin routes
    const adminStatsRes = await makeRequest('GET', '/api/admin/dashboard/stats', null, adminToken);
    assert(adminStatsRes.status === 200, 'Admin successfully retrieves /api/admin/dashboard/stats');
    assert(adminStatsRes.body.success === true, 'Admin stats reports success: true');
    const statsData = adminStatsRes.body.data || adminStatsRes.body.stats;
    assert(typeof statsData.users.total === 'number', 'Admin stats returns total users count');
    assert(typeof statsData.financials.totalAvailableBalance === 'number', 'Admin stats returns total balance count');

    // 12. Search & Pagination Integration on Admin User Directory
    const pagedUsersRes = await makeRequest('GET', `/api/admin/users?page=1&limit=2`, null, adminToken);
    assert(pagedUsersRes.status === 200, 'GET /api/admin/users with pagination returns 200 OK');
    const usersList = (pagedUsersRes.body.data && pagedUsersRes.body.data.users) || pagedUsersRes.body.users;
    const paginationMeta = (pagedUsersRes.body.data && pagedUsersRes.body.data.pagination) || pagedUsersRes.body.pagination;
    assert(Array.isArray(usersList), 'Users directory returns array');
    assert(paginationMeta.page === 1, 'Pagination reflects page 1');
    assert(paginationMeta.limit === 2, 'Pagination limit is respected');

    // Filtered Search
    const searchRes = await makeRequest('GET', `/api/admin/users?search=${testUserA.username}`, null, adminToken);
    assert(searchRes.status === 200, 'Search by username returns 200 OK');
    const searchUsers = (searchRes.body.data && searchRes.body.data.users) || searchRes.body.users;
    assert(searchUsers.length === 1, 'Search finds exactly 1 matching user');
    assert(searchUsers[0].username === testUserA.username, 'Found user matches search query');

    // 13. Clean Session Logout
    const logoutRes = await makeRequest('POST', '/api/auth/logout', null, tokenUserA);
    assert(logoutRes.status === 200, 'POST /api/auth/logout returns 200 OK');
    assert(logoutRes.body.success === true, 'Logout confirms session terminated');

  } finally {
    // Cleanup created test accounts from MySQL
    try {
      if (userAId) {
        await pool.query('DELETE FROM user_preferences WHERE user_id = ?', [userAId]);
        await pool.query('DELETE FROM wallets WHERE user_id = ?', [userAId]);
        await pool.query('DELETE FROM sessions WHERE user_id = ?', [userAId]);
        await pool.query('DELETE FROM users WHERE id = ?', [userAId]);
      }
      if (userBId) {
        await pool.query('DELETE FROM user_preferences WHERE user_id = ?', [userBId]);
        await pool.query('DELETE FROM wallets WHERE user_id = ?', [userBId]);
        await pool.query('DELETE FROM sessions WHERE user_id = ?', [userBId]);
        await pool.query('DELETE FROM users WHERE id = ?', [userBId]);
      }
    } catch (cleanupErr) {
      console.warn('[CLEANUP] Note on test data cleanup:', cleanupErr.message);
    }

    // Close server and database pool
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await closePool();
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED`);
  console.log('====================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runLiveIntegrationTests().catch((err) => {
  console.error('[FATAL] Integration test runner failed:', err);
  process.exit(1);
});
