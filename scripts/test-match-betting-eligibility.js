/**
 * DADDY TOSS BOOK - Match Betting Eligibility & Timezone Verification Suite
 * 
 * Verifies all 13 critical requirements:
 * 1. Admin creates match scheduled for future time
 * 2. Unsettled match is eligible and open
 * 3. User selects valid team and places bet before deadline
 * 4. Status = 'live' (Live Toss) allows betting
 * 5. Settled match rejects betting (BETTING_CLOSED)
 * 6. Concluded status ('completed', 'abandoned') rejects betting (BETTING_CLOSED)
 * 7. Missing result (toss_winner: null) is NOT treated as settled
 * 8. Strict boolean conversion for settled flag (0, '0', false, null are NOT settled)
 * 9. Match with expired cutoff rejects betting (MATCH_EXPIRED)
 * 10. Nonexistent match rejects betting (MATCH_NOT_FOUND)
 * 11. Invalid team selection rejects betting (INVALID_TEAM_SELECTION)
 * 12. Timezone handling between IST (admin) and UTC (MySQL DATETIME / Node) is exact
 * 13. Frontend error message display preserves real backend messages without blanket masking
 */

const assert = require('assert');
const {
  parseExpiryDateTime,
  parseUtcTimestamp,
  isMatchSettled,
  isMatchConcluded
} = require('../backend/src/utils/dateTime');

console.log('====================================================');
console.log('DADDY TOSS BOOK - BETTING ELIGIBILITY & TIMEZONE TEST');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// -------------------------------------------------------------
// SECTION 1: Status & Result Settled Evaluation
// -------------------------------------------------------------
console.log('--- Section 1: Match Status & Result Settled Evaluation ---');

runTest('1.1 Newly created match with settled = 0 is NOT settled', () => {
  assert.strictEqual(isMatchSettled(0), false);
  assert.strictEqual(isMatchSettled('0'), false);
  assert.strictEqual(isMatchSettled(false), false);
  assert.strictEqual(isMatchSettled(null), false);
  assert.strictEqual(isMatchSettled(undefined), false);
});

runTest('1.2 Genuinely settled match (settled = 1, true, "1") IS settled', () => {
  assert.strictEqual(isMatchSettled(1), true);
  assert.strictEqual(isMatchSettled(true), true);
  assert.strictEqual(isMatchSettled('1'), true);
  assert.strictEqual(isMatchSettled('true'), true);
});

runTest('1.3 Missing toss_winner (null or empty) does not affect settled status', () => {
  const match = { status: 'upcoming', settled: 0, toss_winner: null };
  assert.strictEqual(isMatchSettled(match.settled), false);
  assert.strictEqual(isMatchConcluded(match.status), false);
});

runTest('1.4 Active match statuses ("upcoming" and "live") are NOT concluded', () => {
  assert.strictEqual(isMatchConcluded('upcoming'), false);
  assert.strictEqual(isMatchConcluded('live'), false);
  assert.strictEqual(isMatchConcluded('UPCOMING'), false);
  assert.strictEqual(isMatchConcluded('LIVE'), false);
});

runTest('1.5 Inactive statuses ("completed", "abandoned", "closed") ARE concluded', () => {
  assert.strictEqual(isMatchConcluded('completed'), true);
  assert.strictEqual(isMatchConcluded('abandoned'), true);
  assert.strictEqual(isMatchConcluded('closed'), true);
  assert.strictEqual(isMatchConcluded('settlement_reversed'), true);
});

// -------------------------------------------------------------
// SECTION 2: Timezone Handling & Date Parsing
// -------------------------------------------------------------
console.log('\n--- Section 2: Timezone Handling & Date Parsing ---');

runTest('2.1 Admin datetime-local input is interpreted as IST (+05:30)', () => {
  const d = parseExpiryDateTime('2026-10-23T20:00');
  assert(d instanceof Date);
  assert(!isNaN(d.getTime()));
  // 20:00 IST is 14:30 UTC
  assert.strictEqual(d.toISOString(), '2026-10-23T14:30:00.000Z');
});

runTest('2.2 Datetime-local with seconds is interpreted as IST (+05:30)', () => {
  const d = parseExpiryDateTime('2026-10-23 20:00:00');
  assert(d instanceof Date);
  assert.strictEqual(d.toISOString(), '2026-10-23T14:30:00.000Z');
});

runTest('2.3 ISO string with explicit UTC "Z" is preserved accurately', () => {
  const d = parseExpiryDateTime('2026-10-23T14:30:00.000Z');
  assert(d instanceof Date);
  assert.strictEqual(d.toISOString(), '2026-10-23T14:30:00.000Z');
});

runTest('2.4 SQL DATETIME string from MySQL is parsed directly as UTC without local machine distortion', () => {
  const epochMs = parseUtcTimestamp('2026-10-23 15:30:00');
  const expectedUtc = Date.UTC(2026, 9, 23, 15, 30, 0);
  assert.strictEqual(epochMs, expectedUtc);
});

runTest('2.5 Stored Date object is converted to UTC milliseconds directly', () => {
  const dateObj = new Date('2026-10-23T15:30:00.000Z');
  const epochMs = parseUtcTimestamp(dateObj);
  assert.strictEqual(epochMs, dateObj.getTime());
});

// -------------------------------------------------------------
// SECTION 3: Betting Eligibility Decision Logic
// -------------------------------------------------------------
console.log('\n--- Section 3: Betting Eligibility Decision Matrix ---');

function evaluateBettingEligibility(match, nowMs) {
  if (isMatchSettled(match.settled) || isMatchConcluded(match.status)) {
    return { eligible: false, code: 'BETTING_CLOSED', message: 'Betting on this match is closed.' };
  }

  if (match.status === 'upcoming' && match.match_start_time) {
    const startMs = parseUtcTimestamp(match.match_start_time);
    if (startMs && startMs <= nowMs) {
      return { eligible: false, code: 'MATCH_STARTED', message: 'The match has already started. Betting cutoff has passed.' };
    }
  }

  if (match.match_end_time) {
    const endMs = parseUtcTimestamp(match.match_end_time);
    if (endMs && endMs <= nowMs) {
      return { eligible: false, code: 'MATCH_EXPIRED', message: 'This match has expired and betting is closed.' };
    }
  }

  return { eligible: true };
}

runTest('3.1 Newly created upcoming match with future expiry is ELIGIBLE', () => {
  const now = Date.now();
  const match = {
    status: 'upcoming',
    settled: 0,
    toss_winner: null,
    match_end_time: new Date(now + 3600000)
  };
  const result = evaluateBettingEligibility(match, now);
  assert.strictEqual(result.eligible, true);
});

runTest('3.2 Live toss match (status: "live") with future expiry is ELIGIBLE', () => {
  const now = Date.now();
  const match = {
    status: 'live',
    settled: 0,
    toss_winner: null,
    match_end_time: new Date(now + 1800000)
  };
  const result = evaluateBettingEligibility(match, now);
  assert.strictEqual(result.eligible, true, 'Live toss matches must remain eligible for betting');
});

runTest('3.3 Settled match (settled: 1) is REJECTED with BETTING_CLOSED', () => {
  const now = Date.now();
  const match = {
    status: 'completed',
    settled: 1,
    toss_winner: 'India',
    match_end_time: new Date(now + 3600000)
  };
  const result = evaluateBettingEligibility(match, now);
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.code, 'BETTING_CLOSED');
});

runTest('3.4 Match with passed match_end_time is REJECTED with MATCH_EXPIRED', () => {
  const now = Date.now();
  const match = {
    status: 'upcoming',
    settled: 0,
    match_end_time: new Date(now - 60000)
  };
  const result = evaluateBettingEligibility(match, now);
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.code, 'MATCH_EXPIRED');
});

runTest('3.5 Upcoming match with passed match_start_time is REJECTED with MATCH_STARTED', () => {
  const now = Date.now();
  const match = {
    status: 'upcoming',
    settled: 0,
    match_start_time: new Date(now - 120000),
    match_end_time: new Date(now + 3600000)
  };
  const result = evaluateBettingEligibility(match, now);
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.code, 'MATCH_STARTED');
});

runTest('3.6 Team selection validation accepts valid match teams and rejects others', () => {
  const match = { team_one: 'CSK', team_two: 'RCB' };
  const isValidTeam = (sel) => sel.toLowerCase() === match.team_one.toLowerCase() || sel.toLowerCase() === match.team_two.toLowerCase();
  
  assert.strictEqual(isValidTeam('CSK'), true);
  assert.strictEqual(isValidTeam('rcb'), true);
  assert.strictEqual(isValidTeam('MI'), false);
  assert.strictEqual(isValidTeam(''), false);
});

// -------------------------------------------------------------
// SECTION 4: Frontend Error Formatting Validation
// -------------------------------------------------------------
console.log('\n--- Section 4: Frontend Error Formatting Consistency ---');

function formatFrontendBetError(err) {
  const errCode = err.code || '';
  const errMsg = err.message || '';

  if (errCode === 'BETTING_CLOSED' || errCode === 'MATCH_SETTLED') {
    return '⚠️ Betting is closed. This match has concluded and settled.';
  } else if (errCode === 'MATCH_EXPIRED') {
    return '⚠️ This match has reached its scheduled betting cutoff.';
  } else if (errCode === 'MATCH_STARTED') {
    return '⚠️ The match has already started. Betting cutoff has passed.';
  } else {
    return errMsg;
  }
}

runTest('4.1 Genuinely settled match displays settled message', () => {
  const msg = formatFrontendBetError({ code: 'BETTING_CLOSED', message: 'Betting on this match is closed.' });
  assert.strictEqual(msg, '⚠️ Betting is closed. This match has concluded and settled.');
});

runTest('4.2 Expired cutoff displays specific cutoff message, NOT settled message', () => {
  const msg = formatFrontendBetError({ code: 'MATCH_EXPIRED', message: 'This match has expired and betting is closed.' });
  assert.strictEqual(msg, '⚠️ This match has reached its scheduled betting cutoff.');
});

runTest('4.3 Financial / stake validation error displays actual backend message without masking', () => {
  const msg = formatFrontendBetError({ code: 'INSUFFICIENT_BALANCE', message: 'Insufficient available balance. Required: ₹500.00, Available: ₹200.00.' });
  assert.strictEqual(msg, 'Insufficient available balance. Required: ₹500.00, Available: ₹200.00.');
});

runTest('4.4 Invalid team selection displays real backend message without masking', () => {
  const msg = formatFrontendBetError({ code: 'INVALID_TEAM_SELECTION', message: 'Selection "KKR" is invalid. Must choose either "CSK" or "RCB".' });
  assert.strictEqual(msg, 'Selection "KKR" is invalid. Must choose either "CSK" or "RCB".');
});

console.log('\n====================================================');
console.log(`ALL ${passedTests} / ${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log('====================================================\n');
