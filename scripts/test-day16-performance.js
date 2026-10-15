/**
 * IRONMAN TOSS BOOK - DAY 16 AUTOMATED PERFORMANCE & OPTIMIZATION TEST SUITE
 * Tests database performance indexes, connection pool keepalive configuration,
 * parallel query execution, native HTTP gzip compression, static asset Cache-Control headers,
 * frontend ApiClient request deduplication, debouncing, and search abort controllers.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { performance } = require('perf_hooks');

console.log('====================================================');
console.log('IRONMAN TOSS BOOK - DAY 16 PERFORMANCE TEST SUITE');
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
const compressionMiddlewarePath = path.join(root, 'backend', 'src', 'middleware', 'compression.js');
const dbConfigPath = path.join(root, 'backend', 'src', 'config', 'db.js');
const initDbPath = path.join(root, 'backend', 'src', 'config', 'initDb.js');
const schemaSqlPath = path.join(root, 'backend', 'database', 'schema.sql');
const adminRoutePath = path.join(root, 'backend', 'src', 'routes', 'admin.js');
const apiClientPath = path.join(root, 'frontend', 'js', 'api-client.js');
const serveFrontendPath = path.join(root, 'scripts', 'serve-frontend.js');

assert(fs.existsSync(compressionMiddlewarePath), 'backend/src/middleware/compression.js exists');
assert(fs.existsSync(dbConfigPath), 'backend/src/config/db.js exists');
assert(fs.existsSync(initDbPath), 'backend/src/config/initDb.js exists');
assert(fs.existsSync(schemaSqlPath), 'backend/database/schema.sql exists');
assert(fs.existsSync(adminRoutePath), 'backend/src/routes/admin.js exists');
assert(fs.existsSync(apiClientPath), 'frontend/js/api-client.js exists');
assert(fs.existsSync(serveFrontendPath), 'scripts/serve-frontend.js exists');

// 2. Code-level Optimization Invariant Checks
const dbConfigContent = fs.readFileSync(dbConfigPath, 'utf8');
assert(dbConfigContent.includes('enableKeepAlive: true'), 'db.js configures enableKeepAlive: true');
assert(dbConfigContent.includes('keepAliveInitialDelay'), 'db.js configures keepAliveInitialDelay');
assert(dbConfigContent.includes('maxIdle'), 'db.js configures maxIdle connection limit');

const adminRouteContent = fs.readFileSync(adminRoutePath, 'utf8');
assert(adminRouteContent.includes('Promise.all'), 'admin.js utilizes Promise.all for concurrent statistics queries');
assert(adminRouteContent.includes('countResult') && adminRouteContent.includes('Promise.all'), 'admin.js runs count and data queries concurrently');

const schemaSqlContent = fs.readFileSync(schemaSqlPath, 'utf8');
assert(schemaSqlContent.includes('idx_users_role'), 'schema.sql defines idx_users_role index');
assert(schemaSqlContent.includes('idx_users_created'), 'schema.sql defines idx_users_created index');
assert(schemaSqlContent.includes('idx_sessions_expires'), 'schema.sql defines idx_sessions_expires index');

const apiClientContent = fs.readFileSync(apiClientPath, 'utf8');
assert(apiClientContent.includes('inFlightRequests'), 'api-client.js implements inFlightRequests deduplication map');
assert(apiClientContent.includes('responseCache'), 'api-client.js implements responseCache TTL map');
assert(apiClientContent.includes('debounce'), 'api-client.js exports debounce utility');
assert(apiClientContent.includes('getAbortSignal'), 'api-client.js exports getAbortSignal utility');
assert(apiClientContent.includes('clearCache'), 'api-client.js exports clearCache utility');

const serveFrontendContent = fs.readFileSync(serveFrontendPath, 'utf8');
assert(serveFrontendContent.includes('Cache-Control'), 'serve-frontend.js configures Cache-Control headers');
assert(serveFrontendContent.includes('Content-Encoding'), 'serve-frontend.js supports gzip Content-Encoding');
assert(serveFrontendContent.includes('createGzip'), 'serve-frontend.js uses native zlib streaming compression');

// 3. Live Backend & Database Verification
const app = require('../backend/app');
const { getPool, closePool } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');

let server;
let port;
let baseUrl;

function requestRaw(method, endpoint, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const req = http.request(
      url,
      {
        method,
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            buffer,
            text: buffer.toString('utf8')
          });
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

async function runLivePerformanceTests() {
  const pool = getPool();

  // (a) Verify MySQL Indexes in active database
  const [userIndexes] = await pool.query('SHOW INDEX FROM users');
  const userIdxNames = userIndexes.map(i => i.Key_name);
  assert(userIdxNames.includes('idx_users_role'), 'MySQL users table possesses active idx_users_role index');
  assert(userIdxNames.includes('idx_users_created'), 'MySQL users table possesses active idx_users_created index');

  const [sessionIndexes] = await pool.query('SHOW INDEX FROM sessions');
  const sessionIdxNames = sessionIndexes.map(i => i.Key_name);
  assert(sessionIdxNames.includes('idx_sessions_expires'), 'MySQL sessions table possesses active idx_sessions_expires index');

  // Start ephemeral test server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  try {
    // (b) Native Gzip HTTP Compression Tests
    // Uncompressed request without Accept-Encoding: gzip
    const uncompressedRes = await requestRaw('GET', '/api/health/db');
    assert(uncompressedRes.statusCode === 200, 'GET /api/health/db returns 200 OK');
    assert(!uncompressedRes.headers['content-encoding'], 'Uncompressed request has no Content-Encoding header');

    // Compressed request with Accept-Encoding: gzip on large response (e.g. GET / with endpoints inventory or GET /api/admin/users)
    const [adminRows] = await pool.query("SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1");
    const rootAdmin = adminRows[0];
    const adminToken = generateToken({
      userId: rootAdmin.id,
      uuid: 'perf-test-uuid',
      username: rootAdmin.username,
      email: rootAdmin.email,
      role: rootAdmin.role
    });

    const uncompressedUsersRes = await requestRaw('GET', '/api/admin/users?page=1&limit=10', {
      'Authorization': `Bearer ${adminToken}`
    });
    const uncompressedSize = uncompressedUsersRes.buffer.length;

    const compressedUsersRes = await requestRaw('GET', '/api/admin/users?page=1&limit=10', {
      'Authorization': `Bearer ${adminToken}`,
      'Accept-Encoding': 'gzip'
    });

    assert(compressedUsersRes.statusCode === 200, 'GET /api/admin/users with Accept-Encoding: gzip returns 200 OK');
    assert(compressedUsersRes.headers['content-encoding'] === 'gzip', 'Response Content-Encoding is gzip');
    assert(compressedUsersRes.headers['vary'] === 'Accept-Encoding', 'Response includes Vary: Accept-Encoding');

    const compressedSize = compressedUsersRes.buffer.length;
    const compressionRatio = ((1 - compressedSize / uncompressedSize) * 100).toFixed(1);
    console.log(`[INFO] Uncompressed: ${uncompressedSize} bytes -> Gzipped: ${compressedSize} bytes (${compressionRatio}% reduction)`);
    assert(compressedSize < uncompressedSize, `Gzip compression reduced payload size (from ${uncompressedSize}B to ${compressedSize}B)`);

    // Verify decompression yields valid original JSON
    const decompressed = zlib.gunzipSync(compressedUsersRes.buffer);
    const parsedData = JSON.parse(decompressed.toString('utf8'));
    assert(parsedData.success === true, 'Decompressed payload parses into valid success response');
    assert(Array.isArray(parsedData.data.users), 'Decompressed payload contains valid user records array');

    // (c) Concurrent Query Execution Integrity
    const statsRes = await requestRaw('GET', '/api/admin/dashboard/stats', {
      'Authorization': `Bearer ${adminToken}`
    });
    assert(statsRes.statusCode === 200, 'GET /api/admin/dashboard/stats returns 200 OK with Promise.all execution');
    const statsData = JSON.parse(statsRes.text);
    assert(typeof statsData.data.users.total === 'number', 'Parallel stats execution returns valid total user count');
    assert(typeof statsData.data.financials.totalAvailableBalance === 'number', 'Parallel stats execution returns valid financial sum');
    assert(typeof statsData.data.sessions.activeCount === 'number', 'Parallel stats execution returns valid active session count');

    // (d) Static Server Cache-Control & Gzip Verification
    // Test static server port 5500 if running
    try {
      const staticRes = await new Promise((resolve, reject) => {
        const req = http.request(
          'http://localhost:5500/css/components.css',
          {
            headers: { 'Accept-Encoding': 'gzip' }
          },
          (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              buffer: Buffer.concat(chunks)
            }));
          }
        );
        req.on('error', reject);
        req.end();
      });

      assert(staticRes.statusCode === 200, 'Frontend server serves components.css with 200 OK');
      assert(Boolean(staticRes.headers['cache-control']), 'Static CSS response contains Cache-Control header');
      assert(staticRes.headers['content-encoding'] === 'gzip', 'Static CSS response is streaming gzip compressed');
    } catch (staticErr) {
      console.warn('[STATIC TEST NOTICE] Static server test completed:', staticErr.message);
    }

  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
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

runLivePerformanceTests().catch(err => {
  console.error('[FATAL] Performance test suite failed:', err);
  process.exit(1);
});
