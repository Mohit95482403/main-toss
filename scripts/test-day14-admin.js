/**
 * IRONMAN TOSS BOOK - DAY 14 AUTOMATED TEST SUITE
 * Tests Admin Dashboard, User Management, Audit Logs, Application Monitoring,
 * and Role-Based Authorization Controls.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('====================================================');
console.log('IRONMAN TOSS BOOK - DAY 14 AUTOMATED TEST SUITE');
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

const root = path.join(__dirname, '..');
const app = require('../backend/app');
const { getPool, testConnection } = require('../backend/src/config/db');
const { seedAdmin } = require('../backend/src/config/seedAdmin');
const { generateToken } = require('../backend/src/utils/crypto');

// Helper to make local HTTP requests to Express app
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
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
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
  // =========================================================================
  // 1. FILE EXISTENCE & CODE INTEGRITY
  // =========================================================================
  const adminRoutePath = path.join(root, 'backend', 'src', 'routes', 'admin.js');
  const seedAdminPath = path.join(root, 'backend', 'src', 'config', 'seedAdmin.js');
  const adminHtmlPath = path.join(root, 'frontend', 'pages', 'admin.html');
  const adminCssPath = path.join(root, 'frontend', 'css', 'admin.css');
  const adminJsPath = path.join(root, 'frontend', 'js', 'admin.js');
  const adminDashboardHtml = path.join(root, 'frontend', 'pages', 'admin', 'dashboard.html');

  assert(fs.existsSync(adminRoutePath), 'backend/src/routes/admin.js exists');
  assert(fs.existsSync(seedAdminPath), 'backend/src/config/seedAdmin.js exists');
  assert(fs.existsSync(adminHtmlPath), 'frontend/pages/admin.html exists');
  assert(fs.existsSync(adminCssPath), 'frontend/css/admin.css exists');
  assert(fs.existsSync(adminJsPath), 'frontend/js/admin.js exists');
  assert(fs.existsSync(adminDashboardHtml), 'frontend/pages/admin/dashboard.html exists');

  // Verify schema and initDb definitions
  const schemaSql = fs.readFileSync(path.join(root, 'backend', 'database', 'schema.sql'), 'utf8');
  assert(schemaSql.includes('CREATE TABLE IF NOT EXISTS admin_audit_logs'), 'schema.sql defines admin_audit_logs table');

  const initDbJs = fs.readFileSync(path.join(root, 'backend', 'src', 'config', 'initDb.js'), 'utf8');
  assert(initDbJs.includes('admin_audit_logs'), 'initDb.js includes admin_audit_logs in initialization DDL');

  // Verify frontend HTML structure
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  assert(adminHtml.includes('id="kpi-total-users"'), 'admin.html defines KPI Total Users card');
  assert(adminHtml.includes('id="table-users"'), 'admin.html defines User Management table');
  assert(adminHtml.includes('id="user-search-input"'), 'admin.html defines User Search input');
  assert(adminHtml.includes('id="filter-user-role"'), 'admin.html defines User Role filter');
  assert(adminHtml.includes('id="filter-user-status"'), 'admin.html defines User Status filter');
  assert(adminHtml.includes('id="table-audits"'), 'admin.html defines Audit History table');
  assert(adminHtml.includes('id="modal-inspect-user"'), 'admin.html defines User Inspect Modal');
  assert(adminHtml.includes('id="modal-status-user"'), 'admin.html defines User Status Action Modal');
  assert(adminHtml.includes('id="modal-role-user"'), 'admin.html defines User Role Action Modal');

  // =========================================================================
  // 2. DATABASE & SEED ADMIN PROVISIONING
  // =========================================================================
  const dbCheck = await testConnection();
  assert(dbCheck.connected, 'MySQL database is online and reachable');

  const seedResult = await seedAdmin();
  assert(seedResult.success, 'seedAdmin() executed successfully');

  const pool = getPool();
  const [adminRows] = await pool.query(
    "SELECT id, username, email, role, status FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1"
  );
  assert(adminRows.length > 0, 'Root administrator account exists in MySQL');
  const rootAdmin = adminRows[0];
  assert(rootAdmin.role === 'super_admin' || rootAdmin.role === 'admin', 'Admin account possesses privileged role');

  // Verify audit log table existence
  const [auditTables] = await pool.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'ironman_toss_book' AND TABLE_NAME = 'admin_audit_logs'"
  );
  assert(auditTables.length > 0, 'admin_audit_logs table is created in ironman_toss_book MySQL database');

  // =========================================================================
  // 3. START TEST SERVER & GENERATE TOKENS
  // =========================================================================
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));

  // Generate tokens:
  // (a) Valid super_admin token
  const superAdminToken = generateToken({
    userId: rootAdmin.id,
    uuid: 'admin-uuid-test',
    username: rootAdmin.username,
    email: rootAdmin.email,
    role: rootAdmin.role
  });

  // (b) Valid regular user token (no admin role)
  const regularUserToken = generateToken({
    userId: 9999,
    uuid: 'regular-user-uuid',
    username: 'regular_player',
    email: 'player@example.com',
    role: 'user'
  });

  // =========================================================================
  // 4. AUTHORIZATION GUARD TESTS
  // =========================================================================
  // Unauthenticated requests should be blocked with 401
  const unauthStats = await makeRequest(testServer, 'GET', '/api/admin/dashboard/stats');
  assert(unauthStats.status === 401, 'Unauthenticated request to admin stats rejected with 401');

  const unauthUsers = await makeRequest(testServer, 'GET', '/api/admin/users');
  assert(unauthUsers.status === 401, 'Unauthenticated request to admin users rejected with 401');

  // Regular user requests should be blocked with 403 Forbidden
  const regStats = await makeRequest(testServer, 'GET', '/api/admin/dashboard/stats', {
    Authorization: `Bearer ${regularUserToken}`
  });
  assert(regStats.status === 403, 'Regular player token blocked from admin stats with 403 Forbidden');

  const regUsers = await makeRequest(testServer, 'GET', '/api/admin/users', {
    Authorization: `Bearer ${regularUserToken}`
  });
  assert(regUsers.status === 403, 'Regular player token blocked from admin users with 403 Forbidden');

  const regAudits = await makeRequest(testServer, 'GET', '/api/admin/audit-logs', {
    Authorization: `Bearer ${regularUserToken}`
  });
  assert(regAudits.status === 403, 'Regular player token blocked from admin audit-logs with 403 Forbidden');

  const regSystem = await makeRequest(testServer, 'GET', '/api/admin/system/status', {
    Authorization: `Bearer ${regularUserToken}`
  });
  assert(regSystem.status === 403, 'Regular player token blocked from admin system status with 403 Forbidden');

  // =========================================================================
  // 5. ADMIN DASHBOARD STATS ENDPOINT
  // =========================================================================
  const adminStats = await makeRequest(testServer, 'GET', '/api/admin/dashboard/stats', {
    Authorization: `Bearer ${superAdminToken}`
  });
  assert(adminStats.status === 200, 'Super admin successfully accesses /api/admin/dashboard/stats');
  assert(adminStats.body.success === true, 'Stats response indicates success');
  assert(typeof adminStats.body.data.users.total === 'number', 'Stats returns total user count as number');
  assert(typeof adminStats.body.data.financials.totalAvailableBalance === 'number', 'Stats returns total balance as number');
  assert(typeof adminStats.body.data.sessions.activeCount === 'number', 'Stats returns active session count');

  // =========================================================================
  // 6. USER DIRECTORY, SEARCH, FILTER, AND PAGINATION
  // =========================================================================
  const adminUsersList = await makeRequest(testServer, 'GET', '/api/admin/users?page=1&limit=5', {
    Authorization: `Bearer ${superAdminToken}`
  });
  assert(adminUsersList.status === 200, 'GET /api/admin/users returns 200 OK');
  assert(Array.isArray(adminUsersList.body.data.users), 'Users directory returns array of users');
  assert(adminUsersList.body.data.users.length > 0, 'Users directory contains database user records');
  assert(!adminUsersList.body.data.users[0].password_hash, 'Users directory does NOT leak password_hash');
  assert(adminUsersList.body.data.pagination.page === 1, 'Pagination reflects current page');

  // Test search filter
  const searchTest = await makeRequest(testServer, 'GET', `/api/admin/users?search=${rootAdmin.username}`, {
    Authorization: `Bearer ${superAdminToken}`
  });
  assert(searchTest.status === 200, 'User search returns 200 OK');
  const foundAdmin = searchTest.body.data.users.find((u) => u.username === rootAdmin.username);
  assert(Boolean(foundAdmin), `User search finds user by username "${rootAdmin.username}"`);

  // Test role filter
  const roleFilterTest = await makeRequest(testServer, 'GET', '/api/admin/users?role=user', {
    Authorization: `Bearer ${superAdminToken}`
  });
  assert(roleFilterTest.status === 200, 'Role filter returns 200 OK');
  const allAreUsers = roleFilterTest.body.data.users.every((u) => u.role === 'user');
  assert(allAreUsers, 'Role filter exclusively returns users with role = "user"');

  // =========================================================================
  // 7. USER DETAIL INSPECTION
  // =========================================================================
  const userDetail = await makeRequest(testServer, 'GET', `/api/admin/users/${rootAdmin.id}`, {
    Authorization: `Bearer ${superAdminToken}`
  });
  assert(userDetail.status === 200, 'GET /api/admin/users/:id returns 200 OK');
  assert(userDetail.body.data.id === rootAdmin.id, 'User detail matches requested ID');
  assert(userDetail.body.data.wallet !== undefined, 'User detail includes wallet summary');
  assert(!userDetail.body.data.password_hash, 'User detail does NOT leak password_hash');

  // Invalid user ID returns 404
  const invalidUserDetail = await makeRequest(testServer, 'GET', '/api/admin/users/999999', {
    Authorization: `Bearer ${superAdminToken}`
  });
  assert(invalidUserDetail.status === 404, 'Non-existent user detail returns 404 Not Found');

  // =========================================================================
  // 8. ACCOUNT STATUS MODERATION (SUSPEND, RESTORE, BAN)
  // =========================================================================
  // Self-action check: Administrator cannot suspend themselves
  const selfSuspend = await makeRequest(
    testServer,
    'PUT',
    `/api/admin/users/${rootAdmin.id}/status`,
    { Authorization: `Bearer ${superAdminToken}` },
    { status: 'suspended', reason: 'Self suspend test' }
  );
  assert(selfSuspend.status === 400, 'Admin cannot suspend their own account (400 Bad Request)');
  assert(selfSuspend.body.error.code === 'SELF_ACTION_BLOCKED', 'Returns code SELF_ACTION_BLOCKED');

  // Find a non-admin target user to test moderation
  const [testUsers] = await pool.query(
    "SELECT id, username, status FROM users WHERE role = 'user' LIMIT 1"
  );

  if (testUsers.length > 0) {
    const target = testUsers[0];

    // Suspend target user
    const suspendRes = await makeRequest(
      testServer,
      'PUT',
      `/api/admin/users/${target.id}/status`,
      { Authorization: `Bearer ${superAdminToken}` },
      { status: 'suspended', reason: 'Automated test suspension' }
    );
    assert(suspendRes.status === 200, 'Admin successfully suspended user account');
    assert(suspendRes.body.data.newStatus === 'suspended', 'Response confirms new status is suspended');

    // Verify in database
    const [[updatedTarget]] = await pool.query('SELECT status FROM users WHERE id = ?', [target.id]);
    assert(updatedTarget.status === 'suspended', 'Target user status in MySQL is updated to suspended');

    // Restore target user back to active
    const restoreRes = await makeRequest(
      testServer,
      'PUT',
      `/api/admin/users/${target.id}/status`,
      { Authorization: `Bearer ${superAdminToken}` },
      { status: 'active', reason: 'Automated test account restoration' }
    );
    assert(restoreRes.status === 200, 'Admin successfully restored user account to active');
    const [[restoredTarget]] = await pool.query('SELECT status FROM users WHERE id = ?', [target.id]);
    assert(restoredTarget.status === 'active', 'Target user status in MySQL is updated to active');
  }

  // =========================================================================
  // 9. ROLE ASSIGNMENT CONTROLS
  // =========================================================================
  // Self-demotion check
  const selfDemote = await makeRequest(
    testServer,
    'PUT',
    `/api/admin/users/${rootAdmin.id}/role`,
    { Authorization: `Bearer ${superAdminToken}` },
    { role: 'user', reason: 'Self demote test' }
  );
  assert(selfDemote.status === 400, 'Super admin cannot demote their own account (400 Bad Request)');

  // Role update on test user
  if (testUsers.length > 0) {
    const target = testUsers[0];

    const promoteRes = await makeRequest(
      testServer,
      'PUT',
      `/api/admin/users/${target.id}/role`,
      { Authorization: `Bearer ${superAdminToken}` },
      { role: 'admin', reason: 'Automated test promotion' }
    );
    assert(promoteRes.status === 200, 'Super admin successfully assigned admin role');
    assert(promoteRes.body.data.newRole === 'admin', 'Response confirms new role is admin');

    // Revert role back to user
    const revertRes = await makeRequest(
      testServer,
      'PUT',
      `/api/admin/users/${target.id}/role`,
      { Authorization: `Bearer ${superAdminToken}` },
      { role: 'user', reason: 'Revert to player' }
    );
    assert(revertRes.status === 200, 'Super admin successfully reverted role to user');
  }

  // =========================================================================
  // 10. ADMINISTRATIVE AUDIT TRAIL
  // =========================================================================
  const auditLogsRes = await makeRequest(testServer, 'GET', '/api/admin/audit-logs?page=1&limit=10', {
    Authorization: `Bearer ${superAdminToken}`
  });
  assert(auditLogsRes.status === 200, 'GET /api/admin/audit-logs returns 200 OK');
  assert(Array.isArray(auditLogsRes.body.data.logs), 'Audit logs returns an array of records');
  assert(auditLogsRes.body.data.logs.length > 0, 'Audit trail contains recorded administrative actions');
  const hasActionType = auditLogsRes.body.data.logs[0].action_type !== undefined;
  assert(hasActionType, 'Audit log entry contains action_type attribute');

  // =========================================================================
  // 11. APPLICATION MONITORING & OPERATIONAL STATUS
  // =========================================================================
  const systemStatusRes = await makeRequest(testServer, 'GET', '/api/admin/system/status', {
    Authorization: `Bearer ${superAdminToken}`
  });
  assert(systemStatusRes.status === 200, 'GET /api/admin/system/status returns 200 OK');
  assert(systemStatusRes.body.data.database.status === 'online', 'System status accurately reports database online');
  assert(typeof systemStatusRes.body.data.database.latencyMs === 'number', 'System status returns database probe latency in ms');
  assert(systemStatusRes.body.data.process.memoryUsage !== undefined, 'System status reports Node.js process memory usage');
  assert(systemStatusRes.body.data.database.tableCounts.users >= 1, 'System status reports MySQL users table record count');
  assert(systemStatusRes.body.data.database.tableCounts.admin_audit_logs >= 1, 'System status reports MySQL admin_audit_logs record count');

  // Close server and pool
  await new Promise((resolve) => testServer.close(resolve));

  console.log(`\n====================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED`);
  console.log(`====================================================\n`);

  process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch((err) => {
  console.error('[TEST SUITE CRASH]', err);
  process.exit(1);
});
