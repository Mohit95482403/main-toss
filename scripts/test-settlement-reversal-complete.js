/**
 * Comprehensive Automated Verification Suite for Match Result Reversal & Safe Resettlement
 * 
 * Tests Covered:
 * - Test A: Result correction & resettlement workflow (Team 1 won -> Reversed -> Team 2 won)
 * - Test B: Balance shortfall safety check (blocks reversal when winner spent funds without sufficient balance)
 * - Test C: Cancelled bets isolation (cancelled bets remain cancelled through reversal and resettlement)
 * - Test D: Duplicate request and idempotency protection
 * - Test E: Administrative authorization and validation rules
 * - Test F: Versioned settlement history and audit trail traceability
 * - Test G: Passbook ledger integration and balance reconciliation
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000/api';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      url,
      { method, headers },
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
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('STARTING MATCH RESULT REVERSAL & RESETTLEMENT VERIFICATION SUITE');
  console.log('================================================================');

  const timestamp = Date.now();

  // ---------------------------------------------------------------------------
  // STEP 1: AUTHENTICATE ADMIN
  // ---------------------------------------------------------------------------
  console.log('\n[SETUP] Authenticating Admin...');
  let adminToken;
  try {
    const adminLoginRes = await request('POST', '/auth/login', {
      identifier: 'admin',
      password: process.env.ADMIN_DEFAULT_PASSWORD || 'Ironman@Admin2026'
    });
    if (adminLoginRes.status === 200 && adminLoginRes.data?.data?.token) {
      adminToken = adminLoginRes.data.data.token;
      assert(true, 'Admin authenticated via /auth/login');
    } else {
      throw new Error('Fallback to crypto generateToken');
    }
  } catch (e) {
    const { getPool } = require('../backend/src/config/db');
    const pool = getPool();
    const { generateToken } = require('../backend/src/utils/crypto');
    const [admins] = await pool.execute("SELECT id, username, email, role FROM users WHERE role IN ('super_admin', 'admin') LIMIT 1");
    if (admins.length > 0) {
      adminToken = generateToken({
        userId: admins[0].id,
        username: admins[0].username,
        email: admins[0].email,
        role: admins[0].role
      });
      assert(true, `Admin authenticated via cryptographic token for user #${admins[0].id}`);
    } else {
      throw new Error('No admin user found in database');
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 2: CREATE TEST PLAYERS
  // ---------------------------------------------------------------------------
  console.log('\n[SETUP] Creating Test Players...');
  const p1Username = `rev_p1_${timestamp}`;
  const p2Username = `rev_p2_${timestamp}`;
  const p3Username = `rev_p3_${timestamp}`;

  const createP1Res = await request('POST', '/admin/users/create', {
    displayName: 'Player One Reversal',
    username: p1Username,
    password: 'Password123!',
    confirmPassword: 'Password123!',
    initialCoinBalance: 2000,
    accountStatus: 'active'
  }, adminToken);
  assert(createP1Res.status === 201, 'Player 1 created with 2000 coins');

  const createP2Res = await request('POST', '/admin/users/create', {
    displayName: 'Player Two Reversal',
    username: p2Username,
    password: 'Password123!',
    confirmPassword: 'Password123!',
    initialCoinBalance: 2000,
    accountStatus: 'active'
  }, adminToken);
  assert(createP2Res.status === 201, 'Player 2 created with 2000 coins');

  const createP3Res = await request('POST', '/admin/users/create', {
    displayName: 'Player Three Shortfall',
    username: p3Username,
    password: 'Password123!',
    confirmPassword: 'Password123!',
    initialCoinBalance: 1000,
    accountStatus: 'active'
  }, adminToken);
  assert(createP3Res.status === 201, 'Player 3 created with 1000 coins');

  // Authenticate Player tokens
  const { getPool } = require('../backend/src/config/db');
  const pool = getPool();
  const { generateToken } = require('../backend/src/utils/crypto');

  const [[user1]] = await pool.query('SELECT id, username, email, role FROM users WHERE username = ?', [p1Username]);
  const [[user2]] = await pool.query('SELECT id, username, email, role FROM users WHERE username = ?', [p2Username]);
  const [[user3]] = await pool.query('SELECT id, username, email, role FROM users WHERE username = ?', [p3Username]);

  const p1Token = generateToken({ userId: user1.id, username: user1.username, email: user1.email, role: user1.role });
  const p2Token = generateToken({ userId: user2.id, username: user2.username, email: user2.email, role: user2.role });
  const p3Token = generateToken({ userId: user3.id, username: user3.username, email: user3.email, role: user3.role });

  // ---------------------------------------------------------------------------
  // TEST A: CORRECTING A WINNING RESULT & SAFE RESETTLEMENT
  // ---------------------------------------------------------------------------
  console.log('\n[TEST A] Correcting a Winning Result: Full Reversal & Resettlement Workflow');
  
  // A1. Create Match fixture
  const matchAEndTime = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
  const matchARes = await request('POST', '/admin/matches', {
    competition: 'IPL 2026',
    stage: 'Final',
    team_one: 'CSK',
    team_one_abbr: 'CSK',
    team_one_rate: 2.0,
    team_two: 'RCB',
    team_two_abbr: 'RCB',
    team_two_rate: 2.0,
    scheduled_time: 'Tonight, 07:30 PM',
    match_end_time: matchAEndTime,
    venue: 'Wankhede',
    status: 'upcoming'
  }, adminToken);
  assert(matchARes.status === 201, 'Test Match A created');
  const matchAId = matchARes.data.data.match.id;

  // A2. Player 1 bets 500 on CSK (Rate 2.0 -> Return 1000)
  const bet1Res = await request('POST', '/bets', {
    matchId: matchAId,
    selection: 'CSK',
    stake: 500
  }, p1Token);
  assert(bet1Res.status === 201, 'Player 1 placed 500 on CSK');
  const bet1Id = bet1Res.data.data.bet.id;

  // A3. Player 2 bets 400 on RCB (Rate 2.0 -> Return 800)
  const bet2Res = await request('POST', '/bets', {
    matchId: matchAId,
    selection: 'RCB',
    stake: 400
  }, p2Token);
  assert(bet2Res.status === 201, 'Player 2 placed 400 on RCB');
  const bet2Id = bet2Res.data.data.bet.id;

  // Check balances after bet placements: P1 = 1500 (2000 - 500), P2 = 1600 (2000 - 400)
  const balP1AfterBet = await request('GET', '/wallet/balance', null, p1Token);
  assert(balP1AfterBet.data.data.availableBalance === 1500, 'P1 balance deducted by 500 stake to 1500');

  // A4. Admin settles Match A with initial result: CSK won
  const settleARes = await request('POST', '/admin/settlement/process', {
    matchId: matchAId,
    declaredOutcome: 'CSK',
    notes: 'Initial declaration: CSK won toss'
  }, adminToken);
  assert(settleARes.status === 200, 'Match A settled with CSK as winner (Version 1)');
  assert(settleARes.data.data.wonCount === 1, '1 bet won (Bet 1)');
  assert(settleARes.data.data.lostCount === 1, '1 bet lost (Bet 2)');
  assert(settleARes.data.data.totalPayoutCredited === 1000, '1000 payout credited to Bet 1');

  // P1 balance should now be 1500 + 1000 = 2500
  const balP1AfterWin = await request('GET', '/wallet/balance', null, p1Token);
  assert(balP1AfterWin.data.data.availableBalance === 2500, 'P1 balance increased by 1000 to 2500');

  // A5. Admin reviews financial impact preview for correction to RCB
  console.log('  Submitting preview correction request to RCB...');
  const previewRes = await request('POST', `/admin/matches/${matchAId}/settlement/preview-correction`, {
    proposedOutcome: 'RCB',
    reason: 'Official referee confirmed RCB won the toss, not CSK'
  }, adminToken);
  assert(previewRes.status === 200, 'Preview calculation returned status 200');
  assert(previewRes.data.data.original.declaredOutcome === 'CSK', 'Preview reflects original outcome CSK');
  assert(previewRes.data.data.original.originalTotalPayout === 1000, 'Preview reflects original payout of 1000');
  assert(previewRes.data.data.projected.correctedOutcome === 'RCB', 'Preview reflects corrected outcome RCB');
  assert(previewRes.data.data.projected.projectedWonBets === 1, 'Projected won count is 1 (Bet 2)');
  assert(previewRes.data.data.projected.projectedPayout === 800, 'Projected payout is 800 for Bet 2');
  assert(previewRes.data.data.balanceSafety.safe === true, 'Balance safety check confirmed SAFE');

  // A6. Admin confirms settlement reversal
  console.log('  Executing settlement reversal...');
  const reverseRes = await request('POST', `/admin/matches/${matchAId}/settlement/reverse`, {
    reason: 'Official referee confirmed RCB won the toss, not CSK'
  }, adminToken);
  assert(reverseRes.status === 200, 'Settlement reversal returned status 200');
  assert(reverseRes.data.data.settlementStatus === 'reversed', 'Match settlement status moved to reversed');
  const reversedAmount = reverseRes.data.data.reversedSettlement?.reversalAmount ?? reverseRes.data.data.payoutReversedTotal;
  assert(reversedAmount === 1000, 'Compensating reversal debited exactly 1000');

  // Verify P1 balance restored: 2500 - 1000 = 1500 (stake 500 remains deducted for pending match)
  const balP1AfterRev = await request('GET', '/wallet/balance', null, p1Token);
  assert(balP1AfterRev.data.data.availableBalance === 1500, 'P1 balance restored to 1500 after reversal');

  // Verify Bet 1 status is reversed / pending
  const [b1Rows] = await pool.query('SELECT status, settlement_status, payout FROM bets WHERE id = ?', [bet1Id]);
  assert(b1Rows[0].settlement_status === 'reversed', 'Bet 1 settlement_status is reversed');
  assert(parseFloat(b1Rows[0].payout) === 0, 'Bet 1 payout set to 0.00');

  // Verify Settlement 1 is marked reversed in settlements table
  const [s1Rows] = await pool.query('SELECT status, reversal_reason, reversal_amount FROM settlements WHERE match_id = ? AND version = 1', [matchAId]);
  assert(s1Rows[0].status === 'reversed', 'Settlement v1 marked as reversed');
  assert(parseFloat(s1Rows[0].reversal_amount) === 1000, 'Reversal amount logged as 1000');

  // A7. Resettle Match A with corrected outcome: RCB
  console.log('  Resettling Match A with corrected result RCB...');
  const resettleRes = await request('POST', `/admin/matches/${matchAId}/settlement/resettle`, {
    correctedOutcome: 'RCB',
    reason: 'Resettled with official winner RCB'
  }, adminToken);
  assert(resettleRes.status === 200, 'Resettlement returned status 200');
  assert(resettleRes.data.data.version === 2, 'New settlement version is 2');
  assert(resettleRes.data.data.settlementStatus === 'resettled', 'Match settlement status is resettled');
  assert(resettleRes.data.data.wonCount === 1, '1 bet won under corrected result (Bet 2)');
  assert(resettleRes.data.data.lostCount === 1, '1 bet lost under corrected result (Bet 1)');
  assert(resettleRes.data.data.totalPayoutCredited === 800, '800 payout credited to Bet 2');

  // Verify final player balances:
  // P1 lost: balance remains 1500 (2000 initial - 500 stake lost)
  // P2 won: 1600 + 800 = 2400 (2000 initial - 400 stake + 800 payout)
  const balP1Final = await request('GET', '/wallet/balance', null, p1Token);
  const balP2Final = await request('GET', '/wallet/balance', null, p2Token);
  assert(balP1Final.data.data.availableBalance === 1500, 'P1 final balance is exactly 1500 (lost)');
  assert(balP2Final.data.data.availableBalance === 2400, 'P2 final balance is exactly 2400 (won)');

  // Verify Passbook contains SETTLEMENT_REVERSAL_DEBIT for P1
  const p1Passbook = await request('GET', '/passbook/transactions', null, p1Token);
  const revTxn = p1Passbook.data.data.transactions.find(t => t.actionType === 'SETTLEMENT_REVERSAL_DEBIT');
  assert(Boolean(revTxn), 'Found SETTLEMENT_REVERSAL_DEBIT in Player 1 passbook');
  assert(revTxn.amount === 1000, 'Reversal passbook debit amount is 1000');

  // Verify Passbook contains BET_RESETTLEMENT_PAYOUT for P2
  const p2Passbook = await request('GET', '/passbook/transactions', null, p2Token);
  const resettleTxn = p2Passbook.data.data.transactions.find(t => t.actionType === 'BET_RESETTLEMENT_PAYOUT');
  assert(Boolean(resettleTxn), 'Found BET_RESETTLEMENT_PAYOUT in Player 2 passbook');
  assert(resettleTxn.amount === 800, 'Resettlement payout is 800');

  // ---------------------------------------------------------------------------
  // TEST B: BALANCE SHORTFALL REJECTION (Requirement 7)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST B] Balance Changes After Settlement & Shortfall Rejection (Requirement 7)');
  
  // B1. Create Match B
  const matchBRes = await request('POST', '/admin/matches', {
    competition: 'IPL 2026',
    stage: 'League',
    team_one: 'MI',
    team_one_abbr: 'MI',
    team_one_rate: 2.0,
    team_two: 'KKR',
    team_two_abbr: 'KKR',
    team_two_rate: 2.0,
    scheduled_time: 'Tomorrow, 07:30 PM',
    match_end_time: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    venue: 'Eden Gardens',
    status: 'upcoming'
  }, adminToken);
  const matchBId = matchBRes.data.data.match.id;

  // B2. Player 3 bets 500 on MI (from 1000 initial -> 500 remaining)
  const bet3Res = await request('POST', '/bets', {
    matchId: matchBId,
    selection: 'MI',
    stake: 500
  }, p3Token);
  assert(bet3Res.status === 201, 'Player 3 placed 500 on MI');

  // B3. Settle Match B with MI as winner -> Player 3 receives 1000 payout -> balance 1500
  await request('POST', '/admin/settlement/process', {
    matchId: matchBId,
    declaredOutcome: 'MI',
    notes: 'MI declared winner'
  }, adminToken);

  const balP3AfterWin = await request('GET', '/wallet/balance', null, p3Token);
  assert(balP3AfterWin.data.data.availableBalance === 1500, 'Player 3 balance is 1500 after win');

  // B4. Simulate subsequent legitimate transaction: Admin deducts 1200 coins (e.g. withdrawal or unrelated loss)
  // Remaining available balance is 1500 - 1200 = 300 coins
  await request('POST', '/admin/coins/adjust', {
    userId: user3.id,
    actionType: 'ADMIN_DEBIT',
    amount: 1200,
    reason: 'Player withdrawal executed'
  }, adminToken);

  const balP3AfterWithdraw = await request('GET', '/wallet/balance', null, p3Token);
  assert(balP3AfterWithdraw.data.data.availableBalance === 300, 'Player 3 balance reduced to 300 (spent winnings)');

  // B5. Admin discovers error and attempts to reverse settlement (needs to debit 1000, but P3 only has 300)
  // Preview must flag balance shortfall
  const previewShortfallRes = await request('POST', `/admin/matches/${matchBId}/settlement/preview-correction`, {
    proposedOutcome: 'KKR',
    reason: 'Result error: KKR actually won'
  }, adminToken);
  assert(previewShortfallRes.status === 200, 'Preview computed successfully');
  assert(previewShortfallRes.data.data.balanceSafety.safe === false, 'Balance safety correctly flagged as UNSAFE');
  assert(previewShortfallRes.data.data.balanceSafety.shortfalls.length === 1, 'Exactly 1 account shortfall reported');
  assert(previewShortfallRes.data.data.balanceSafety.shortfalls[0].shortfall === 700, 'Shortfall amount is exactly 700 (1000 - 300)');

  // B6. Attempting to execute reversal must be rejected with 422 to prevent negative balance
  const rejectReversalRes = await request('POST', `/admin/matches/${matchBId}/settlement/reverse`, {
    reason: 'Result error: KKR actually won'
  }, adminToken);
  assert(rejectReversalRes.status === 422, 'Reversal safely rejected with HTTP 422');
  assert(rejectReversalRes.data.error.code === 'INSUFFICIENT_BALANCE_FOR_REVERSAL', 'Error code is INSUFFICIENT_BALANCE_FOR_REVERSAL');

  // Verify Player 3 balance was untouched at 300 and no negative balance was created
  const balP3AfterReject = await request('GET', '/wallet/balance', null, p3Token);
  assert(balP3AfterReject.data.data.availableBalance === 300, 'Player 3 balance strictly unchanged at 300');

  // ---------------------------------------------------------------------------
  // TEST C: CANCELLED BETS ISOLATION (Requirement 10)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST C] Cancelled Bets Isolation (Requirement 10)');

  // C1. Create Match C
  const matchCRes = await request('POST', '/admin/matches', {
    competition: 'IPL 2026',
    stage: 'League',
    team_one: 'SRH',
    team_one_abbr: 'SRH',
    team_one_rate: 2.0,
    team_two: 'DC',
    team_two_abbr: 'DC',
    team_two_rate: 2.0,
    scheduled_time: 'In 3 Hours',
    match_end_time: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
    venue: 'Hyderabad',
    status: 'upcoming'
  }, adminToken);
  const matchCId = matchCRes.data.data.match.id;

  // C2. Player 1 places Bet A (200 on SRH) and cancels it
  const betARes = await request('POST', '/bets', { matchId: matchCId, selection: 'SRH', stake: 200 }, p1Token);
  const betAId = betARes.data.data.bet.id;
  const cancelARes = await request('POST', `/bets/${betAId}/cancel`, {}, p1Token);
  assert(cancelARes.status === 200, 'Bet A cancelled and refunded prior to match');

  // Player 1 places Bet B (300 on SRH) and keeps it active
  const betBRes = await request('POST', '/bets', { matchId: matchCId, selection: 'SRH', stake: 300 }, p1Token);
  const betBId = betBRes.data.data.bet.id;

  // C3. Settle match (SRH won)
  const settleCRes = await request('POST', '/admin/settlement/process', {
    matchId: matchCId,
    declaredOutcome: 'SRH',
    notes: 'Initial settlement: SRH'
  }, adminToken);
  assert(settleCRes.data.data.totalBetsSettled === 1, 'Only Bet B was settled (Bet A was excluded as cancelled)');

  // C4. Reverse settlement
  await request('POST', `/admin/matches/${matchCId}/settlement/reverse`, {
    reason: 'Correction needed: DC won'
  }, adminToken);

  // C5. Resettle with DC winning
  await request('POST', `/admin/matches/${matchCId}/settlement/resettle`, {
    correctedOutcome: 'DC',
    reason: 'Resettled with DC'
  }, adminToken);

  // C6. Verify Bet A remained cancelled throughout, received no extra refund, and was not resettled
  const [betARows] = await pool.query('SELECT status, settlement_status, refund_amount, payout FROM bets WHERE id = ?', [betAId]);
  assert(betARows[0].status === 'cancelled', 'Bet A status is still cancelled');
  assert(betARows[0].settlement_status === 'cancelled', 'Bet A settlement_status is still cancelled');
  assert(parseFloat(betARows[0].refund_amount) === 200, 'Bet A refund amount is exactly 200');
  assert(parseFloat(betARows[0].payout) === 0, 'Bet A received 0 payout');

  // ---------------------------------------------------------------------------
  // TEST D: DUPLICATE REQUESTS & CONCURRENCY IDEMPOTENCY (Requirement 14)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST D] Duplicate Requests & Idempotency Protection (Requirement 14)');

  // D1. Reverse Match C
  const rev1 = await request('POST', `/admin/matches/${matchCId}/settlement/reverse`, {
    reason: 'First reversal for Match C'
  }, adminToken);
  assert(rev1.status === 200, 'First reversal for Match C succeeded');

  // D2. Immediate duplicate reversal request on already reversed match
  const rev2 = await request('POST', `/admin/matches/${matchCId}/settlement/reverse`, {
    reason: 'Duplicate reversal for Match C'
  }, adminToken);
  assert(rev2.status === 409, 'Duplicate reversal rejected with 409 Conflict');
  assert(rev2.data.error.code === 'ALREADY_REVERSED', 'Error code is ALREADY_REVERSED');

  // D3. Resettle Match C
  const resettle1 = await request('POST', `/admin/matches/${matchCId}/settlement/resettle`, {
    correctedOutcome: 'SRH',
    reason: 'Resettle Match C with SRH'
  }, adminToken);
  assert(resettle1.status === 200, 'Resettlement for Match C succeeded');

  // D4. Immediate duplicate resettlement request without reversing first
  const resettle2 = await request('POST', `/admin/matches/${matchCId}/settlement/resettle`, {
    correctedOutcome: 'SRH',
    reason: 'Duplicate resettlement attempt'
  }, adminToken);
  assert(resettle2.status === 409, 'Duplicate resettlement rejected with 409 Conflict');
  assert(resettle2.data.error.code === 'MUST_REVERSE_FIRST', 'Error code is MUST_REVERSE_FIRST');

  // ---------------------------------------------------------------------------
  // TEST E: AUTHORIZATION & VALIDATION (Requirement 13)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST E] Authorization & Validation Security Checks (Requirement 13)');

  // E1. Ordinary player attempts reversal -> 403 Forbidden
  const forbiddenRes = await request('POST', `/admin/matches/${matchAId}/settlement/reverse`, {
    reason: 'Unauthorized user reversal'
  }, p1Token);
  assert(forbiddenRes.status === 403, 'Player reversal attempt rejected with 403 Forbidden');

  // E2. Missing correction reason -> 400 Validation Error
  const missingReasonRes = await request('POST', `/admin/matches/${matchAId}/settlement/preview-correction`, {
    proposedOutcome: 'CSK',
    reason: ''
  }, adminToken);
  assert(missingReasonRes.status === 400, 'Missing correction reason rejected with 400 Validation Error');

  // E3. Nonexistent match ID -> 404
  const notFoundRes = await request('POST', `/admin/matches/NON_EXISTENT_MATCH_9999/settlement/reverse`, {
    reason: 'Test reason'
  }, adminToken);
  assert(notFoundRes.status === 404, 'Nonexistent match reversal rejected with 404');

  // ---------------------------------------------------------------------------
  // TEST F: AUDIT TRAIL & VERSION HISTORY (Requirement 11)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST F] Settlement Version History & Traceability (Requirement 11)');

  const historyRes = await request('GET', `/admin/matches/${matchAId}/settlement/history`, null, adminToken);
  assert(historyRes.status === 200, 'History retrieved successfully');
  const settlements = historyRes.data.data.settlements;
  assert(settlements.length === 2, 'Exactly 2 settlement versions found for Match A');

  // Version 1 check
  const v1 = settlements.find(s => s.version === 1);
  assert(v1.status === 'reversed', 'Version 1 is marked reversed');
  assert(v1.declaredOutcome === 'CSK', 'Version 1 declaredOutcome was CSK');
  assert(v1.reversalReason === 'Official referee confirmed RCB won the toss, not CSK', 'Version 1 logs reversal reason');
  assert(v1.reversalAmount === 1000, 'Version 1 logs reversal amount 1000');
  assert(Boolean(v1.reversedAt), 'Version 1 logs reversedAt timestamp');

  // Version 2 check
  const v2 = settlements.find(s => s.version === 2);
  assert(v2.status === 'current', 'Version 2 is marked current');
  assert(v2.isCurrent === true, 'Version 2 isCurrent flag is true');
  assert(v2.declaredOutcome === 'RCB', 'Version 2 declaredOutcome is RCB');
  assert(v2.totalPayout === 800, 'Version 2 total payout is 800');

  // ---------------------------------------------------------------------------
  // TEST G: REGRESSION TESTING
  // ---------------------------------------------------------------------------
  console.log('\n[TEST G] Regression Testing for Core Operations');

  // G1. Match listing returns settlement_version and settlement_status
  const matchesRes = await request('GET', '/admin/matches', null, adminToken);
  const foundMatchA = matchesRes.data.data.matches.find(m => m.id === matchAId);
  assert(Boolean(foundMatchA), 'Match A found in matches API');
  assert(foundMatchA.settlement_status === 'resettled', 'Match A settlement_status is resettled');
  assert(foundMatchA.settlement_version === 2, 'Match A settlement_version is 2');

  // G2. Admin user management works cleanly
  const usersRes = await request('GET', '/admin/users', null, adminToken);
  assert(usersRes.status === 200, 'Admin users directory online');

  // G3. Admin system health works
  const healthRes = await request('GET', '/admin/system/status', null, adminToken);
  assert(healthRes.status === 200 && healthRes.data.data.database.status === 'online', 'System health probe online');

  console.log('\n================================================================');
  console.log('ALL SETTLEMENT REVERSAL & RESETTLEMENT TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
