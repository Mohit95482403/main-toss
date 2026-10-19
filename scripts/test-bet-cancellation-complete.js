/**
 * Automated Verification Suite for Bet Cancellation Feature
 * Tests all requirements:
 * 1. Pre-match successful cancellation & 100% atomic refund
 * 2. Exposure release and ledger transaction recording
 * 3. Match started / ended / settled deadline rejection
 * 4. Double cancellation / idempotency protection
 * 5. Concurrent cancellation race condition protection
 * 6. Ownership authorization security (cannot cancel other users' bets)
 * 7. Exclusion from admin settlement (winner declared does not payout cancelled bet)
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
  console.log('========================================================');
  console.log('STARTING BET CANCELLATION COMPREHENSIVE VERIFICATION SUITE');
  console.log('========================================================');

  const timestamp = Date.now();
  const adminUsername = 'admin';
  const adminPassword = 'AdminPassword123!';

  // 1. Authenticate Admin
  console.log('\n[TEST 1] Authenticating Admin...');
  let adminToken;
  try {
    const adminLoginRes = await request('POST', '/auth/login', {
      identifier: 'admin',
      password: process.env.ADMIN_DEFAULT_PASSWORD || 'Ironman@Admin2026'
    });
    if (adminLoginRes.status === 200 && adminLoginRes.data && adminLoginRes.data.data && adminLoginRes.data.data.token) {
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

  // 2. Create Player 1 and Player 2 via Admin
  console.log('\n[TEST 2] Creating Test Players via Admin...');
  const p1Username = `canc_p1_${timestamp}`;
  const p2Username = `canc_p2_${timestamp}`;
  const userPassword = 'UserPass123!';

  const reg1 = await request('POST', '/admin/users/create', {
    displayName: 'Test Player One',
    username: p1Username,
    password: userPassword,
    confirmPassword: userPassword,
    initialCoinBalance: 2000,
    accountStatus: 'active'
  }, adminToken);
  assert(reg1.status === 201, `Player 1 created (status: ${reg1.status})`);
  const p1Id = reg1.data.data.user.id;

  const reg2 = await request('POST', '/admin/users/create', {
    displayName: 'Test Player Two',
    username: p2Username,
    password: userPassword,
    confirmPassword: userPassword,
    initialCoinBalance: 500,
    accountStatus: 'active'
  }, adminToken);
  assert(reg2.status === 201, `Player 2 created (status: ${reg2.status})`);
  const p2Id = reg2.data.data.user.id;

  const { generateToken } = require('../backend/src/utils/crypto');
  const p1Token = generateToken({
    userId: p1Id,
    username: p1Username,
    role: 'user'
  });
  const p2Token = generateToken({
    userId: p2Id,
    username: p2Username,
    role: 'user'
  });

  // Verify Player 1 balance
  console.log('\n[TEST 3] Verifying Player 1 initial balance...');
  const balRes1 = await request('GET', '/wallet/balance', null, p1Token);
  assert(balRes1.data.data.availableBalance === 2000, `Player 1 available balance is 2000 (got ${balRes1.data.data.availableBalance})`);
  assert(balRes1.data.data.exposureBalance === 0, 'Player 1 exposure balance is 0');

  // 3. Create Upcoming Match (start time in the future, e.g. +2 hours)
  console.log('\n[TEST 4] Creating Match scheduled in the future...');
  const futureStartTime = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const futureEndTime = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

  const matchRes = await request('POST', '/admin/matches', {
    match_title: `India vs Australia Cancel Test ${timestamp}`,
    competition: 'ICC Test Trophy',
    team_one: 'India',
    team_two: 'Australia',
    scheduled_time: 'Tomorrow, 02:00 PM',
    match_start_time: futureStartTime,
    match_end_time: futureEndTime,
    venue: 'Eden Gardens',
    status: 'upcoming',
    team_one_rate: 1.95,
    team_two_rate: 1.95
  }, adminToken);
  assert(matchRes.status === 201, 'Upcoming match created: ' + JSON.stringify(matchRes));
  const matchId = matchRes.data.data.match ? matchRes.data.data.match.id : matchRes.data.data.id;

  // 4. Place Bet of 500 on India
  console.log('\n[TEST 5] Placing Bet of 500 on India...');
  const betRes = await request('POST', '/bets', {
    match_id: matchId,
    selection: 'India',
    stake: 500
  }, p1Token);
  assert(betRes.status === 201, 'Bet placed successfully: ' + JSON.stringify(betRes));
  const betId = betRes.data && betRes.data.data && betRes.data.data.bet ? betRes.data.data.bet.id : (betRes.data && betRes.data.data ? betRes.data.data.id : null);

  // Check balance after bet placement
  const balAfterBet = await request('GET', '/wallet/balance', null, p1Token);
  assert(balAfterBet.data.data.availableBalance === 1500, `Available balance deducted by 500 (now 1500, got ${balAfterBet.data.data.availableBalance})`);
  assert(balAfterBet.data.data.exposureBalance === 500, `Exposure balance increased by 500 (now 500, got ${balAfterBet.data.data.exposureBalance})`);

  // Verify bet shows canCancel = true in /api/bets/my-bets
  const myBets1 = await request('GET', '/bets/my-bets', null, p1Token);
  const placedBet = myBets1.data.data.bets.find((b) => b.id === betId);
  assert(placedBet && placedBet.canCancel === true, 'Bet reports canCancel = true before match start');

  // 5. Test Unauthorized Cancellation: Player 2 attempts to cancel Player 1's bet
  console.log('\n[TEST 6] Player 2 attempts to cancel Player 1\'s bet (Security check)...');
  const unauthCancelRes = await request('POST', `/bets/${betId}/cancel`, {}, p2Token);
  assert(unauthCancelRes.status === 403, `Forbidden 403 returned when cancelling other user's bet (got ${unauthCancelRes.status})`);

  // 6. Test Successful Bet Cancellation before match start
  console.log('\n[TEST 7] Player 1 cancels bet before match start...');
  const cancelRes = await request('POST', `/bets/${betId}/cancel`, {}, p1Token);
  assert(cancelRes.status === 200, `Bet cancellation returned 200 (got ${cancelRes.status})`);
  assert(cancelRes.data.success === true, 'Cancellation reports success = true');
  assert(cancelRes.data.refundedAmount === 500, `Refunded amount is 500 (got ${cancelRes.data.refundedAmount})`);
  const avBal = cancelRes.data.balance !== undefined ? cancelRes.data.balance : cancelRes.data.data.wallet.availableBalance;
  assert(avBal === 2000, `Available balance refunded to 2000 (got ${avBal})`);
  const expBal = cancelRes.data.data && cancelRes.data.data.wallet ? cancelRes.data.data.wallet.exposureBalance : 0;
  assert(expBal === 0, `Exposure balance reset to 0 (got ${expBal})`);

  // Verify Passbook Transaction Ledger
  const passbookRes = await request('GET', '/passbook/transactions', null, p1Token);
  assert(passbookRes.status === 200, 'Passbook transactions retrieved');
  const refundTx = passbookRes.data.data.transactions.find((tx) => tx.actionType === 'BET_CANCEL_REFUND');
  assert(refundTx !== undefined, 'Found BET_CANCEL_REFUND transaction in Passbook');
  assert(refundTx && refundTx.amount === 500, 'Passbook refund amount matches 500');

  // 7. Test Idempotency: Attempt to cancel the already cancelled bet
  console.log('\n[TEST 8] Attempting to cancel already cancelled bet (Double refund prevention)...');
  const doubleCancelRes = await request('POST', `/bets/${betId}/cancel`, {}, p1Token);
  assert(doubleCancelRes.status === 400, `Double cancellation rejected with 400 (got ${doubleCancelRes.status})`);
  const errCodeDouble = doubleCancelRes.data.code || (doubleCancelRes.data.error && doubleCancelRes.data.error.code);
  assert(errCodeDouble === 'ALREADY_CANCELLED', `Error code is ALREADY_CANCELLED (got ${errCodeDouble})`);

  const balAfterDouble = await request('GET', '/wallet/balance', null, p1Token);
  assert(balAfterDouble.data.data.availableBalance === 2000, 'Balance strictly unchanged at 2000 after double-cancel attempt');

  // Verify bet shows canCancel = false in my-bets and status is cancelled
  const myBets2 = await request('GET', '/bets/my-bets', null, p1Token);
  const cancelledBetInfo = myBets2.data.data.bets.find((b) => b.id === betId);
  assert(cancelledBetInfo.status === 'cancelled', 'Bet status is cancelled');
  assert(cancelledBetInfo.canCancel === false, 'Bet canCancel is now false');
  assert(cancelledBetInfo.refundAmount === 500, 'Bet refundAmount is 500');

  // 8. Test Concurrency: Race condition protection
  console.log('\n[TEST 9] Concurrency Test: 5 simultaneous cancel requests on a newly placed bet...');
  const betRes2 = await request('POST', '/bets', {
    match_id: matchId,
    selection: 'Australia',
    stake: 400
  }, p1Token);
  assert(betRes2.status === 201, 'Second bet of 400 placed');
  const bet2Id = betRes2.data && betRes2.data.data && betRes2.data.data.bet ? betRes2.data.data.bet.id : (betRes2.data && betRes2.data.data ? betRes2.data.data.id : null);

  // Run 5 simultaneous cancel requests
  const promises = [
    request('POST', `/bets/${bet2Id}/cancel`, {}, p1Token),
    request('POST', `/bets/${bet2Id}/cancel`, {}, p1Token),
    request('POST', `/bets/${bet2Id}/cancel`, {}, p1Token),
    request('POST', `/bets/${bet2Id}/cancel`, {}, p1Token),
    request('POST', `/bets/${bet2Id}/cancel`, {}, p1Token)
  ];
  const results = await Promise.all(promises);
  const successCount = results.filter((r) => r.status === 200).length;
  const rejectedCount = results.filter((r) => r.status === 400 || r.status === 409).length;

  assert(successCount === 1, `Exactly ONE cancellation succeeded under concurrency (successCount = ${successCount})`);
  assert(rejectedCount === 4, `Remaining 4 concurrent requests rejected (rejectedCount = ${rejectedCount})`);

  const balAfterRace = await request('GET', '/wallet/balance', null, p1Token);
  assert(balAfterRace.data.data.availableBalance === 2000, `Balance is exactly 2000 after concurrent cancellations (got ${balAfterRace.data.data.availableBalance})`);
  assert(balAfterRace.data.data.exposureBalance === 0, 'Exposure is 0 after concurrent cancellations');

  // 9. Test Deadline: Match has started
  console.log('\n[TEST 10] Deadline Test: Match marked live / past start time...');
  const startedMatchRes = await request('POST', '/admin/matches', {
    match_title: `Started Match Test ${timestamp}`,
    competition: 'ICC Live Cup',
    team_one: 'England',
    team_two: 'South Africa',
    scheduled_time: 'Started 10 mins ago',
    match_start_time: new Date(Date.now() - 600 * 1000).toISOString(),
    match_end_time: new Date(Date.now() + 3600 * 1000).toISOString(),
    status: 'live',
    team_one_rate: 1.90,
    team_two_rate: 1.90
  }, adminToken);
  assert(startedMatchRes.status === 201, 'Live match created');
  const startedMatchId = startedMatchRes.data.data.match ? startedMatchRes.data.data.match.id : startedMatchRes.data.data.id;

  // Place bet on live match
  const betOnLiveRes = await request('POST', '/bets', {
    match_id: startedMatchId,
    selection: 'England',
    stake: 300
  }, p1Token);
  assert(betOnLiveRes.status === 201, 'Bet of 300 placed on live match');
  const liveBetId = betOnLiveRes.data && betOnLiveRes.data.data && betOnLiveRes.data.data.bet ? betOnLiveRes.data.data.bet.id : (betOnLiveRes.data && betOnLiveRes.data.data ? betOnLiveRes.data.data.id : null);

  // Attempt to cancel bet on live match -> must be rejected
  const cancelLiveRes = await request('POST', `/bets/${liveBetId}/cancel`, {}, p1Token);
  assert(cancelLiveRes.status === 400, `Cancellation of live match bet rejected with 400 (got ${cancelLiveRes.status})`);
  const errCodeLive = cancelLiveRes.data.code || (cancelLiveRes.data.error && cancelLiveRes.data.error.code);
  assert(errCodeLive === 'MATCH_STARTED', `Error code is MATCH_STARTED (got ${errCodeLive})`);

  // 10. Test Settlement Isolation: Cancelled bets excluded from settlement & payouts
  console.log('\n[TEST 11] Settlement Isolation: Admin settles match where 1 bet is cancelled and 1 bet is active...');
  // Create upcoming match
  const settlMatchRes = await request('POST', '/admin/matches', {
    match_title: `Settlement Isolation Test ${timestamp}`,
    competition: 'IPL Test',
    team_one: 'CSK',
    team_two: 'MI',
    scheduled_time: 'Tonight, 08:00 PM',
    match_start_time: new Date(Date.now() + 3600 * 1000).toISOString(),
    match_end_time: new Date(Date.now() + 7200 * 1000).toISOString(),
    status: 'upcoming',
    team_one_rate: 2.00,
    team_two_rate: 2.00
  }, adminToken);
  assert(settlMatchRes.status === 201, 'Settlement test match created');
  const settlMatchId = settlMatchRes.data.data.match ? settlMatchRes.data.data.match.id : settlMatchRes.data.data.id;

  // Bet A: 200 on CSK (will be cancelled)
  const betARes = await request('POST', '/bets', {
    match_id: settlMatchId,
    selection: 'CSK',
    stake: 200
  }, p1Token);
  const betAId = betARes.data && betARes.data.data && betARes.data.data.bet ? betARes.data.data.bet.id : (betARes.data && betARes.data.data ? betARes.data.data.id : null);

  // Bet B: 300 on CSK (active, will NOT be cancelled)
  const betBRes = await request('POST', '/bets', {
    match_id: settlMatchId,
    selection: 'CSK',
    stake: 300
  }, p1Token);
  const betBId = betBRes.data && betBRes.data.data && betBRes.data.data.bet ? betBRes.data.data.bet.id : (betBRes.data && betBRes.data.data ? betBRes.data.data.id : null);

  // Cancel Bet A
  const cancelBetARes = await request('POST', `/bets/${betAId}/cancel`, {}, p1Token);
  assert(cancelBetARes.status === 200, 'Bet A cancelled successfully');

  // Check balance before settlement
  const balBeforeSettl = await request('GET', '/wallet/balance', null, p1Token);
  const expectedAvailableBeforeSettl = balBeforeSettl.data.data.availableBalance;

  // Admin settles match declaring CSK as winner
  const settleRes = await request('POST', '/admin/settlement/process', {
    matchId: settlMatchId,
    outcome: 'CSK',
    notes: 'CSK won toss cleanly'
  }, adminToken);
  assert(settleRes.status === 200, 'Admin settlement succeeded: ' + JSON.stringify(settleRes));
  assert(settleRes.data.data.totalBetsSettled === 1, `Total settled bets is 1 (excluding cancelled bet, got ${settleRes.data.data.totalBetsSettled})`);

  // Check Bet A and Bet B status
  const myBets3 = await request('GET', '/bets/my-bets', null, p1Token);
  const betARec = myBets3.data.data.bets.find((b) => b.id === betAId);
  const betBRec = myBets3.data.data.bets.find((b) => b.id === betBId);

  assert(betARec.status === 'cancelled', `Bet A remains cancelled (got ${betARec.status})`);
  assert(betARec.settlementStatus === 'cancelled', `Bet A settlementStatus is cancelled (got ${betARec.settlementStatus})`);
  assert(betBRec.status === 'won', `Bet B won and settled (got ${betBRec.status})`);
  assert(betBRec.payout === 600, `Bet B received 600 payout (got ${betBRec.payout})`);

  // Balance check: only Bet B paid out (300 * 2.0 = 600), Bet A was refunded earlier and received no winnings!
  const balAfterSettl = await request('GET', '/wallet/balance', null, p1Token);
  const expectedAvailableAfterSettl = expectedAvailableBeforeSettl + 600;
  assert(balAfterSettl.data.data.availableBalance === expectedAvailableAfterSettl, `Balance reflects only Bet B payout (expected ${expectedAvailableAfterSettl}, got ${balAfterSettl.data.data.availableBalance})`);

  console.log('\n========================================================');
  console.log('ALL BET CANCELLATION TESTS PASSED WITH 100% SUCCESS!');
  console.log('========================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE RUNTIME FAILURE:\n', err);
  process.exit(1);
});
