/**
 * IRONMAN TOSS BOOK - Strict Stake Limits (₹50 to ₹100,000) Test Suite
 * 
 * Tests the fixed stake limits against the live backend:
 * - Minimum stake: ₹50
 * - Maximum stake: ₹100,000
 * - Rejection of ₹0, ₹1, ₹49, ₹100,001, negative, empty, non-numeric, NaN, Infinity, decimal over-precision
 * - Acceptance of ₹50, ₹100, ₹50,000, ₹100,000 (when balance allows)
 * - Balance & exposure protection (no deductions, no bet creation on reject)
 * - Existing rules retention (insufficient balance, match expiry)
 */

const http = require('http');
const { getPool, closePool } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName} ${details ? '- ' + details : ''}`);
    failedCount++;
  }
}

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      },
      res => {
        let resData = '';
        res.on('data', chunk => (resData += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(resData);
          } catch (e) {
            json = resData;
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('===============================================================');
  console.log('  IRONMAN TOSS BOOK — FIXED STAKE LIMITS VALIDATION TEST SUITE');
  console.log('  Limits: Minimum ₹50 | Maximum ₹100,000');
  console.log('===============================================================\n');

  const pool = getPool();
  const testMatchId = `TEST-MATCH-${Date.now()}`;
  const expiredMatchId = `TEST-EXPIRED-${Date.now()}`;
  let originalBalance = 0;
  let originalExposure = 0;
  let testUserId = null;
  let token = null;

  try {
    // 1. Get test user
    const [users] = await pool.query(
      `SELECT u.id, u.username, u.role, w.available_balance, w.exposure_balance 
       FROM users u 
       JOIN wallets w ON w.user_id = u.id 
       WHERE u.role = 'user' 
       LIMIT 1`
    );
    if (users.length === 0) {
      throw new Error('No user found in database to test.');
    }
    const testUser = users[0];
    testUserId = testUser.id;
    originalBalance = parseFloat(testUser.available_balance);
    originalExposure = parseFloat(testUser.exposure_balance);

    token = generateToken({
      id: testUser.id,
      username: testUser.username,
      role: testUser.role
    });

    console.log(`Using Test User: ${testUser.username} (ID: ${testUser.id})`);
    console.log(`Original Available Balance: ₹${originalBalance.toFixed(2)}, Exposure: ₹${originalExposure.toFixed(2)}\n`);

    // Ensure user has ample balance to test ₹50,000 and ₹100,000 bets
    await pool.query(
      `UPDATE wallets SET available_balance = 300000.00, exposure_balance = 0.00 WHERE user_id = ?`,
      [testUserId]
    );

    // 2. Insert temporary active match
    const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours in future
    await pool.query(
      `INSERT INTO matches (id, match_title, competition, team_one, team_one_rate, team_two, team_two_rate, status, match_end_time, settled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, 0)`,
      [testMatchId, 'India vs Australia Stake Limit Test', 'T20 Trophy', 'India', 1.95, 'Australia', 1.95, futureTime]
    );

    // Insert expired match for testing expiry check
    const pastTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes in past
    await pool.query(
      `INSERT INTO matches (id, match_title, competition, team_one, team_one_rate, team_two, team_two_rate, status, match_end_time, settled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, 1)`,
      [expiredMatchId, 'Expired Test Match', 'T20 Trophy', 'England', 1.95, 'South Africa', 1.95, pastTime]
    );

    async function getWalletSnapshot() {
      const [w] = await pool.query(`SELECT available_balance, exposure_balance FROM wallets WHERE user_id = ?`, [testUserId]);
      return {
        available: parseFloat(w[0].available_balance),
        exposure: parseFloat(w[0].exposure_balance)
      };
    }

    async function getBetCount(matchId) {
      const [b] = await pool.query(`SELECT COUNT(*) as cnt FROM bets WHERE user_id = ? AND match_id = ?`, [testUserId, matchId]);
      return b[0].cnt;
    }

    // --- TEST SECTION 1: REJECTION OF INVALID & BOUNDARY BREACHING STAKES ---
    console.log('--- SECTION 1: REJECTED STAKES VALIDATION & BALANCE PROTECTION ---');

    const rejectionTestCases = [
      { name: 'Stake ₹0 (zero)', stake: 0, expectedCode: 'INVALID_STAKE' },
      { name: 'Stake ₹1 (below min)', stake: 1, expectedCode: 'MIN_STAKE_ERROR' },
      { name: 'Stake ₹49 (1 below min ₹50)', stake: 49, expectedCode: 'MIN_STAKE_ERROR' },
      { name: 'Stake ₹49.99 (just below min ₹50)', stake: 49.99, expectedCode: 'MIN_STAKE_ERROR' },
      { name: 'Stake ₹100,001 (1 above max ₹100,000)', stake: 100001, expectedCode: 'MAX_STAKE_ERROR' },
      { name: 'Stake ₹200,000 (well above max ₹100,000)', stake: 200000, expectedCode: 'MAX_STAKE_ERROR' },
      { name: 'Negative amount (-₹50)', stake: -50, expectedCode: 'INVALID_STAKE' },
      { name: 'Negative amount (-₹1)', stake: -1, expectedCode: 'INVALID_STAKE' },
      { name: 'Empty string stake ("")', stake: '', expectedCode: 'INVALID_STAKE' },
      { name: 'Invalid text string ("abc")', stake: 'abc', expectedCode: 'INVALID_STAKE' },
      { name: 'Invalid text string ("50abc")', stake: '50abc', expectedCode: 'INVALID_STAKE' },
      { name: 'NaN as string ("NaN")', stake: 'NaN', expectedCode: 'INVALID_STAKE' },
      { name: 'Infinity as string ("Infinity")', stake: 'Infinity', expectedCode: 'INVALID_STAKE' },
      { name: 'Null stake', stake: null, expectedCode: 'INVALID_STAKE' },
      { name: 'Over-precision decimal (₹50.123 - >2 decimals)', stake: 50.123, expectedCode: 'INVALID_STAKE_PRECISION' }
    ];

    for (const tc of rejectionTestCases) {
      const snapBefore = await getWalletSnapshot();
      const betsBefore = await getBetCount(testMatchId);

      const res = await makeRequest('POST', '/api/bets/place', {
        matchId: testMatchId,
        selection: 'India',
        stake: tc.stake
      }, token);

      assert(res.status === 400, `${tc.name} returns HTTP 400`, `got status ${res.status}`);
      assert(res.body && res.body.success === false, `${tc.name} body.success is false`);
      if (tc.expectedCode) {
        const actualCode = res.body && res.body.error && res.body.error.code;
        assert(actualCode === tc.expectedCode, `${tc.name} error code matches '${tc.expectedCode}'`, `got code: ${actualCode}`);
      }

      // Verify Balance, Exposure, and Bet table remain untouched
      const snapAfter = await getWalletSnapshot();
      const betsAfter = await getBetCount(testMatchId);

      assert(
        snapBefore.available === snapAfter.available && snapBefore.exposure === snapAfter.exposure,
        `${tc.name} preserves balance and exposure (Available: ₹${snapAfter.available}, Exposure: ₹${snapAfter.exposure})`
      );
      assert(betsBefore === betsAfter, `${tc.name} creates NO bet records (Count: ${betsAfter})`);
    }

    // --- TEST SECTION 2: ACCEPTANCE OF VALID BOUNDARY & VALID STAKES ---
    console.log('\n--- SECTION 2: ACCEPTED VALID STAKES ---');

    const acceptanceTestCases = [
      { name: 'Stake ₹50 (Exact Minimum)', stake: 50 },
      { name: 'Stake ₹100 (Standard Stake)', stake: 100 },
      { name: 'Stake ₹50,000 (Substantial Stake)', stake: 50000 },
      { name: 'Stake ₹100,000 (Exact Maximum Boundary)', stake: 100000 }
    ];

    for (const tc of acceptanceTestCases) {
      const snapBefore = await getWalletSnapshot();
      const betsBefore = await getBetCount(testMatchId);

      const res = await makeRequest('POST', '/api/bets/place', {
        matchId: testMatchId,
        selection: 'India',
        stake: tc.stake
      }, token);

      assert(res.status === 201, `${tc.name} accepted with HTTP 201 Created`, `got status ${res.status}: ${JSON.stringify(res.body)}`);
      assert(res.body && res.body.success === true, `${tc.name} body.success is true`);
      assert(res.body && res.body.data && res.body.data.bet && res.body.data.bet.stake === tc.stake, `${tc.name} bet stake matches ₹${tc.stake}`);

      const snapAfter = await getWalletSnapshot();
      const betsAfter = await getBetCount(testMatchId);

      const expectedNewAvail = parseFloat((snapBefore.available - tc.stake).toFixed(2));
      const expectedNewExp = parseFloat((snapBefore.exposure + tc.stake).toFixed(2));

      assert(
        Math.abs(snapAfter.available - expectedNewAvail) < 0.01,
        `${tc.name} balance accurately deducted (Expected ₹${expectedNewAvail}, Got ₹${snapAfter.available})`
      );
      assert(
        Math.abs(snapAfter.exposure - expectedNewExp) < 0.01,
        `${tc.name} exposure accurately increased (Expected ₹${expectedNewExp}, Got ₹${snapAfter.exposure})`
      );
      assert(betsAfter === betsBefore + 1, `${tc.name} bet record created in database`);
    }

    // --- TEST SECTION 3: ALTERNATIVE ENDPOINT ALIAS /api/bets ---
    console.log('\n--- SECTION 3: ALTERNATIVE ENDPOINT ALIAS (POST /api/bets) ---');
    {
      const resMin = await makeRequest('POST', '/api/bets', {
        matchId: testMatchId,
        selection: 'India',
        stake: 40 // Below min
      }, token);
      assert(resMin.status === 400 && resMin.body.error.code === 'MIN_STAKE_ERROR', 'POST /api/bets enforces ₹50 minimum');

      const resMax = await makeRequest('POST', '/api/bets', {
        matchId: testMatchId,
        selection: 'India',
        stake: 100005 // Above max
      }, token);
      assert(resMax.status === 400 && resMax.body.error.code === 'MAX_STAKE_ERROR', 'POST /api/bets enforces ₹100,000 maximum');
    }

    // --- TEST SECTION 4: EXISTING BUSINESS RULE INTEGRITY ---
    console.log('\n--- SECTION 4: EXISTING BUSINESS RULE INTEGRITY ---');

    // 4a. Insufficient balance rejection
    {
      // Set balance to ₹60
      await pool.query(`UPDATE wallets SET available_balance = 60.00 WHERE user_id = ?`, [testUserId]);
      const res = await makeRequest('POST', '/api/bets/place', {
        matchId: testMatchId,
        selection: 'India',
        stake: 100 // Valid stake (within 50-100k) but insufficient balance
      }, token);
      assert(res.status === 400, 'Insufficient balance rejects valid stake ₹100 when balance is ₹60');
      assert(res.body && res.body.error && res.body.error.code === 'INSUFFICIENT_BALANCE', 'Returns INSUFFICIENT_BALANCE code');
    }

    // 4b. Expired/Settled match rejection
    {
      const res = await makeRequest('POST', '/api/bets/place', {
        matchId: expiredMatchId,
        selection: 'England',
        stake: 50
      }, token);
      assert(res.status === 400, 'Expired/completed match rejects betting with HTTP 400');
      assert(res.body && res.body.error && (res.body.error.code === 'MATCH_EXPIRED' || res.body.error.code === 'BETTING_CLOSED' || res.body.error.code === 'MATCH_NOT_OPEN'), 'Returns match closed/expired error', `got code: ${res.body && res.body.error && res.body.error.code}`);
    }

  } catch (err) {
    console.error('Test Execution Error:', err);
    failedCount++;
  } finally {
    // Clean up test matches and test bets
    console.log('\nCleaning up test artifacts...');
    try {
      await pool.query(`DELETE FROM bets WHERE match_id IN (?, ?)`, [testMatchId, expiredMatchId]);
      await pool.query(`DELETE FROM matches WHERE id IN (?, ?)`, [testMatchId, expiredMatchId]);
      if (testUserId) {
        await pool.query(
          `UPDATE wallets SET available_balance = ?, exposure_balance = ? WHERE user_id = ?`,
          [originalBalance, originalExposure, testUserId]
        );
        console.log(`Restored user wallet to available: ₹${originalBalance}, exposure: ₹${originalExposure}`);
      }
    } catch (cleanErr) {
      console.error('Cleanup Error:', cleanErr);
    }

    console.log('\n===============================================================');
    console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('===============================================================');

    await closePool();
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

run();
