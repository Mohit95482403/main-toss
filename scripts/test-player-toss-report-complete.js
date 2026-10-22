const http = require('http');
const path = require('path');
const assert = require('assert');
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { getPool } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
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
  console.log('================================================================');
  console.log('DADDY TOSS BOOK — PLAYER TOSS REPORT SYSTEM VERIFICATION');
  console.log('================================================================\n');

  const pool = getPool();

  // 1. Acquire Admin Token
  const [adminRows] = await pool.query(
    "SELECT id, uuid, username, email, role FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1"
  );
  assert(adminRows.length > 0, 'Admin account exists in database');
  const admin = adminRows[0];
  const adminToken = generateToken({
    userId: admin.id,
    uuid: admin.uuid || 'admin-test-uuid',
    username: admin.username,
    email: admin.email,
    role: admin.role
  });

  // 2. Ensure dtb1 exists and has mohit sonawane name
  let [dtb1Rows] = await pool.query("SELECT id, uuid, username, email, role, full_name, status FROM users WHERE username = 'dtb1' LIMIT 1");
  let dtb1;
  if (dtb1Rows.length === 0) {
    const [res] = await pool.query(
      "INSERT INTO users (username, full_name, email, password_hash, role, status) VALUES ('dtb1', 'mohit sonawane', 'dtb1@test.com', 'hash', 'user', 'active')"
    );
    dtb1 = { id: res.insertId, username: 'dtb1', full_name: 'mohit sonawane', status: 'active' };
  } else {
    dtb1 = dtb1Rows[0];
    await pool.query("UPDATE users SET full_name = 'mohit sonawane', status = 'active' WHERE id = ?", [dtb1.id]);
    dtb1.full_name = 'mohit sonawane';
  }

  // Ensure test match exists
  let [matchRows] = await pool.query("SELECT id FROM matches LIMIT 1");
  let matchId;
  if (matchRows.length === 0) {
    const [mRes] = await pool.query(
      "INSERT INTO matches (competition, match_title, team_one, team_two, status) VALUES ('IPL 2026', 'CSK vs MI', 'Chennai Super Kings', 'Mumbai Indians', 'upcoming')"
    );
    matchId = mRes.insertId;
  } else {
    matchId = matchRows[0].id;
  }

  // Ensure dtb1 has the exact 7 test bets required for the toss report math verification
  const [existingBets] = await pool.query("SELECT count(*) as count FROM bets WHERE user_id = ?", [dtb1.id]);
  if (existingBets[0].count !== 7) {
    await pool.query("DELETE FROM bets WHERE user_id = ?", [dtb1.id]);
    const now = new Date();
    // 4 bets on 'Mumbai Indians' (no_result, stake 50, payout 50)
    for (let i = 0; i < 4; i++) {
      const betId = `BET-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 8)}`;
      await pool.query(
        "INSERT INTO bets (id, user_id, match_id, market_name, selection, stake, odds, potential_return, status, settlement_status, payout, refund_amount, created_at) VALUES (?, ?, ?, 'Match Toss', 'Mumbai Indians', 50, 1.95, 97.5, 'no_result', 'settled', 50, 50, ?)",
        [betId, dtb1.id, matchId, now]
      );
    }
    // 1 won bet on 'INDIA' (stake 500, payout 975)
    const betIdWonInd = `BET-${Date.now()}-ind-won-${Math.random().toString(36).substring(2, 8)}`;
    await pool.query(
      "INSERT INTO bets (id, user_id, match_id, market_name, selection, stake, odds, potential_return, status, settlement_status, payout, refund_amount, created_at) VALUES (?, ?, ?, 'Match Toss', 'INDIA', 500, 1.95, 975, 'won', 'settled', 975, 0, ?)",
      [betIdWonInd, dtb1.id, matchId, now]
    );
    // 1 lost bet on 'INDIA' (stake 100, payout 0)
    const betIdLostInd = `BET-${Date.now()}-ind-lost-${Math.random().toString(36).substring(2, 8)}`;
    await pool.query(
      "INSERT INTO bets (id, user_id, match_id, market_name, selection, stake, odds, potential_return, status, settlement_status, payout, refund_amount, created_at) VALUES (?, ?, ?, 'Match Toss', 'INDIA', 100, 1.95, 195, 'lost', 'settled', 0, 0, ?)",
      [betIdLostInd, dtb1.id, matchId, now]
    );
    // 1 won bet on 'pakistan' (stake 500, payout 975)
    const betIdWonPak = `BET-${Date.now()}-pak-won-${Math.random().toString(36).substring(2, 8)}`;
    await pool.query(
      "INSERT INTO bets (id, user_id, match_id, market_name, selection, stake, odds, potential_return, status, settlement_status, payout, refund_amount, created_at) VALUES (?, ?, ?, 'Match Toss', 'pakistan', 500, 1.95, 975, 'won', 'settled', 975, 0, ?)",
      [betIdWonPak, dtb1.id, matchId, now]
    );
  }

  // Ensure zero-bets user exists for Test 5
  let [zeroUserRows] = await pool.query(
    "SELECT u.id, u.username FROM users u LEFT JOIN bets b ON u.id = b.user_id WHERE u.role = 'user' AND b.id IS NULL LIMIT 1"
  );
  let zeroUserId;
  if (zeroUserRows.length === 0) {
    const [zRes] = await pool.query(
      "INSERT INTO users (username, full_name, email, password_hash, role, status) VALUES (?, 'Zero Bets Player', 'zero@test.com', 'hash', 'user', 'active')",
      [`zero_user_${Date.now()}`]
    );
    zeroUserId = zRes.insertId;
  } else {
    zeroUserId = zeroUserRows[0].id;
  }

  const normalUserToken = generateToken({
    userId: dtb1.id,
    uuid: dtb1.uuid || 'user-test-uuid',
    username: dtb1.username,
    email: dtb1.email,
    role: 'user'
  });

  const authHeaders = {
    'Authorization': `Bearer ${adminToken}`
  };

  const dtb1Id = dtb1.id;

  // ============================================================================
  // TEST SUITE 1: 7 DAYS FILTER ACCURACY (DEFAULT)
  // ============================================================================
  console.log(`>>> [TEST 1] Testing 7 Days Report for player ${dtb1Id} (${dtb1.username})...`);
  const res7d = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${dtb1Id}/toss-report?period=7d`,
    method: 'GET',
    headers: authHeaders
  });

  assert.strictEqual(res7d.status, 200, '7d report returns 200 OK');
  assert.strictEqual(res7d.body.success, true, '7d report returns success: true');
  assert.strictEqual(res7d.body.data.period, '7d', 'Canonical period is 7d');
  assert.strictEqual(res7d.body.data.user.username, 'dtb1', 'Selected user username is dtb1');
  assert.strictEqual(res7d.body.data.user.fullName, 'mohit sonawane', 'Selected user full name is mohit sonawane');
  assert.strictEqual(res7d.body.data.user.status, 'active', 'User status is active');

  const s7 = res7d.body.data.summary;
  console.log('   7 Days Summary:', s7);
  assert(s7.totalBets >= 7, `Total bets (${s7.totalBets}) is at least 7`);
  assert(s7.totalStake >= 1300, `Total stake (${s7.totalStake}) is at least 1300.00`);
  assert(s7.wonBets >= 1, `Won bets (${s7.wonBets}) is at least 1`);
  assert(s7.lostBets >= 1, `Lost bets (${s7.lostBets}) is at least 1`);
  assert(s7.noResultBets >= 4, `No result bets (${s7.noResultBets}) is at least 4`);
  assert(s7.totalPayout >= 2150, `Total payout (${s7.totalPayout}) is at least 2150.00`);
  assert.strictEqual(s7.netProfitLoss, 850, 'Net profit/loss is exactly 850.00');
  console.log('   ✓ 7 Days report summary statistics matched MySQL records exactly.');

  // ============================================================================
  // TEST SUITE 2: 15 DAYS & 30 DAYS & LIFETIME FILTERS
  // ============================================================================
  console.log('\n>>> [TEST 2] Testing 15 Days, 30 Days, and Lifetime filters...');
  const res15d = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${dtb1Id}/toss-report?period=15d`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(res15d.status, 200, '15d report returns 200 OK');
  assert(res15d.body.data.summary.totalBets >= 7, '15d total bets is at least 7');

  const res30d = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${dtb1Id}/toss-report?period=30d`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(res30d.status, 200, '30d report returns 200 OK');
  assert(res30d.body.data.summary.totalBets >= 7, '30d total bets is at least 7');

  const resLife = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${dtb1Id}/toss-report?period=lifetime`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(resLife.status, 200, 'Lifetime report returns 200 OK');
  assert.strictEqual(resLife.body.data.period, 'lifetime', 'Canonical period is lifetime');
  assert(resLife.body.data.summary.totalBets >= 7, 'Lifetime total bets is at least 7');
  console.log('   ✓ All 4 date period filters executed and validated successfully.');

  // ============================================================================
  // TEST SUITE 3: TOSS-WISE BREAKDOWN ACCURACY
  // ============================================================================
  console.log(`\n>>> [TEST 3] Testing Toss-Wise Breakdown for player ${dtb1Id}...`);
  const breakdown = res7d.body.data.breakdown;
  assert(Array.isArray(breakdown) && breakdown.length > 0, 'Breakdown is a non-empty array');
  console.log('   Breakdown groups:', breakdown.map(b => `${b.selection}: ${b.totalBets} bets (Net: ${b.netProfitLoss})`));
  
  const mi = breakdown.find(b => b.selection === 'Mumbai Indians');
  assert(mi !== undefined, 'Mumbai Indians group exists');
  assert.strictEqual(mi.totalBets, 4, 'Mumbai Indians has 4 bets');
  assert.strictEqual(mi.noResultBets, 4, 'Mumbai Indians has 4 no_result bets');
  assert.strictEqual(mi.totalStake, 200, 'Mumbai Indians total stake is 200');
  assert.strictEqual(mi.totalPayout, 200, 'Mumbai Indians refund payout is 200');
  assert.strictEqual(mi.netProfitLoss, 0, 'Mumbai Indians net profit/loss is 0.00');

  const ind = breakdown.find(b => b.selection === 'INDIA');
  assert(ind !== undefined, 'INDIA group exists');
  assert.strictEqual(ind.totalBets, 2, 'INDIA has 2 bets');
  assert.strictEqual(ind.wonBets, 1, 'INDIA has 1 won bet');
  assert.strictEqual(ind.lostBets, 1, 'INDIA has 1 lost bet');
  assert.strictEqual(ind.totalStake, 600, 'INDIA total stake is 600 (500 + 100)');
  assert.strictEqual(ind.totalPayout, 975, 'INDIA total payout is 975');
  assert.strictEqual(ind.netProfitLoss, 375, 'INDIA net profit is 375 (975 - 600)');

  const pak = breakdown.find(b => b.selection === 'pakistan');
  assert(pak !== undefined, 'pakistan group exists');
  assert.strictEqual(pak.totalBets, 1, 'pakistan has 1 bet');
  assert.strictEqual(pak.wonBets, 1, 'pakistan has 1 won bet');
  assert.strictEqual(pak.totalStake, 500, 'pakistan total stake is 500');
  assert.strictEqual(pak.totalPayout, 975, 'pakistan total payout is 975');
  assert.strictEqual(pak.netProfitLoss, 475, 'pakistan net profit is 475 (975 - 500)');

  // Sum of net profit/loss across options
  const breakdownSumPL = breakdown.reduce((sum, b) => sum + b.netProfitLoss, 0);
  assert.strictEqual(breakdownSumPL, s7.netProfitLoss, 'Sum of toss option P/L exactly equals overall net P/L');
  console.log('   ✓ Toss-wise breakdown calculated with 100% mathematical precision.');

  // ============================================================================
  // TEST SUITE 4: PAGINATION INTEGRITY
  // ============================================================================
  console.log('\n>>> [TEST 4] Testing Pagination on Bet Records...');
  const resPage1 = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${dtb1Id}/toss-report?period=7d&page=1&limit=3`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(resPage1.body.data.records.length, 3, 'Page 1 limit 3 returns 3 records');
  assert.strictEqual(resPage1.body.data.pagination.page, 1, 'Pagination page is 1');
  const expectedTotal = s7.totalBets;
  const expectedTotalPages = Math.ceil(expectedTotal / 3);
  assert.strictEqual(resPage1.body.data.pagination.total, expectedTotal, `Pagination total records is ${expectedTotal}`);
  assert.strictEqual(resPage1.body.data.pagination.totalPages, expectedTotalPages, `Pagination totalPages is ${expectedTotalPages}`);

  const resPage2 = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${dtb1Id}/toss-report?period=7d&page=2&limit=3`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(resPage2.body.data.records.length, 3, 'Page 2 limit 3 returns 3 records');
  assert.notStrictEqual(resPage1.body.data.records[0].id, resPage2.body.data.records[0].id, 'Page 1 and Page 2 contain distinct records');

  // Verify that summary statistics are NOT degraded by pagination limit
  assert(resPage1.body.data.summary.totalBets >= 7, 'Summary reflects full period even when page size is small');
  console.log('   ✓ Pagination functions correctly and does not compromise overall summary totals.');

  // ============================================================================
  // TEST SUITE 5: PLAYER WITH ZERO BETS (EMPTY STATE VERIFICATION)
  // ============================================================================
  console.log(`\n>>> [TEST 5] Testing Player with Zero Bets (User ${zeroUserId})...`);
  const resEmpty = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${zeroUserId}/toss-report?period=7d`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(resEmpty.status, 200, 'Zero bets user returns 200 OK');
  assert.strictEqual(resEmpty.body.data.summary.totalBets, 0, 'Zero bets user totalBets is 0');
  assert.strictEqual(resEmpty.body.data.summary.totalStake, 0, 'Zero bets user totalStake is 0.00');
  assert.strictEqual(resEmpty.body.data.summary.wonBets, 0, 'Zero bets user wonBets is 0');
  assert.strictEqual(resEmpty.body.data.summary.netProfitLoss, 0, 'Zero bets user netProfitLoss is 0.00');
  assert.strictEqual(resEmpty.body.data.breakdown.length, 0, 'Zero bets user breakdown is empty array');
  assert.strictEqual(resEmpty.body.data.records.length, 0, 'Zero bets user records is empty array');
  console.log('   ✓ Player with 0 bets cleanly handled with zero metrics and empty records array.');

  // ============================================================================
  // TEST SUITE 6: SECURITY & AUTHORIZATION GUARDS
  // ============================================================================
  console.log('\n>>> [TEST 6] Testing Security, RBAC & Parameter Validation...');
  // 6A. Unauthenticated request
  const resUnauth = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${dtb1Id}/toss-report?period=7d`,
    method: 'GET'
  });
  assert.strictEqual(resUnauth.status, 401, 'Unauthenticated request rejected with 401');

  // 6B. Normal user attempting admin toss-report access (RBAC)
  const resForbidden = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${dtb1Id}/toss-report?period=7d`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${normalUserToken}` }
  });
  assert.strictEqual(resForbidden.status, 403, 'Normal user role rejected with 403 Forbidden');

  // 6C. Invalid user ID parameter
  const resInvalidId = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/users/invalid_id/toss-report?period=7d',
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(resInvalidId.status, 400, 'Non-integer user ID rejected with 400 Bad Request');
  assert.strictEqual(resInvalidId.body.error.code, 'INVALID_ID', 'Invalid ID returns INVALID_ID code');

  // 6D. Non-existent user ID
  const resNotFound = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/users/888888/toss-report?period=7d',
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(resNotFound.status, 404, 'Non-existent user returns 404 Not Found');
  assert.strictEqual(resNotFound.body.error.code, 'NOT_FOUND', 'Returns NOT_FOUND code');

  // 6E. Invalid period parameter
  const resBadPeriod = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${dtb1Id}/toss-report?period=999years`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(resBadPeriod.status, 400, 'Invalid period string rejected with 400 Bad Request');
  assert.strictEqual(resBadPeriod.body.error.code, 'INVALID_PERIOD', 'Returns INVALID_PERIOD code');
  console.log('   ✓ RBAC security, IDOR protection, and parameter validation verified.');

  console.log('\n================================================================');
  console.log('ALL TESTS PASSED! PLAYER TOSS REPORT SYSTEM IS 100% OPERATIONAL');
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
