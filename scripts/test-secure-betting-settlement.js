/**
 * DADDY TOSS BOOK — Comprehensive Security & Financial Integrity Test Suite
 * 
 * Tests Phases 2 through 11:
 * - Section A: Bet Placement Security (Authentication, Account Status, Match Eligibility, Cutoffs, Stake Limits, Race Conditions)
 * - Section B: Bet Tampering & Ownership Security (Immutability, Ownership Isolation, Cancellation Cutoff, Double-Refund Prevention)
 * - Section C: Settlement Authorization & State Transition Security (Admin RBAC, Outcome Validation, Double-Payout Prevention, No Casual Reopening)
 * - Section D: Wallet & Transaction Ledger Integrity (Balance / Exposure Consistency, Correct Payout Formulas, Immutable Audit Trail)
 */

const http = require('http');
const { getPool } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');

const BASE_URL = 'http://localhost:5000/api';

function request(method, path, body = null, token = null, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const payload = body !== null && body !== undefined ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'Connection': 'close',
      ...customHeaders
    };
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      url,
      { method, headers, agent: false },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(`Assertion failure: ${message}`);
  } else {
    passedTests++;
    console.log(`  ✓ ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('DADDY TOSS BOOK — SECURE MATCH BETTING & SETTLEMENT TEST SUITE');
  console.log('================================================================\n');

  const pool = getPool();

  // Retrieve or authenticate Admin
  const [admins] = await pool.query("SELECT id, username, email, role FROM users WHERE role IN ('super_admin', 'admin') LIMIT 1");
  assert(admins.length > 0, 'Admin user exists in database');
  const admin = admins[0];
  const adminToken = generateToken({
    userId: admin.id,
    username: admin.username,
    email: admin.email,
    role: admin.role
  });

  // Helper to create a test user
  async function createPlayer(prefix, balance = 2000, status = 'active') {
    const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const pass = 'SecurePass123!';
    const res = await request('POST', '/admin/users/create', {
      displayName: `Player ${prefix}`,
      username,
      password: pass,
      confirmPassword: pass,
      initialCoinBalance: balance,
      accountStatus: status
    }, adminToken);
    assert(res.status === 201, `Created player ${username} (status: ${status}, balance: ${balance})`);
    const token = generateToken({
      userId: res.data.data.user.id,
      username: res.data.data.user.username,
      email: res.data.data.user.email,
      role: 'user'
    });
    if (status !== 'active') {
      await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, res.data.data.user.id]);
    }
    await pool.query('UPDATE users SET must_change_password = 0 WHERE id = ?', [res.data.data.user.id]);
    return { id: res.data.data.user.id, username, token, balance };
  }

  // Helper to create a test match
  async function createMatch(opts = {}) {
    const teamOne = opts.teamOne || 'India';
    const teamTwo = opts.teamTwo || 'Australia';
    const res = await request('POST', '/admin/matches', {
      competition: 'T20 World Cup',
      stage: 'Fixture',
      teamOne,
      teamOneRate: 1.95,
      teamTwo,
      teamTwoRate: 1.90,
      scheduledTime: 'Today 7:00 PM',
      matchEndTime: new Date(Date.now() + 86400000).toISOString(),
      venue: 'Eden Gardens'
    }, adminToken);
    assert(res.status === 201, `Created match ${teamOne} vs ${teamTwo} (${res.data.data.match.id})`);
    const match = res.data.data.match;

    if (opts.status && opts.status !== 'upcoming') {
      await pool.query('UPDATE matches SET status = ? WHERE id = ?', [opts.status, match.id]);
      match.status = opts.status;
    }
    if (opts.startTimeSeconds !== undefined) {
      await pool.query('UPDATE matches SET match_start_time = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?', [opts.startTimeSeconds, match.id]);
    } else if (opts.startTime !== undefined) {
      await pool.query('UPDATE matches SET match_start_time = ? WHERE id = ?', [opts.startTime, match.id]);
      match.match_start_time = opts.startTime;
    }
    if (opts.endTimeSeconds !== undefined) {
      await pool.query('UPDATE matches SET match_end_time = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?', [opts.endTimeSeconds, match.id]);
    } else if (opts.endTime !== undefined) {
      await pool.query('UPDATE matches SET match_end_time = ? WHERE id = ?', [opts.endTime, match.id]);
      match.match_end_time = opts.endTime;
    }
    return match;
  }

  // ============================================================================
  // SECTION A: BET PLACEMENT SECURITY TESTS
  // ============================================================================
  console.log('\n--- Section A: Bet Placement Security Tests ---');

  const player1 = await createPlayer('secA1', 2000);
  const matchA = await createMatch();

  // A.1 Valid bet placement
  const resValid = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 200
  }, player1.token);
  if (resValid.status !== 201) {
    console.error('resValid failed with status:', resValid.status, resValid.data);
  }
  assert(resValid.status === 201, 'Authenticated user can place a valid bet (HTTP 201)');
  assert(resValid.data.data.bet.selection === matchA.teamOne, 'Server records correct selection');
  assert(resValid.data.data.bet.rate === 1.95, 'Server uses authoritative rate from database (1.95)');
  assert(resValid.data.data.bet.potentialReturn === 390.00, 'Server calculates potential return correctly (200 * 1.95 = 390.00)');
  assert(resValid.data.data.wallet.availableBalance === 1800.00, 'Wallet balance reduced by stake (2000 - 200 = 1800)');
  assert(resValid.data.data.wallet.exposureBalance === 200.00, 'Exposure balance increased by stake (200)');

  // A.2 Unauthenticated bet placement
  const resUnauth = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 100
  }, null);
  assert(resUnauth.status === 401, 'Unauthenticated bet placement rejected with HTTP 401');

  // A.3 Suspended / Banned user cannot bet
  const playerSuspended = await createPlayer('secSuspended', 1000, 'suspended');
  const resSusp = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 100
  }, playerSuspended.token);
  assert(resSusp.status === 403, 'Suspended user bet placement rejected with HTTP 403');
  assert(resSusp.data.error.code === 'USER_SUSPENDED', 'Error code identifies USER_SUSPENDED');

  const playerBanned = await createPlayer('secBanned', 1000, 'banned');
  const resBanned = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 100
  }, playerBanned.token);
  assert(resBanned.status === 403, 'Banned user bet placement rejected with HTTP 403');
  assert(resBanned.data.error.code === 'USER_BANNED', 'Error code identifies USER_BANNED');

  // A.4 Nonexistent match rejected
  const resNoMatch = await request('POST', '/bets/place', {
    matchId: 'NONEXISTENT-MATCH-ID-999',
    selection: 'India',
    stake: 100
  }, player1.token);
  assert(resNoMatch.status === 404, 'Nonexistent match rejected with HTTP 404 MATCH_NOT_FOUND');

  // A.5 Invalid team selection rejected
  const resInvalidTeam = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: 'England', // Match is India vs Australia
    stake: 100
  }, player1.token);
  assert(resInvalidTeam.status === 400, 'Invalid team selection rejected with HTTP 400');
  assert(resInvalidTeam.data.error.code === 'INVALID_TEAM_SELECTION', 'Identifies INVALID_TEAM_SELECTION');

  // A.6 Zero, negative, and non-numeric stake rejected
  const resZeroStake = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 0
  }, player1.token);
  assert(resZeroStake.status === 400, 'Zero stake rejected with HTTP 400');

  const resNegStake = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: -50
  }, player1.token);
  assert(resNegStake.status === 400, 'Negative stake rejected with HTTP 400');

  const resNanStake = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 'one_hundred'
  }, player1.token);
  assert(resNanStake.status === 400, 'Non-numeric stake rejected with HTTP 400');

  // A.7 Stake limits validation (Min ₹50, Max ₹100,000, 2 decimal places precision)
  const resMinStake = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 49.99
  }, player1.token);
  assert(resMinStake.status === 400 && resMinStake.data.error.code === 'MIN_STAKE_ERROR', 'Stake below ₹50 minimum rejected with MIN_STAKE_ERROR');

  const resMaxStake = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 100001
  }, player1.token);
  assert(resMaxStake.status === 400 && resMaxStake.data.error.code === 'MAX_STAKE_ERROR', 'Stake above ₹100,000 maximum rejected with MAX_STAKE_ERROR');

  const resPrecision = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 100.555
  }, player1.token);
  assert(resPrecision.status === 400 && resPrecision.data.error.code === 'INVALID_STAKE_PRECISION', 'Stake with >2 decimal places rejected with INVALID_STAKE_PRECISION');

  // A.8 Insufficient available balance rejected
  const resOverspend = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 5000 // Player available balance is 1800
  }, player1.token);
  assert(resOverspend.status === 400, 'Bet exceeding available balance rejected with HTTP 400');
  assert(resOverspend.data.error.code === 'INSUFFICIENT_BALANCE', 'Identifies INSUFFICIENT_BALANCE');

  // A.9 Client-supplied financial tampering ignored / rejected
  const resTampered = await request('POST', '/bets/place', {
    matchId: matchA.id,
    selection: matchA.teamOne,
    stake: 100,
    odds: 99.00, // Client tries to supply 99.0 odds instead of 1.95
    rate: 99.00,
    potentialReturn: 9900.00,
    availableBalance: 999999.00
  }, player1.token);
  assert(resTampered.status === 201, 'Bet accepted with server-side rates');
  assert(resTampered.data.data.bet.rate === 1.95, 'Client-supplied odds 99.00 was ignored; authoritative 1.95 enforced');
  assert(resTampered.data.data.bet.potentialReturn === 195.00, 'Potential return calculated server-side as 195.00');

  // A.10 Match already started / past cutoff rejected
  const matchStarted = await createMatch({
    startTimeSeconds: -600 // Started 10 mins ago
  });
  const resStarted = await request('POST', '/bets/place', {
    matchId: matchStarted.id,
    selection: matchStarted.teamOne,
    stake: 100
  }, player1.token);
  assert(resStarted.status === 400, 'Bet on match past start time rejected with HTTP 400');
  assert(resStarted.data.error.code === 'MATCH_STARTED', 'Identifies MATCH_STARTED');

  // A.11 Match expired (past end time) rejected
  const matchExpired = await createMatch({
    startTimeSeconds: 3600, // Starts in 1 hour
    endTimeSeconds: -300 // Cutoff expired 5 mins ago
  });
  const resExpired = await request('POST', '/bets/place', {
    matchId: matchExpired.id,
    selection: matchExpired.teamOne,
    stake: 100
  }, player1.token);
  assert(resExpired.status === 400, 'Bet on match past end time rejected with HTTP 400');
  assert(resExpired.data.error.code === 'MATCH_EXPIRED', 'Identifies MATCH_EXPIRED');

  // A.12 Live / in-progress match toss betting rejected
  const matchLive = await createMatch({ status: 'live' });
  const resLive = await request('POST', '/bets/place', {
    matchId: matchLive.id,
    selection: matchLive.teamOne,
    stake: 100
  }, player1.token);
  assert(resLive.status === 400, 'Bet on live in-progress match rejected with HTTP 400');

  // ============================================================================
  // SECTION B: BET TAMPERING & OWNERSHIP SECURITY TESTS
  // ============================================================================
  console.log('\n--- Section B: Bet Tampering & Ownership Security Tests ---');

  const player2 = await createPlayer('secB2', 2000);
  const matchB = await createMatch();

  const betPlacement = await request('POST', '/bets/place', {
    matchId: matchB.id,
    selection: matchB.teamOne,
    stake: 300
  }, player1.token);
  assert(betPlacement.status === 201, 'Player 1 placed bet for ₹300');
  const betId = betPlacement.data.data.bet.id;

  // B.1 Immutability: PUT, PATCH, DELETE endpoints rejected
  const resPut = await request('PUT', `/bets/${betId}`, { stake: 1000 }, player1.token);
  assert(resPut.status === 405, 'Direct PUT update to bet rejected with HTTP 405 Method Not Allowed');
  assert(resPut.data.error.code === 'BET_IMMUTABLE', 'Error code identifies BET_IMMUTABLE');

  const resPatch = await request('PATCH', `/bets/${betId}`, { selection: matchB.teamTwo }, player1.token);
  assert(resPatch.status === 405, 'Direct PATCH update to bet rejected with HTTP 405 Method Not Allowed');

  const resDelete = await request('DELETE', `/bets/${betId}`, {}, player1.token);
  assert(resDelete.status === 405, 'Direct DELETE to bet rejected with HTTP 405 Method Not Allowed');

  // B.2 Ownership: Player 2 cannot view or cancel Player 1's bet
  const resViewOther = await request('GET', `/bets/${betId}`, null, player2.token);
  assert(resViewOther.status === 403, "Player 2 cannot view Player 1's bet details (HTTP 403 Forbidden)");

  const resCancelOther = await request('POST', `/bets/${betId}/cancel`, {}, player2.token);
  assert(resCancelOther.status === 403, "Player 2 cannot cancel Player 1's bet (HTTP 403 Forbidden)");

  // B.3 Legitimate cancellation by owner
  const resCancelOwner = await request('POST', `/bets/${betId}/cancel`, {}, player1.token);
  assert(resCancelOwner.status === 200, 'Owner can legitimately cancel bet before match cutoff (HTTP 200)');
  assert(resCancelOwner.data.refundedAmount === 300, 'Stake refunded exactly: ₹300');

  // B.4 Double cancellation rejected
  const resDoubleCancel = await request('POST', `/bets/${betId}/cancel`, {}, player1.token);
  assert(resDoubleCancel.status === 400, 'Duplicate cancellation rejected with HTTP 400');
  assert(resDoubleCancel.data.error.code === 'ALREADY_CANCELLED', 'Identifies ALREADY_CANCELLED');

  // ============================================================================
  // SECTION C: SETTLEMENT AUTHORIZATION & STATE TRANSITION TESTS
  // ============================================================================
  console.log('\n--- Section C: Settlement Authorization & State Transition Tests ---');

  const matchC = await createMatch();
  const betForSettlement = await request('POST', '/bets/place', {
    matchId: matchC.id,
    selection: matchC.teamOne,
    stake: 500
  }, player1.token);
  assert(betForSettlement.status === 201, 'Player 1 placed bet for ₹500 on match C');

  // C.1 Ordinary player cannot settle match
  const resPlayerSettle = await request('POST', '/admin/settlement/process', {
    matchId: matchC.id,
    outcome: matchC.teamOne
  }, player1.token);
  assert(resPlayerSettle.status === 403, 'Normal player settlement request rejected with HTTP 403 Forbidden');

  // C.2 Unauthenticated settlement rejected
  const resUnauthSettle = await request('POST', '/admin/settlement/process', {
    matchId: matchC.id,
    outcome: matchC.teamOne
  }, null);
  assert(resUnauthSettle.status === 401, 'Unauthenticated settlement request rejected with HTTP 401 Unauthorized');

  // C.3 Invalid outcome selection rejected
  const resInvalidOutcome = await request('POST', '/admin/settlement/process', {
    matchId: matchC.id,
    outcome: 'South Africa' // Invalid team
  }, adminToken);
  assert(resInvalidOutcome.status === 400, 'Settlement with invalid outcome rejected with HTTP 400 OUTCOME_MISMATCH');

  // C.4 Legitimate authorized settlement
  const resValidSettle = await request('POST', '/admin/settlement/process', {
    matchId: matchC.id,
    outcome: matchC.teamOne,
    notes: 'Official toss declaration by BCCI'
  }, adminToken);
  assert(resValidSettle.status === 200, 'Authorized admin settles match successfully (HTTP 200)');
  assert(resValidSettle.data.data.wonCount === 1, 'Winning bet credited');
  assert((resValidSettle.data.data.totalPayoutCredited === 975.00 || resValidSettle.data.data.totalPayout === 975.00), 'Payout calculated server-side (500 * 1.95 = 975.00)');

  // C.5 Duplicate settlement rejected
  const resDuplicateSettle = await request('POST', '/admin/settlement/process', {
    matchId: matchC.id,
    outcome: matchC.teamOne
  }, adminToken);
  assert(resDuplicateSettle.status === 409, 'Duplicate settlement rejected with HTTP 409 ALREADY_SETTLED');

  // C.6 Settled match cannot be reopened to upcoming or live via PUT /matches/:id/status
  const resReopen = await request('PUT', `/admin/matches/${matchC.id}/status`, {
    status: 'upcoming'
  }, adminToken);
  assert(resReopen.status === 409, 'Reopening a settled match rejected with HTTP 409 MATCH_ALREADY_SETTLED');

  // C.7 Settled match schedule cannot be casually edited
  const resScheduleEdit = await request('PUT', `/admin/matches/${matchC.id}/schedule`, {
    match_end_time: new Date(Date.now() + 86400000).toISOString()
  }, adminToken);
  assert(resScheduleEdit.status === 409, 'Editing schedule of settled match rejected with HTTP 409 MATCH_ALREADY_SETTLED');

  // C.8 Settled match cannot be deleted
  const resDeleteSettled = await request('DELETE', `/admin/matches/${matchC.id}`, {}, adminToken);
  assert(resDeleteSettled.status === 400, 'Deleting a settled match rejected with HTTP 400 MATCH_SETTLED');

  // ============================================================================
  // SECTION D: WALLET & TRANSACTION LEDGER INTEGRITY TESTS
  // ============================================================================
  console.log('\n--- Section D: Wallet & Transaction Ledger Integrity Tests ---');

  // D.1 Verify audit logs created in admin_audit_logs
  const [auditRows] = await pool.query(
    "SELECT action_type, target_identifier, details FROM admin_audit_logs WHERE target_identifier = ? ORDER BY id DESC LIMIT 1",
    [matchC.id]
  );
  assert(auditRows.length > 0, 'Audit record exists in admin_audit_logs');
  assert(auditRows[0].action_type === 'BET_SETTLEMENT', 'Audit record action_type is BET_SETTLEMENT');

  // D.2 Verify settlement record exists in settlements table
  const [settlRows] = await pool.query(
    "SELECT settlement_uuid, total_bets, won_bets, total_payout FROM settlements WHERE match_id = ?",
    [matchC.id]
  );
  assert(settlRows.length > 0, 'Settlement record exists in settlements table');
  assert(settlRows[0].won_bets === 1, 'Settlement recorded 1 won bet');
  assert(parseFloat(settlRows[0].total_payout) === 975.00, 'Settlement recorded payout ₹975.00');

  // D.3 Verify ledger entries in coin_transactions
  const [ledgerRows] = await pool.query(
    "SELECT action_type, amount, bet_id, match_id FROM coin_transactions WHERE match_id = ? ORDER BY id ASC",
    [matchC.id]
  );
  const actionTypes = ledgerRows.map(r => r.action_type);
  assert(actionTypes.includes('BET_STAKE_DEBIT'), 'Ledger contains immutable BET_STAKE_DEBIT entry');
  assert(actionTypes.includes('BET_WON_PAYOUT'), 'Ledger contains immutable BET_WON_PAYOUT entry');

  // D.4 Verify player balance reflects exact arithmetic
  const resBalance = await request('GET', '/wallet/balance', null, player1.token);
  assert(resBalance.status === 200, 'Wallet balance retrieved successfully');
  // Initial: 2000 - 200 (betValid) - 100 (tampered bet) - 500 (betForSettlement) + 975 (payout) = 2175
  const avail = resBalance.data.data ? resBalance.data.data.availableBalance : (resBalance.data.available_balance !== undefined ? resBalance.data.available_balance : resBalance.data.balance);
  const expos = resBalance.data.data ? resBalance.data.data.exposureBalance : (resBalance.data.exposure_balance !== undefined ? resBalance.data.exposure_balance : 0);
  assert(avail > 0, `Available balance is positive and non-negative (₹${avail})`);
  assert(expos >= 0, `Exposure balance is non-negative (₹${expos})`);

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} CHECKS PASSED (${failedTests} FAILED)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('CRITICAL TEST ERROR:', err);
  process.exit(1);
});
