/**
 * DADDY TOSS BOOK — Complete Financial Integrity & Transaction Safety Test Suite
 * 
 * Validates requirements Tests A through I:
 * - Test A: Duplicate Bet Placement (Idempotency, key uniqueness, stake deducted once, retry handling)
 * - Test B: Concurrent Balance Deduction (Two simultaneous 700-coin debits from 1,000-coin balance)
 * - Test C: Duplicate Bet Cancellation & Refund Protection (Only one refund, retry handling, race prevention)
 * - Test D: Duplicate Match Settlement (Simultaneous settlements, single payout per winning bet)
 * - Test E: Settlement Reversal & Resettlement (Compensating transactions, version advance, non-destructive ledger)
 * - Test F: Administrative Adjustments (Idempotency on credit and debit, retry returns original outcome)
 * - Test G: Failure Handling & Rollbacks (Invalid bets, insufficient funds, invalid settlement outcomes)
 * - Test H: Wallet Reconciliation Service (Read-only discrepancy detection, explanation, no silent modifications)
 * - Test I: Platform Regression (Passbook, wallet, matches, admin monitoring endpoints intact)
 */

const http = require('http');
const { getPool } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');

const BASE_URL = 'http://localhost:5000/api';

function request(method, path, body = null, token = null, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const headers = { 'Content-Type': 'application/json', ...customHeaders };
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

async function runTestSuite() {
  console.log('================================================================');
  console.log('STARTING DADDY TOSS BOOK CRITICAL FINANCIAL INTEGRITY TEST SUITE');
  console.log('================================================================\n');

  const pool = getPool();
  const timestamp = Date.now();

  // 0. Authenticate Admin
  console.log('[SETUP] Authenticating Admin...');
  const [admins] = await pool.execute("SELECT id, username, email, role FROM users WHERE role IN ('super_admin', 'admin') LIMIT 1");
  assert(admins.length > 0, 'Admin user exists in database');
  const admin = admins[0];
  const adminToken = generateToken({
    userId: admin.id,
    username: admin.username,
    email: admin.email,
    role: admin.role
  });
  assert(!!adminToken, `Admin authenticated as ${admin.username} (#${admin.id})`);

  // Helper: Create a dedicated test player
  async function createPlayer(prefix, balance = 2000) {
    const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const pass = 'TestPass123!';
    const res = await request('POST', '/admin/users/create', {
      displayName: `Player ${prefix}`,
      username,
      password: pass,
      confirmPassword: pass,
      initialCoinBalance: balance,
      accountStatus: 'active'
    }, adminToken);
    assert(res.status === 201, `Created player ${username} with balance ${balance}`);
    await pool.query('UPDATE users SET must_change_password = 0 WHERE id = ?', [res.data.data.user.id]);
    const token = generateToken({
      userId: res.data.data.user.id,
      username: res.data.data.user.username,
      email: res.data.data.user.email,
      role: 'user'
    });
    return { id: res.data.data.user.id, username, token, balance };
  }

  // Helper: Create a dedicated match scheduled in the future
  async function createMatch(teamOne = 'India', teamTwo = 'Australia', rate = 2.0) {
    const res = await request('POST', '/admin/matches', {
      competition: 'ICC Integrity Cup',
      stage: 'Fixture',
      teamOne,
      teamOneAbbr: teamOne.substring(0, 4).toUpperCase(),
      teamOneRate: rate,
      teamTwo,
      teamTwoAbbr: teamTwo.substring(0, 4).toUpperCase(),
      teamTwoRate: rate,
      scheduledTime: 'Tomorrow, 07:00 PM',
      matchEndTime: new Date(Date.now() + 86400000).toISOString(),
      venue: 'Lord\'s Cricket Ground'
    }, adminToken);
    assert(res.status === 201, `Created match ${teamOne} vs ${teamTwo} (${res.data.data.match.id})`);
    return res.data.data.match;
  }

  // ============================================================================
  // TEST A — DUPLICATE BET PLACEMENT
  // ============================================================================
  console.log('\n================================================================');
  console.log('[TEST A] Duplicate Bet Placement & Idempotency');
  console.log('================================================================');
  {
    const playerA = await createPlayer('testA', 2000);
    const matchA = await createMatch('Mumbai Indians', 'Chennai Super Kings');
    const idempotencyKey = `BET-IDEMP-${timestamp}-${Math.floor(Math.random() * 10000)}`;

    const betPayload = {
      matchId: matchA.id,
      marketName: 'Toss Winner',
      selection: 'Mumbai Indians',
      odds: 1.95,
      stake: 500
    };

    // 1. Submit initial bet placement
    const res1 = await request('POST', '/bets', betPayload, playerA.token, { 'x-idempotency-key': idempotencyKey });
    assert(res1.status === 201, `Initial bet placed successfully (HTTP 201)`);
    const betId1 = res1.data.data.bet.id;
    assert(!!betId1, `Bet ticket ID created: ${betId1}`);

    // Verify wallet deduction
    const [wRows1] = await pool.query('SELECT available_balance, exposure_balance FROM wallets WHERE user_id = ?', [playerA.id]);
    assert(parseFloat(wRows1[0].available_balance) === 1500, `Available balance deducted by 500 (now 1500)`);
    assert(parseFloat(wRows1[0].exposure_balance) === 500, `Exposure balance increased by 500 (now 500)`);

    // 2. Submit identical retry with same idempotency key (sequential retry)
    const res2 = await request('POST', '/bets', betPayload, playerA.token, { 'x-idempotency-key': idempotencyKey });
    assert(res2.status === 201, `Retry with same key returns cached 201 outcome`);
    assert(res2.data.data.bet.id === betId1, `Retry bet ID matches original: ${res2.data.data.bet.id}`);

    // 3. Send 5 concurrent requests with identical idempotency key
    const concurrentPromises = Array.from({ length: 5 }, () =>
      request('POST', '/bets', betPayload, playerA.token, { 'x-idempotency-key': idempotencyKey })
    );
    const concurrentResults = await Promise.all(concurrentPromises);
    assert(concurrentResults.every(r => [200, 201, 409].includes(r.status)), `All concurrent requests handled cleanly`);

    // 4. Verify in MySQL: Exactly ONE bet ticket exists under this idempotency key
    const [dbBets] = await pool.query('SELECT id, stake, idempotency_key FROM bets WHERE user_id = ?', [playerA.id]);
    assert(dbBets.length === 1, `Exactly ONE bet record created in bets table (found ${dbBets.length})`);
    assert(dbBets[0].idempotency_key === idempotencyKey, `Bet record stores idempotency key`);

    // 5. Verify in MySQL: Exactly ONE BET_STAKE_DEBIT exists in coin_transactions
    const [dbTxns] = await pool.query(
      "SELECT id, amount, action_type, balance_before, balance_after FROM coin_transactions WHERE user_id = ? AND action_type = 'BET_STAKE_DEBIT'",
      [playerA.id]
    );
    assert(dbTxns.length === 1, `Exactly ONE ledger debit in coin_transactions (found ${dbTxns.length})`);
    assert(parseFloat(dbTxns[0].amount) === 500, `Ledger debit amount is 500`);
    assert(parseFloat(dbTxns[0].balance_after) === 1500, `Ledger balance_after is 1500`);

    // 6. Verify genuinely new bet with NEW idempotency key succeeds
    const newKey = `BET-IDEMP-NEW-${timestamp}`;
    const resNew = await request('POST', '/bets', { ...betPayload, stake: 300 }, playerA.token, { 'x-idempotency-key': newKey });
    assert(resNew.status === 201, `Genuinely new bet with new key succeeds (HTTP 201)`);
    const [wRowsAfterNew] = await pool.query('SELECT available_balance, exposure_balance FROM wallets WHERE user_id = ?', [playerA.id]);
    assert(parseFloat(wRowsAfterNew[0].available_balance) === 1200, `Balance reduced to 1200`);
    assert(parseFloat(wRowsAfterNew[0].exposure_balance) === 800, `Exposure increased to 800`);
    console.log('✓ TEST A PASSED: Duplicate bet placement strictly prevented at database & idempotency layer.');
  }

  // ============================================================================
  // TEST B — CONCURRENT BALANCE DEDUCTION
  // ============================================================================
  console.log('\n================================================================');
  console.log('[TEST B] Concurrent Balance Deduction Safety');
  console.log('================================================================');
  {
    const playerB = await createPlayer('testB', 1000);
    const matchB = await createMatch('Gujarat Titans', 'Rajasthan Royals');

    // Attempt to deduct 700 twice simultaneously (700 + 700 = 1400 > 1000 available)
    const betPayload1 = { matchId: matchB.id, selection: 'Gujarat Titans', stake: 700, odds: 1.95 };
    const betPayload2 = { matchId: matchB.id, selection: 'Rajasthan Royals', stake: 700, odds: 1.95 };

    const [resB1, resB2] = await Promise.all([
      request('POST', '/bets', betPayload1, playerB.token, { 'x-idempotency-key': `CONC-B1-${timestamp}` }),
      request('POST', '/bets', betPayload2, playerB.token, { 'x-idempotency-key': `CONC-B2-${timestamp}` })
    ]);

    const successes = [resB1, resB2].filter(r => r.status === 201);
    const failures = [resB1, resB2].filter(r => r.status === 400 || r.status === 409 || r.status === 422);

    assert(successes.length === 1, `Exactly ONE concurrent bet succeeded (succeeded: ${successes.length}, rejected: ${failures.length})`);
    assert(failures.length === 1, `Compromised request was rejected with insufficient funds/conflict`);

    // Verify wallet balance is 300 and NOT negative
    const [wRowsB] = await pool.query('SELECT available_balance, exposure_balance FROM wallets WHERE user_id = ?', [playerB.id]);
    const finalBalB = parseFloat(wRowsB[0].available_balance);
    assert(finalBalB === 300, `Final balance is 300 (1000 - 700) (got ${finalBalB})`);
    assert(finalBalB >= 0, `No negative balance permitted`);

    // Verify ledger consistency
    const [txnsB] = await pool.query("SELECT * FROM coin_transactions WHERE user_id = ? AND action_type = 'BET_STAKE_DEBIT'", [playerB.id]);
    assert(txnsB.length === 1, `Exactly one ledger debit recorded`);
    assert(parseFloat(txnsB[0].amount) === 700, `Ledger debit amount is exactly 700`);
    console.log('✓ TEST B PASSED: Concurrent balance deduction serialized safely via row locks and conditional checks.');
  }

  // ============================================================================
  // TEST C — DUPLICATE BET CANCELLATION & REFUNDS
  // ============================================================================
  console.log('\n================================================================');
  console.log('[TEST C] Duplicate Bet Cancellation & Refund Protection');
  console.log('================================================================');
  {
    const playerC = await createPlayer('testC', 1000);
    const matchC = await createMatch('Kolkata Knight Riders', 'Delhi Capitals');

    // Place bet of 400
    const betRes = await request('POST', '/bets', {
      matchId: matchC.id,
      selection: 'Kolkata Knight Riders',
      stake: 400,
      odds: 1.95
    }, playerC.token);
    assert(betRes.status === 201, `Bet placed for 400`);
    const betIdC = betRes.data.data.bet.id;

    // 1. Cancel bet with idempotency key
    const cancelKey = `CANCEL-IDEMP-${timestamp}`;
    const cancelRes1 = await request('POST', `/bets/${betIdC}/cancel`, {}, playerC.token, { 'x-idempotency-key': cancelKey });
    assert(cancelRes1.status === 200, `Initial cancellation succeeded (HTTP 200)`);
    const refunded = cancelRes1.data.refundedAmount || (cancelRes1.data.data && (cancelRes1.data.data.refundAmount || cancelRes1.data.data.refundedAmount));
    assert(refunded === 400, `Refunded exactly 400 coins (got ${refunded})`);

    // 2. Retry cancellation with same idempotency key
    const cancelRes2 = await request('POST', `/bets/${betIdC}/cancel`, {}, playerC.token, { 'x-idempotency-key': cancelKey });
    assert(cancelRes2.status === 200, `Retry with same idempotency key returns cached 200`);

    // 3. Retry cancellation without idempotency key -> returns 400 ALREADY_CANCELLED
    const cancelRes3 = await request('POST', `/bets/${betIdC}/cancel`, {}, playerC.token);
    assert(cancelRes3.status === 400, `Explicit double cancellation rejected with HTTP 400`);
    const errCodeC = cancelRes3.data.code || (cancelRes3.data.error && cancelRes3.data.error.code);
    assert(errCodeC === 'ALREADY_CANCELLED', `Error code is ALREADY_CANCELLED`);

    // 4. Verify wallet: balance restored to 1000, exposure reset to 0
    const [wRowsC] = await pool.query('SELECT available_balance, exposure_balance FROM wallets WHERE user_id = ?', [playerC.id]);
    assert(parseFloat(wRowsC[0].available_balance) === 1000, `Balance is exactly 1000 (refund applied once)`);
    assert(parseFloat(wRowsC[0].exposure_balance) === 0, `Exposure is 0`);

    // 5. Verify ledger: exactly ONE BET_CANCEL_REFUND row in coin_transactions
    const [refundTxns] = await pool.query(
      "SELECT * FROM coin_transactions WHERE user_id = ? AND action_type = 'BET_CANCEL_REFUND'",
      [playerC.id]
    );
    assert(refundTxns.length === 1, `Exactly ONE refund ledger record exists in database`);
    assert(parseFloat(refundTxns[0].amount) === 400, `Refund ledger amount is 400`);
    console.log('✓ TEST C PASSED: Duplicate cancellation and double refunds strictly prevented.');
  }

  // ============================================================================
  // TEST D — DUPLICATE MATCH SETTLEMENT & PAYOUTS
  // ============================================================================
  console.log('\n================================================================');
  console.log('[TEST D] Duplicate Match Settlement & Payout Protection');
  console.log('================================================================');
  {
    const playerD1 = await createPlayer('testD1', 1000);
    const playerD2 = await createPlayer('testD2', 1000);
    const matchD = await createMatch('Sunrisers Hyderabad', 'Punjab Kings');

    // Place bet 500 on Sunrisers for Player D1
    const betResD1 = await request('POST', '/bets', {
      matchId: matchD.id,
      selection: 'Sunrisers Hyderabad',
      stake: 500,
      odds: 2.0
    }, playerD1.token);
    assert(betResD1.status === 201, `Player D1 placed bet on Sunrisers`);

    // Place bet 300 on Punjab for Player D2, then cancel it
    const betResD2 = await request('POST', '/bets', {
      matchId: matchD.id,
      selection: 'Punjab Kings',
      stake: 300,
      odds: 2.0
    }, playerD2.token);
    const cancelResD2 = await request('POST', `/bets/${betResD2.data.data.bet.id}/cancel`, {}, playerD2.token);
    assert(cancelResD2.status === 200, `Player D2 cancelled bet (must be excluded from settlement)`);

    // 1. Settle match with Sunrisers Hyderabad as winner using idempotency key
    const settleKey = `SETTLE-IDEMP-${timestamp}`;
    const settleRes1 = await request('POST', '/admin/settlement/process', {
      matchId: matchD.id,
      outcome: 'Sunrisers Hyderabad',
      notes: 'Official referee toss verification'
    }, adminToken, { 'x-idempotency-key': settleKey });

    assert(settleRes1.status === 200, `Initial settlement succeeded (HTTP 200)`);
    assert(settleRes1.data.data.wonCount === 1, `Won count is 1`);
    assert(settleRes1.data.data.totalBetsSettled === 1, `Cancelled bet was strictly excluded`);

    // 2. Retry settlement with same idempotency key
    const settleRes2 = await request('POST', '/admin/settlement/process', {
      matchId: matchD.id,
      outcome: 'Sunrisers Hyderabad'
    }, adminToken, { 'x-idempotency-key': settleKey });
    assert(settleRes2.status === 200, `Settlement retry with same key returns cached 200`);

    // 3. Retry settlement without key or with new key -> rejected with 409 ALREADY_SETTLED
    const settleRes3 = await request('POST', '/admin/settlement/process', {
      matchId: matchD.id,
      outcome: 'Sunrisers Hyderabad'
    }, adminToken);
    assert(settleRes3.status === 409, `Repeated settlement rejected with HTTP 409 ALREADY_SETTLED`);

    // 4. Verify in coin_transactions: Player D1 received exactly ONE payout
    const [payoutsD] = await pool.query(
      "SELECT * FROM coin_transactions WHERE user_id = ? AND action_type = 'BET_WON_PAYOUT'",
      [playerD1.id]
    );
    assert(payoutsD.length === 1, `Player D1 has exactly ONE payout ledger record`);
    assert(parseFloat(payoutsD[0].amount) === 1000, `Payout amount is 1000 (500 * 2.0)`);
    assert(payoutsD[0].bet_id === betResD1.data.data.bet.id, `Payout record has correlated bet_id`);
    assert(payoutsD[0].match_id === matchD.id, `Payout record has correlated match_id`);

    // Verify Player D1 balance: started with 1000, bet 500 (500 remaining), won 1000 -> final 1500
    const [wRowsD1] = await pool.query('SELECT available_balance FROM wallets WHERE user_id = ?', [playerD1.id]);
    assert(parseFloat(wRowsD1[0].available_balance) === 1500, `Player D1 final balance is exactly 1500 (got ${wRowsD1[0].available_balance})`);

    // Verify Player D2 (cancelled bet) received NO payout
    const [payoutsD2] = await pool.query(
      "SELECT * FROM coin_transactions WHERE user_id = ? AND action_type = 'BET_WON_PAYOUT'",
      [playerD2.id]
    );
    assert(payoutsD2.length === 0, `Player D2 received 0 payouts (cancelled bet was not paid out)`);
    console.log('✓ TEST D PASSED: Duplicate settlements prevented and payouts strictly atomic.');
  }

  // ============================================================================
  // TEST E — SETTLEMENT REVERSAL & RESETTLEMENT
  // ============================================================================
  console.log('\n================================================================');
  console.log('[TEST E] Settlement Reversal & Safe Resettlement');
  console.log('================================================================');
  {
    const playerE1 = await createPlayer('testE1', 1000); // Bets on Team 1
    const playerE2 = await createPlayer('testE2', 1000); // Bets on Team 2
    const matchE = await createMatch('Lucknow Super Giants', 'Gujarat Titans');

    // Player E1 bets 400 on Lucknow @ 2.0
    const betE1 = await request('POST', '/bets', { matchId: matchE.id, selection: 'Lucknow Super Giants', stake: 400, odds: 2.0 }, playerE1.token);
    // Player E2 bets 400 on Gujarat @ 2.0
    const betE2 = await request('POST', '/bets', { matchId: matchE.id, selection: 'Gujarat Titans', stake: 400, odds: 2.0 }, playerE2.token);

    // Initial settlement: Declare Lucknow winner (Player E1 won 800)
    await request('POST', '/admin/settlement/process', { matchId: matchE.id, outcome: 'Lucknow Super Giants' }, adminToken);

    // 1. Reverse settlement
    const revKey = `REV-IDEMP-${timestamp}`;
    const revRes1 = await request('POST', `/admin/matches/${matchE.id}/settlement/reverse`, {
      reason: 'Official toss call corrected after video review'
    }, adminToken, { 'x-idempotency-key': revKey });
    assert(revRes1.status === 200, `Settlement reversed successfully (HTTP 200)`);

    // 2. Retry reversal with same key -> cached outcome
    const revRes2 = await request('POST', `/admin/matches/${matchE.id}/settlement/reverse`, {
      reason: 'Official toss call corrected after video review'
    }, adminToken, { 'x-idempotency-key': revKey });
    assert(revRes2.status === 200, `Reversal retry returns cached 200`);

    // 3. Verify compensating debit in coin_transactions for Player E1
    const [revTxns] = await pool.query(
      "SELECT * FROM coin_transactions WHERE user_id = ? AND action_type = 'SETTLEMENT_REVERSAL_DEBIT'",
      [playerE1.id]
    );
    assert(revTxns.length === 1, `Exactly ONE SETTLEMENT_REVERSAL_DEBIT recorded for Player E1`);
    assert(parseFloat(revTxns[0].amount) === 800, `Compensating debit amount is 800`);
    assert(revTxns[0].bet_id === betE1.data.data.bet.id, `Reversal debit correlated to bet_id`);

    // 4. Resettle with corrected outcome: Gujarat Titans
    const resettleKey = `RESETTL-IDEMP-${timestamp}`;
    const resettleRes1 = await request('POST', `/admin/matches/${matchE.id}/settlement/resettle`, {
      outcome: 'Gujarat Titans',
      reason: 'Correction confirmed by match referee'
    }, adminToken, { 'x-idempotency-key': resettleKey });
    assert(resettleRes1.status === 200, `Resettlement with corrected outcome succeeded (HTTP 200)`);
    assert(resettleRes1.data.data.version === 2, `Settlement advanced to Version 2`);

    // 5. Retry resettlement with same key -> cached outcome
    const resettleRes2 = await request('POST', `/admin/matches/${matchE.id}/settlement/resettle`, {
      outcome: 'Gujarat Titans',
      reason: 'Correction confirmed by match referee'
    }, adminToken, { 'x-idempotency-key': resettleKey });
    assert(resettleRes2.status === 200, `Resettlement retry returns cached 200`);

    // 6. Verify Player E2 received corrected payout (BET_RESETTLEMENT_PAYOUT)
    const [resettlePayouts] = await pool.query(
      "SELECT * FROM coin_transactions WHERE user_id = ? AND action_type = 'BET_RESETTLEMENT_PAYOUT'",
      [playerE2.id]
    );
    assert(resettlePayouts.length === 1, `Player E2 received exactly ONE BET_RESETTLEMENT_PAYOUT`);
    assert(parseFloat(resettlePayouts[0].amount) === 800, `Corrected payout is 800`);

    // 7. Verify non-destructive ledger history: all transactions exist
    const [allTxnsE1] = await pool.query('SELECT action_type, amount FROM coin_transactions WHERE user_id = ? ORDER BY id ASC', [playerE1.id]);
    const actionTypesE1 = allTxnsE1.map(t => t.action_type);
    assert(actionTypesE1.includes('BET_STAKE_DEBIT'), `History preserves initial BET_STAKE_DEBIT`);
    assert(actionTypesE1.includes('BET_WON_PAYOUT'), `History preserves initial BET_WON_PAYOUT`);
    assert(actionTypesE1.includes('SETTLEMENT_REVERSAL_DEBIT'), `History preserves compensating SETTLEMENT_REVERSAL_DEBIT`);
    console.log('✓ TEST E PASSED: Settlement reversal & resettlement non-destructive and atomic.');
  }

  // ============================================================================
  // TEST F — ADMINISTRATIVE ADJUSTMENTS IDEMPOTENCY
  // ============================================================================
  console.log('\n================================================================');
  console.log('[TEST F] Administrative Adjustments Idempotency');
  console.log('================================================================');
  {
    const playerF = await createPlayer('testF', 500);
    const creditKey = `ADMIN-CREDIT-${timestamp}`;

    // 1. Admin credits 250 coins
    const creditRes1 = await request('POST', '/admin/coins/adjust', {
      userId: playerF.id,
      actionType: 'ADMIN_CREDIT',
      amount: 250,
      reason: 'Loyalty bonus reward'
    }, adminToken, { 'x-idempotency-key': creditKey });
    assert(creditRes1.status === 200, `Credit adjustment succeeded (HTTP 200)`);
    assert(parseFloat(creditRes1.data.data.balanceAfter) === 750, `Balance after credit is 750`);

    // 2. Retry exact same credit with same key
    const creditRes2 = await request('POST', '/admin/coins/adjust', {
      userId: playerF.id,
      actionType: 'ADMIN_CREDIT',
      amount: 250,
      reason: 'Loyalty bonus reward'
    }, adminToken, { 'x-idempotency-key': creditKey });
    assert(creditRes2.status === 200, `Retry credit returns cached 200`);
    assert(creditRes2.data.data.transactionUuid === creditRes1.data.data.transactionUuid, `Transaction UUID matches`);

    // Verify wallet in DB: balance is 750, NOT 1000
    const [wRowsF1] = await pool.query('SELECT available_balance FROM wallets WHERE user_id = ?', [playerF.id]);
    assert(parseFloat(wRowsF1[0].available_balance) === 750, `Stored balance is strictly 750 (credit applied once)`);

    // 3. Admin debits 150 coins
    const debitKey = `ADMIN-DEBIT-${timestamp}`;
    const debitRes1 = await request('POST', '/admin/coins/adjust', {
      userId: playerF.id,
      actionType: 'ADMIN_DEBIT',
      amount: 150,
      reason: 'Administrative penalty deduction'
    }, adminToken, { 'x-idempotency-key': debitKey });
    assert(debitRes1.status === 200, `Debit adjustment succeeded (HTTP 200)`);
    assert(parseFloat(debitRes1.data.data.balanceAfter) === 600, `Balance after debit is 600`);

    // 4. Retry debit with same key
    const debitRes2 = await request('POST', '/admin/coins/adjust', {
      userId: playerF.id,
      actionType: 'ADMIN_DEBIT',
      amount: 150,
      reason: 'Administrative penalty deduction'
    }, adminToken, { 'x-idempotency-key': debitKey });
    assert(debitRes2.status === 200, `Retry debit returns cached 200`);

    // Verify wallet in DB: balance is strictly 600, NOT 450
    const [wRowsF2] = await pool.query('SELECT available_balance FROM wallets WHERE user_id = ?', [playerF.id]);
    assert(parseFloat(wRowsF2[0].available_balance) === 600, `Stored balance is strictly 600 (debit applied once)`);

    // Verify ledger counts: exactly 1 manual credit and 1 manual debit under their idempotency keys
    const [manualCredits] = await pool.query(
      "SELECT * FROM coin_transactions WHERE user_id = ? AND idempotency_key = ?",
      [playerF.id, creditKey]
    );
    assert(manualCredits.length === 1, `Manual credit adjustment occurred exactly once in ledger under idempotency key`);

    const [manualDebits] = await pool.query(
      "SELECT * FROM coin_transactions WHERE user_id = ? AND idempotency_key = ?",
      [playerF.id, debitKey]
    );
    assert(manualDebits.length === 1, `Manual debit adjustment occurred exactly once in ledger under idempotency key`);
    console.log('✓ TEST F PASSED: Admin adjustments idempotent with deterministic replay.');
  }

  // ============================================================================
  // TEST G — FAILURE HANDLING & ROLLBACK INTEGRITY
  // ============================================================================
  console.log('\n================================================================');
  console.log('[TEST G] Failure Handling & Atomic Rollbacks');
  console.log('================================================================');
  {
    const playerG = await createPlayer('testG', 300);
    const matchG = await createMatch('England', 'South Africa');

    // 1. Stake exceeding available balance
    const overspendRes = await request('POST', '/bets', {
      matchId: matchG.id,
      selection: 'England',
      stake: 500, // available only 300
      odds: 1.95
    }, playerG.token);
    assert(overspendRes.status === 400, `Overspend bet rejected with HTTP 400`);

    // Verify no bet created, no ledger debit, balance unchanged
    const [betsG] = await pool.query('SELECT * FROM bets WHERE user_id = ?', [playerG.id]);
    assert(betsG.length === 0, `No bet was created in database`);
    const [txnsG] = await pool.query("SELECT * FROM coin_transactions WHERE user_id = ? AND action_type = 'BET_STAKE_DEBIT'", [playerG.id]);
    assert(txnsG.length === 0, `No bet debit ledger transaction recorded`);
    const [wRowsG] = await pool.query('SELECT available_balance FROM wallets WHERE user_id = ?', [playerG.id]);
    assert(parseFloat(wRowsG[0].available_balance) === 300, `Balance strictly preserved at 300`);

    // 2. Invalid settlement outcome on match
    const badSettleRes = await request('POST', '/admin/settlement/process', {
      matchId: matchG.id,
      outcome: 'INVALID_TEAM_NAME'
    }, adminToken);
    assert(badSettleRes.status === 400, `Invalid outcome rejected with HTTP 400`);

    // Verify match remains unsettled
    const [mRowsG] = await pool.query('SELECT settled, status FROM matches WHERE id = ?', [matchG.id]);
    assert(mRowsG[0].settled === 0, `Match settled status remains 0 (unsettled)`);
    console.log('✓ TEST G PASSED: Failed operations roll back completely without partial state mutations.');
  }

  // ============================================================================
  // TEST H — WALLET RECONCILIATION SERVICE
  // ============================================================================
  console.log('\n================================================================');
  console.log('[TEST H] Wallet Reconciliation Service (Read-Only Forensic Audit)');
  console.log('================================================================');
  {
    const playerH = await createPlayer('testH', 1000);
    const matchH = await createMatch('New Zealand', 'Pakistan');

    // Place bet of 250
    await request('POST', '/bets', { matchId: matchH.id, selection: 'New Zealand', stake: 250, odds: 1.95 }, playerH.token);

    // 1. Run reconciliation on clean, consistent account
    const reconClean = await request('GET', `/admin/reconciliation/user/${playerH.id}`, null, adminToken);
    assert(reconClean.status === 200, `Reconciliation endpoint returned HTTP 200`);
    assert(reconClean.data.data.discrepancy.hasDiscrepancy === false, `Zero discrepancy reported for consistent player`);
    assert(reconClean.data.data.discrepancy.status === 'MATCH', `Reconciliation status is MATCH`);
    assert(reconClean.data.data.storedBalance === 750, `Stored balance reported as 750`);
    assert(reconClean.data.data.storedExposure === 250, `Stored exposure reported as 250`);
    assert(reconClean.data.data.exposure.calculatedExposure === 250, `Pending ticket stake calculated as 250`);

    // 2. Introduce controlled discrepancy in test player wallet
    await pool.query('UPDATE wallets SET available_balance = available_balance + 88.50 WHERE user_id = ?', [playerH.id]);

    // 3. Re-run reconciliation: MUST detect discrepancy
    const reconDirty = await request('GET', `/admin/reconciliation/user/${playerH.id}`, null, adminToken);
    assert(reconDirty.status === 200, `Reconciliation audit executed`);
    assert(reconDirty.data.data.discrepancy.hasDiscrepancy === true, `Discrepancy flagged as TRUE`);
    assert(reconDirty.data.data.discrepancy.status === 'DISCREPANCY', `Status marked DISCREPANCY`);
    assert(reconDirty.data.data.discrepancy.balanceDifference === 88.50, `Exact difference detected: +88.50 coins`);
    assert(typeof reconDirty.data.data.discrepancy.explanation === 'string', `Forensic explanation provided`);

    // 4. Verify reconciliation did NOT silently modify the balance
    const [wCheck] = await pool.query('SELECT available_balance FROM wallets WHERE user_id = ?', [playerH.id]);
    assert(parseFloat(wCheck[0].available_balance) === 838.50, `Reconciliation is strictly read-only and did not overwrite balance`);

    // 5. Restore test anomaly
    await pool.query('UPDATE wallets SET available_balance = available_balance - 88.50 WHERE user_id = ?', [playerH.id]);
    const reconRestored = await request('GET', `/admin/reconciliation/user/${playerH.id}`, null, adminToken);
    assert(reconRestored.data.data.discrepancy.hasDiscrepancy === false, `Clean state restored`);

    // 6. Test platform-wide reconciliation summary endpoint
    const platformRecon = await request('GET', '/admin/reconciliation?limit=10', null, adminToken);
    assert(platformRecon.status === 200, `Platform-wide reconciliation returned 200`);
    assert(platformRecon.data.data.summary.totalUsersScanned > 0, `Scanned accounts across platform`);
    console.log('✓ TEST H PASSED: Wallet reconciliation audit is robust, read-only, and forensic.');
  }

  // ============================================================================
  // TEST I — REGRESSION VERIFICATION
  // ============================================================================
  console.log('\n================================================================');
  console.log('[TEST I] Platform Regression & Core Operational Endpoints');
  console.log('================================================================');
  {
    const playerI = await createPlayer('testI', 500);

    // 1. Health & Status
    const health = await request('GET', '/health');
    assert(health.status === 200, `System health probe is 200`);

    // 2. Wallet balance endpoint
    const balI = await request('GET', '/wallet/balance', null, playerI.token);
    assert(balI.status === 200, `Player wallet balance endpoint returned 200`);
    assert(balI.data.data.availableBalance === 500, `Available balance is 500`);

    // 3. Matches list endpoint
    const matchesI = await request('GET', '/matches');
    const matchesList = Array.isArray(matchesI.data.data) ? matchesI.data.data : (matchesI.data.data && matchesI.data.data.matches);
    assert(Array.isArray(matchesList), `Matches list is an array`);

    // 4. Passbook transactions endpoint
    const passbookI = await request('GET', '/passbook/transactions', null, playerI.token);
    assert(passbookI.status === 200, `Player passbook endpoint returned 200`);
    assert(passbookI.data.data.wallet.availableBalance === 500, `Passbook reflects wallet balance`);

    // 5. My Bets endpoint
    const myBetsI = await request('GET', '/bets/my-bets', null, playerI.token);
    assert(myBetsI.status === 200, `Player my-bets endpoint returned 200`);

    // 6. Admin matches & users directories
    const adminMatches = await request('GET', '/admin/matches', null, adminToken);
    assert(adminMatches.status === 200, `Admin matches directory returned 200`);
    const adminUsers = await request('GET', '/admin/users', null, adminToken);
    assert(adminUsers.status === 200, `Admin users directory returned 200`);
    console.log('✓ TEST I PASSED: All existing core platform endpoints fully operational and compatible.');
  }

  console.log('\n================================================================');
  console.log('ALL FINANCIAL INTEGRITY & SAFETY TESTS PASSED (100% SUCCESS)');
  console.log('================================================================');
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('\n❌ TEST SUITE FAILURE:');
  console.error(err);
  process.exit(1);
});
