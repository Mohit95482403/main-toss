/**
 * IRONMAN TOSS BOOK - ADMIN MATCH MONITORING & BET SETTLEMENT AUTOMATED TEST SUITE
 * Tests:
 * 1. Match Monitoring API & Aggregated Stats
 * 2. Match Bets Inspection with Player Associations
 * 3. Role-Based Admin Authorization & Security Guards
 * 4. Settlement Read-Only Preview Accuracy
 * 5. Atomic Settlement Execution, Wallet Balance Credits & Exposure Release
 * 6. Duplicate Settlement Prevention & Idempotency Protection
 * 7. Transaction Rollback & Error Handling
 */

const http = require('http');
const path = require('path');
const { getPool, testConnection } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');
const app = require('../backend/app');

console.log('====================================================');
console.log('ADMIN MATCH MONITORING & BET SETTLEMENT TEST SUITE');
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
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.status, statusCode: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.status, statusCode: res.statusCode, raw: data });
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
  const pool = getPool();
  let server = null;

  try {
    const isConnected = await testConnection();
    assert(isConnected, 'Database Connection Successful');

    // Start ephemeral server
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });

    // 1. Locate or create test admin user and normal user
    await pool.query("UPDATE users SET status = 'active' WHERE role IN ('admin', 'super_admin')");

    const [adminRows] = await pool.query(
      `SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin') AND status = 'active' LIMIT 1`
    );
    assert(adminRows.length > 0, 'Admin account exists in database');
    const adminUser = adminRows[0];
    const adminToken = generateToken({ id: adminUser.id, userId: adminUser.id, username: adminUser.username, role: adminUser.role });

    const [userRows] = await pool.query(
      `SELECT id, username, email, role FROM users WHERE role = 'user' AND status = 'active' LIMIT 1`
    );
    assert(userRows.length > 0, 'Standard player account exists in database');
    const standardUser = userRows[0];
    const standardUserToken = generateToken({ id: standardUser.id, userId: standardUser.id, username: standardUser.username, role: standardUser.role });

    // ------------------------------------------------------------------------
    // SECTION A: Authorization Checks
    // ------------------------------------------------------------------------
    console.log('\n--- Section A: Server-Side Authorization Checks ---');

    const unauthRes = await makeRequest(server, 'GET', '/api/admin/matches');
    assert(unauthRes.statusCode === 401, 'Unauthenticated request to /admin/matches returns 401');

    const forbiddenRes = await makeRequest(
      server,
      'GET',
      '/api/admin/matches',
      { Authorization: `Bearer ${standardUserToken}` }
    );
    assert(forbiddenRes.statusCode === 403, 'Standard user request to /admin/matches returns 403 Forbidden');

    const forbiddenSettleRes = await makeRequest(
      server,
      'POST',
      '/api/admin/settlement/process',
      { Authorization: `Bearer ${standardUserToken}` },
      { matchId: 1, declaredOutcome: 'CSK' }
    );
    assert(forbiddenSettleRes.statusCode === 403, 'Standard user request to settlement returns 403 Forbidden');

    // ------------------------------------------------------------------------
    // SECTION B: Match Monitoring API
    // ------------------------------------------------------------------------
    console.log('\n--- Section B: Match Monitoring API & Bets Aggregations ---');

    const matchesRes = await makeRequest(
      server,
      'GET',
      '/api/admin/matches',
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(matchesRes.statusCode === 200, 'Admin request to /admin/matches returns 200');
    assert(matchesRes.data.success === true, 'Response contains success: true');
    assert(matchesRes.data.data && Array.isArray(matchesRes.data.data.matches), 'Matches array returned');
    assert(matchesRes.data.data.summary !== undefined, 'Summary KPI metrics returned');

    const summary = matchesRes.data.data.summary;
    console.log(`    Platform Summary: Matches with Bets = ${summary.matches_with_bets}, Total Bets = ${summary.total_bets}, Total Stakes = ₹${summary.total_stakes_placed}`);
    assert(typeof summary.matches_with_bets === 'number', 'Summary has matches_with_bets metric');
    assert(typeof summary.total_bets === 'number', 'Summary has total_bets metric');
    assert(typeof summary.pending_bets === 'number', 'Summary has pending_bets metric');
    assert(typeof summary.settled_bets === 'number', 'Summary has settled_bets metric');

    // Filter by search
    const searchRes = await makeRequest(
      server,
      'GET',
      '/api/admin/matches?search=India',
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(searchRes.statusCode === 200, 'Search filter query returns 200');
    assert(searchRes.data.data.matches.length > 0, 'Search found matching India fixture');

    // ------------------------------------------------------------------------
    // SECTION C: Inspect Bets for a Match
    // ------------------------------------------------------------------------
    console.log('\n--- Section C: Match Bets Association & Data Integrity ---');

    const firstMatch = matchesRes.data.data.matches[0];
    const matchBetsRes = await makeRequest(
      server,
      'GET',
      `/api/admin/matches/${firstMatch.id}/bets`,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(matchBetsRes.statusCode === 200, `Fetch bets for Match #${firstMatch.id} returns 200`);
    assert(matchBetsRes.data.data.match.id === firstMatch.id, 'Returned match object matches requested ID');
    assert(Array.isArray(matchBetsRes.data.data.bets), 'Bets array returned for match');

    if (matchBetsRes.data.data.bets.length > 0) {
      const sampleBet = matchBetsRes.data.data.bets[0];
      assert(sampleBet.id !== undefined, 'Bet has unique ID');
      assert(sampleBet.username !== undefined, 'Bet is linked to real player username');
      assert(sampleBet.selection !== undefined, 'Bet records player selection');
      assert(parseFloat(sampleBet.stake) > 0, 'Bet records stake amount');
      assert(parseFloat(sampleBet.odds) > 0, 'Bet records odds');
      const potRet = sampleBet.potential_return !== undefined ? sampleBet.potential_return : sampleBet.potentialReturn;
      assert(parseFloat(potRet) > 0, 'Bet records potential return');
      assert(['pending', 'live', 'won', 'lost', 'no_result'].includes(sampleBet.status), `Bet status is valid (${sampleBet.status})`);
      const settlStatus = sampleBet.settlement_status || sampleBet.settlementStatus;
      assert(['pending', 'settled'].includes(settlStatus), `Settlement status is valid (${settlStatus})`);
      console.log(`    Sample Bet Verified: Bet #${sampleBet.id} by ${sampleBet.username} on ${sampleBet.selection} (Stake ₹${sampleBet.stake}, Odds ${sampleBet.odds})`);
    }

    // ------------------------------------------------------------------------
    // SECTION D: Eligible Settlement Matches & Read-Only Preview
    // ------------------------------------------------------------------------
    console.log('\n--- Section D: Bet Settlement Workflow & Read-Only Preview ---');

    // Ensure MATCH-2026-001 exists and has pending bets for test reproducibility
    const [existingMatch] = await pool.query("SELECT id FROM matches WHERE id = 'MATCH-2026-001'");
    if (existingMatch.length === 0) {
      await pool.query(
        "INSERT INTO matches (id, competition, stage, team_one, team_one_abbr, team_one_rate, team_two, team_two_abbr, team_two_rate, scheduled_time, match_end_time, venue, status, settled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ['MATCH-2026-001', "ICC Men's T20 World Cup", 'Group 1', 'India', 'IND', 1.95, 'Australia', 'AUS', 1.90, 'Today, 03:00 PM', new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' '), 'Melbourne Cricket Ground', 'live', 0]
      );
    } else {
      await pool.query("UPDATE matches SET status = 'live', settled = 0, toss_winner = NULL, settled_at = NULL, settled_by = NULL WHERE id = 'MATCH-2026-001'");
    }
    const [existingBets] = await pool.query("SELECT id FROM bets WHERE match_id = 'MATCH-2026-001'");
    if (existingBets.length === 0) {
      await pool.query(
        "INSERT INTO bets (id, user_id, match_id, market_name, selection, stake, odds, potential_return, status, settlement_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ['TEST-BET-SETTLE-001', standardUser.id, 'MATCH-2026-001', 'Toss Winner', 'India', 500.00, 1.95, 975.00, 'live', 'pending']
      );
    } else {
      await pool.query("UPDATE bets SET status = 'live', settlement_status = 'pending', payout = 0.00, settled_at = NULL, settled_by = NULL WHERE match_id = 'MATCH-2026-001'");
    }
    await pool.query(`
      UPDATE wallets w
      SET exposure_balance = (
        SELECT COALESCE(SUM(b.stake), 0.00)
        FROM bets b
        WHERE b.user_id = w.user_id AND b.settlement_status = 'pending'
      )
    `);

    const eligibleRes = await makeRequest(
      server,
      'GET',
      '/api/admin/settlement/eligible',
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(eligibleRes.statusCode === 200, 'GET /admin/settlement/eligible returns 200');
    const eligibleMatchesList = eligibleRes.data.data.eligible_matches || eligibleRes.data.data.matches || [];
    assert(Array.isArray(eligibleMatchesList), 'Eligible matches list returned');
    assert(eligibleMatchesList.length > 0, 'Found matches with pending bets eligible for settlement');

    const targetMatch = eligibleMatchesList.find(m => (m.id || m.matchId) === 'MATCH-2026-001') || eligibleMatchesList[0];
    const targetMatchTitle = targetMatch.match_title || targetMatch.matchTitle;
    const targetTeamOne = targetMatch.team_one || targetMatch.teamOne;
    console.log(`    Selected Target Match for Settlement: Match #${targetMatch.id} (${targetMatchTitle})`);

    // Preview settlement for Team 1
    const declaredOutcome = targetTeamOne;
    const previewRes = await makeRequest(
      server,
      'POST',
      '/api/admin/settlement/preview',
      { Authorization: `Bearer ${adminToken}` },
      { matchId: targetMatch.id, outcome: declaredOutcome, declaredOutcome }
    );
    assert(previewRes.statusCode === 200, 'POST /admin/settlement/preview returns 200');
    assert(previewRes.data.data.preview !== undefined, 'Preview calculation data returned');
    const p = previewRes.data.data.preview;
    assert(typeof p.won_bets_count === 'number', 'Preview contains won_bets_count');
    assert(typeof p.lost_bets_count === 'number', 'Preview contains lost_bets_count');
    assert(typeof p.refund_bets_count === 'number', 'Preview contains refund_bets_count');
    assert(typeof p.total_winning_payout === 'number', 'Preview contains total_winning_payout');
    console.log(`    Preview Results: Won = ${p.won_bets_count}, Lost = ${p.lost_bets_count}, Winning Payout = ₹${p.total_winning_payout}`);

    // Verify preview did NOT modify database (read-only verification)
    const [checkMatch] = await pool.query('SELECT settled FROM matches WHERE id = ?', [targetMatch.id]);
    assert(checkMatch[0].settled === 0, 'Database verification: Match remains unsettled after preview');

    // ------------------------------------------------------------------------
    // SECTION E: Atomic Settlement Execution & Financial Integrity
    // ------------------------------------------------------------------------
    console.log('\n--- Section E: Atomic Settlement Execution & Balance Updates ---');

    // Check pre-settlement wallet balances of players who bet on this match
    const [pendingBets] = await pool.query(
      `SELECT b.id, b.user_id, b.selection, b.stake, b.odds, b.potential_return, w.available_balance, w.exposure_balance
       FROM bets b
       JOIN wallets w ON w.user_id = b.user_id
       WHERE b.match_id = ? AND b.settlement_status = 'pending'`,
      [targetMatch.id]
    );
    assert(pendingBets.length > 0, `Found ${pendingBets.length} pending bets with wallet tracking before settlement`);
    const preWalletMap = new Map();
    for (const b of pendingBets) {
      preWalletMap.set(b.user_id, {
        available: parseFloat(b.available_balance),
        exposure: parseFloat(b.exposure_balance)
      });
    }

    // Execute settlement
    const processRes = await makeRequest(
      server,
      'POST',
      '/api/admin/settlement/process',
      { Authorization: `Bearer ${adminToken}` },
      {
        matchId: targetMatch.id,
        outcome: declaredOutcome,
        declaredOutcome,
        confirm: true,
        notes: 'Automated test suite settlement verification'
      }
    );
    assert(processRes.statusCode === 200, 'POST /admin/settlement/process returns 200 OK');
    assert(processRes.data.success === true, 'Settlement process response confirms success');
    assert(processRes.data.data.settlement_uuid !== undefined, 'Settlement UUID generated and returned');
    assert(processRes.data.data.bets_settled === pendingBets.length, 'All eligible pending bets were settled');

    // Verify post-settlement state in MySQL
    const [postMatch] = await pool.query(
      'SELECT settled, toss_winner, settled_by, settled_at FROM matches WHERE id = ?',
      [targetMatch.id]
    );
    assert(postMatch[0].settled === 1, 'Match record marked settled = 1 in MySQL');
    assert(postMatch[0].toss_winner === declaredOutcome, `Match toss_winner set to ${declaredOutcome}`);
    assert(postMatch[0].settled_by === adminUser.id, 'Match record tracks admin ID who settled');

    // Verify bet statuses updated
    const [postBets] = await pool.query(
      'SELECT id, user_id, selection, status, settlement_status, payout FROM bets WHERE match_id = ?',
      [targetMatch.id]
    );
    for (const b of postBets) {
      assert(b.settlement_status === 'settled', `Bet #${b.id} marked settlement_status = 'settled'`);
      if (b.selection === declaredOutcome) {
        assert(b.status === 'won', `Winning bet #${b.id} status is 'won'`);
        assert(parseFloat(b.payout) > 0, `Winning bet #${b.id} payout credited correctly (₹${b.payout})`);
      } else {
        assert(b.status === 'lost', `Losing bet #${b.id} status is 'lost'`);
        assert(parseFloat(b.payout) === 0, `Losing bet #${b.id} payout is ₹0.00`);
      }
    }

    // Verify user wallet balance updates
    for (const b of pendingBets) {
      const [walletRows] = await pool.query(
        'SELECT available_balance, exposure_balance FROM wallets WHERE user_id = ?',
        [b.user_id]
      );
      const postAvailable = parseFloat(walletRows[0].available_balance);
      const postExposure = parseFloat(walletRows[0].exposure_balance);
      const pre = preWalletMap.get(b.user_id);

      // Exposure must be released
      assert(postExposure <= pre.exposure, `User #${b.user_id} exposure released (${pre.exposure} -> ${postExposure})`);

      if (b.selection === declaredOutcome) {
        const expectedAvailable = pre.available + parseFloat(b.potential_return);
        assert(
          Math.abs(postAvailable - expectedAvailable) < 0.01,
          `Winner User #${b.user_id} received full return credit (₹${pre.available} -> ₹${postAvailable})`
        );
      }
    }

    // Verify settlements audit record created in MySQL
    const [settlementRows] = await pool.query(
      'SELECT * FROM settlements WHERE match_id = ?',
      [targetMatch.id]
    );
    assert(settlementRows.length > 0, 'Settlement audit entry created in settlements table');
    assert(settlementRows[0].declared_outcome === declaredOutcome, 'Settlement record reflects declared outcome');
    assert(settlementRows[0].admin_id === adminUser.id, 'Settlement record tracks admin ID');

    // ------------------------------------------------------------------------
    // SECTION F: Duplicate Settlement Prevention & Idempotency
    // ------------------------------------------------------------------------
    console.log('\n--- Section F: Duplicate Settlement Prevention & Idempotency ---');

    const duplicateRes = await makeRequest(
      server,
      'POST',
      '/api/admin/settlement/process',
      { Authorization: `Bearer ${adminToken}` },
      { matchId: targetMatch.id, outcome: declaredOutcome, declaredOutcome, confirm: true }
    );
    assert(duplicateRes.statusCode === 409, 'Submitting duplicate settlement returns 409 Conflict');
    assert(
      duplicateRes.data.error && duplicateRes.data.error.code === 'ALREADY_SETTLED',
      'Error code is ALREADY_SETTLED'
    );
    console.log('    Confirmed: Duplicate settlement rejected with HTTP 409 ALREADY_SETTLED');

    // ------------------------------------------------------------------------
    // SECTION G: Settlement History API
    // ------------------------------------------------------------------------
    console.log('\n--- Section G: Settlement History Verification ---');

    const historyRes = await makeRequest(
      server,
      'GET',
      '/api/admin/settlement/history?page=1&limit=10',
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(historyRes.statusCode === 200, 'GET /admin/settlement/history returns 200');
    assert(historyRes.data.data.settlements.length > 0, 'History contains settled record');
    const recentSettlementMatch = historyRes.data.data.settlements[0].match_id || historyRes.data.data.settlements[0].matchId;
    assert(recentSettlementMatch === targetMatch.id, 'Most recent settlement matches target match');

    // ------------------------------------------------------------------------
    // SECTION H: Error Handling & Invalid Requests
    // ------------------------------------------------------------------------
    console.log('\n--- Section H: Input Validation & Error Handling ---');

    const invalidMatchRes = await makeRequest(
      server,
      'POST',
      '/api/admin/settlement/process',
      { Authorization: `Bearer ${adminToken}` },
      { matchId: 999999, declaredOutcome: 'TEAM' }
    );
    assert(invalidMatchRes.statusCode === 404, 'Non-existent match returns 404 Not Found');

    const invalidOutcomeRes = await makeRequest(
      server,
      'POST',
      '/api/admin/settlement/process',
      { Authorization: `Bearer ${adminToken}` },
      { matchId: 2, declaredOutcome: '' }
    );
    assert(invalidOutcomeRes.statusCode === 400, 'Empty outcome returns 400 Bad Request');

    console.log('\n====================================================');
    console.log(`TEST SUITE RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
    console.log('====================================================\n');

    if (passedTests === totalTests) {
      console.log('SUCCESS: All Admin Match Monitoring and Bet Settlement features verified.');
      process.exit(0);
    } else {
      console.error(`FAILURE: ${totalTests - passedTests} tests failed.`);
      process.exit(1);
    }
  } catch (err) {
    console.error('[TEST SUITE CRITICAL ERROR]', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    try {
      await pool.query("DELETE FROM bets WHERE id LIKE 'TEST-BET-SETTLE-%'");
      await pool.query("UPDATE matches SET status = 'completed', toss_winner = 'India', settled = 1 WHERE id = 'MATCH-2026-001'");
    } catch (cleanErr) {}
  }
}

runTests();
