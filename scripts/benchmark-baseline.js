/**
 * IRONMAN TOSS BOOK - DAY 16 PERFORMANCE BASELINE BENCHMARK SCRIPT
 * Measures actual HTTP API latencies, MySQL query execution times, EXPLAIN plans,
 * and static asset sizes in the real local development environment.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { getPool, closePool } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');

async function measureHttpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        const durationMs = performance.now() - start;
        let json = null;
        try { json = JSON.parse(raw); } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          durationMs,
          bodySize: Buffer.byteLength(raw),
          json
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runBenchmark() {
  console.log('====================================================');
  console.log('IRONMAN TOSS BOOK - DAY 16 INITIAL PERFORMANCE BASELINE');
  console.log('====================================================\n');

  // 1. Static Asset Sizes
  console.log('--- 1. STATIC ASSET SIZES ---');
  const root = path.join(__dirname, '..');
  const assetPaths = [
    'frontend/css/variables.css',
    'frontend/css/global.css',
    'frontend/css/components.css',
    'frontend/css/admin.css',
    'frontend/css/passbook.css',
    'frontend/js/api-client.js',
    'frontend/js/admin.js',
    'frontend/js/passbook.js',
    'frontend/js/profile.js',
    'frontend/js/shared-layout.js'
  ];

  let totalAssetBytes = 0;
  for (const rel of assetPaths) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) {
      const bytes = fs.statSync(full).size;
      totalAssetBytes += bytes;
      console.log(`  ${rel.padEnd(35)} : ${(bytes / 1024).toFixed(2)} KB (${bytes} bytes)`);
    }
  }
  console.log(`  Total Core Assets Size            : ${(totalAssetBytes / 1024).toFixed(2)} KB\n`);

  // 2. MySQL Query Execution Times & Query Plans
  console.log('--- 2. MYSQL QUERY TIMINGS & EXPLAIN PLANS ---');
  const pool = getPool();

  // (a) Stats query
  const tStats0 = performance.now();
  const [[userCounts]] = await pool.query(`
    SELECT 
      COUNT(*) AS totalUsers,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeUsers,
      SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspendedUsers,
      SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS bannedUsers,
      SUM(CASE WHEN role IN ('admin', 'super_admin') THEN 1 ELSE 0 END) AS adminUsers
    FROM users;
  `);
  const dStatsUsers = performance.now() - tStats0;

  // (b) User directory join query
  const tUsers0 = performance.now();
  const [userListRows] = await pool.query(`
    SELECT u.id, u.username, u.email, u.role, u.status, u.created_at, w.available_balance, w.exposure_balance
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id
    ORDER BY u.created_at DESC
    LIMIT 10 OFFSET 0;
  `);
  const dUsersQuery = performance.now() - tUsers0;

  // (c) EXPLAIN plans
  const [explainUserQuery] = await pool.query(`
    EXPLAIN SELECT u.id, u.username, u.email, u.role, u.status, u.created_at, w.available_balance
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id
    ORDER BY u.created_at DESC
    LIMIT 10 OFFSET 0;
  `);

  console.log(`  User counts aggregation query     : ${dStatsUsers.toFixed(3)} ms`);
  console.log(`  User list with wallet JOIN        : ${dUsersQuery.toFixed(3)} ms`);
  console.log('  EXPLAIN for User List Query:');
  explainUserQuery.forEach(row => {
    console.log(`    Table: ${row.table.padEnd(10)} Type: ${(row.type || '').padEnd(8)} PossibleKeys: ${(row.possible_keys || 'NULL').padEnd(15)} Key: ${(row.key || 'NULL').padEnd(15)} Extra: ${row.Extra || ''}`);
  });
  console.log('');

  // 3. API Latency Measurements (HTTP Benchmark)
  console.log('--- 3. HTTP API LATENCY BENCHMARK (Average of 5 runs) ---');

  // Find root admin to generate token
  const [adminRows] = await pool.query("SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1");
  const rootAdmin = adminRows[0] || { id: 1, username: 'admin', email: 'admin@ironmantossbook.com', role: 'super_admin' };
  const adminToken = generateToken({
    userId: rootAdmin.id,
    uuid: 'admin-benchmark-uuid',
    username: rootAdmin.username,
    email: rootAdmin.email,
    role: rootAdmin.role
  });

  const endpointsToTest = [
    { name: 'GET /', path: '/', method: 'GET', auth: false },
    { name: 'GET /api/health', path: '/api/health', method: 'GET', auth: false },
    { name: 'GET /api/health/db', path: '/api/health/db', method: 'GET', auth: false },
    { name: 'GET /api/auth/me', path: '/api/auth/me', method: 'GET', auth: true },
    { name: 'GET /api/admin/dashboard/stats', path: '/api/admin/dashboard/stats', method: 'GET', auth: true },
    { name: 'GET /api/admin/users?page=1&limit=10', path: '/api/admin/users?page=1&limit=10', method: 'GET', auth: true },
    { name: 'GET /api/admin/audit-logs?page=1&limit=15', path: '/api/admin/audit-logs?page=1&limit=15', method: 'GET', auth: true },
    { name: 'GET /api/admin/system/status', path: '/api/admin/system/status', method: 'GET', auth: true }
  ];

  for (const ep of endpointsToTest) {
    const runs = [];
    let lastSize = 0;
    for (let i = 0; i < 5; i++) {
      const opts = {
        hostname: 'localhost',
        port: 5000,
        path: ep.path,
        method: ep.method,
        headers: {
          'Accept': 'application/json',
          ...(ep.auth ? { 'Authorization': `Bearer ${adminToken}` } : {})
        }
      };
      try {
        const res = await measureHttpRequest(opts);
        runs.push(res.durationMs);
        lastSize = res.bodySize;
      } catch (err) {
        console.error(`  [ERROR] Benchmark request failed for ${ep.path}:`, err.message);
        break;
      }
    }

    if (runs.length > 0) {
      const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
      const min = Math.min(...runs);
      const max = Math.max(...runs);
      console.log(`  ${ep.name.padEnd(38)} : Avg: ${avg.toFixed(2)} ms (Min: ${min.toFixed(2)} ms, Max: ${max.toFixed(2)} ms) | Payload: ${lastSize} bytes`);
    }
  }

  await closePool();
  console.log('\n====================================================');
  console.log('BASELINE BENCHMARK COMPLETE');
  console.log('====================================================\n');
}

runBenchmark().catch(err => {
  console.error('[FATAL] Baseline script failed:', err);
  process.exit(1);
});
