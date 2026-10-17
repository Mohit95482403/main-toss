const http = require('http');
const { generateToken } = require('../src/utils/crypto');
const { getPool } = require('../src/config/db');

async function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
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
  console.log('=== STARTING AUTOMATED EXPIRY TEST SUITE ===\n');

  // 1. Prepare authenticated test tokens
  console.log('1. Preparing authenticated test tokens...');
  const pool = getPool();
  const [admins] = await pool.query("SELECT id, username, role FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1");
  const [users] = await pool.query("SELECT id, username, role FROM users WHERE role = 'user' LIMIT 1");

  if (!admins.length || !users.length) {
    throw new Error('Database must have at least one admin and one regular user');
  }

  const admin = admins[0];
  const user = users[0];

  const adminToken = generateToken({ id: admin.id, username: admin.username, role: admin.role });
  const userToken = generateToken({ id: user.id, username: user.username, role: user.role });

  console.log(`✓ Admin token generated for ${admin.username} (${admin.role})`);
  console.log(`✓ User token generated for ${user.username} (${user.role})`);

  // Verify user balance
  const [walletRows] = await pool.query('SELECT available_balance, exposure_balance FROM wallets WHERE user_id = ?', [user.id]);
  const initialCoins = parseFloat(walletRows[0].available_balance);
  const initialExposure = parseFloat(walletRows[0].exposure_balance);
  console.log(`✓ Verified User starting balance: ${initialCoins} coins, exposure: ${initialExposure}`);

  // 2. Admin creates match expiring in 4 seconds
  console.log('\n2. Admin creating match expiring in 4 seconds...');
  const now = new Date();
  const futureEndTime = new Date(now.getTime() + 4000); // 4 seconds from now
  const isoEnd = futureEndTime.toISOString();

  const createRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/matches',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    competition: 'Indian Premier League 2026',
    teamOne: 'Mumbai Indians',
    teamTwo: 'Chennai Super Kings',
    teamOneRate: 1.95,
    teamTwoRate: 1.95,
    scheduledTime: 'Today, 08:00 PM',
    matchEndTime: isoEnd,
    venue: 'Wankhede Stadium',
    status: 'upcoming'
  });

  if (createRes.status !== 201 || !createRes.body.data?.match?.id) {
    throw new Error('Create match failed: ' + JSON.stringify(createRes.body));
  }
  const matchId = createRes.body.data.match.id;
  console.log(`✓ Match created with ID: ${matchId}, end time: ${createRes.body.data.match.match_end_time}`);

  // 3. Verify match appears in GET /api/matches (User Home API) before expiry
  console.log('\n3. Checking User Home API (GET /api/matches) before expiry...');
  const homeBefore = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/matches',
    method: 'GET'
  });

  const foundBefore = homeBefore.body.data?.matches?.find(m => m.id === matchId);
  if (!foundBefore) {
    throw new Error(`Match ${matchId} should be visible before expiry, but was not found in Home API!`);
  }
  console.log(`✓ Match ${matchId} is visible on Home before expiry. isExpired=${foundBefore.isExpired}, matchEndTime=${foundBefore.matchEndTime}`);

  // 4. Wait 5.5 seconds for expiry
  console.log('\n4. Waiting 5.5 seconds for match to expire...');
  await new Promise(r => setTimeout(r, 5500));

  // 5. Verify match is excluded from GET /api/matches (User Home API) after expiry
  console.log('\n5. Checking User Home API (GET /api/matches) after expiry...');
  const homeAfter = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/matches',
    method: 'GET'
  });

  const foundAfter = homeAfter.body.data?.matches?.find(m => m.id === matchId);
  if (foundAfter) {
    throw new Error(`Match ${matchId} should NOT be visible on Home after expiry, but was found!`);
  }
  console.log(`✓ Match ${matchId} successfully disappeared from User Home API!`);

  // 6. Verify match is still listed in Admin matches API with isExpired=true
  console.log('\n6. Checking Admin Matches API (GET /api/admin/matches)...');
  const adminMatchesRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/matches',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  const adminFound = adminMatchesRes.body.data?.matches?.find(m => m.id === matchId);
  if (!adminFound) {
    throw new Error(`Match ${matchId} must remain in Admin Panel!`);
  }
  if (!adminFound.isExpired) {
    throw new Error(`Match ${matchId} in Admin Panel should have isExpired=true!`);
  }
  console.log(`✓ Match ${matchId} remains in Admin Panel with isExpired=true and configured end time preserved: ${adminFound.match_end_time}`);

  // 7. Attempt bet placement on expired match
  console.log('\n7. Attempting to place bet on expired match...');
  const betRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/bets/place',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    }
  }, {
    matchId: matchId,
    selection: 'Mumbai Indians',
    stake: 100
  });

  const errorCode = betRes.body.error?.code || betRes.body.code;
  const errorMessage = betRes.body.error?.message || betRes.body.message;
  if (betRes.status !== 400 || errorCode !== 'MATCH_EXPIRED') {
    throw new Error(`Expected bet rejection with MATCH_EXPIRED, got status ${betRes.status}: ` + JSON.stringify(betRes.body));
  }
  console.log(`✓ Backend correctly rejected bet with 400: "${errorMessage}" (code: ${errorCode})`);

  // 8. Verify user balance was NOT deducted
  console.log('\n8. Checking user balance after rejected bet...');
  const [walletCheck1] = await pool.query('SELECT available_balance, exposure_balance FROM wallets WHERE user_id = ?', [user.id]);
  const balanceAfterReject = parseFloat(walletCheck1[0].available_balance);
  const exposureAfterReject = parseFloat(walletCheck1[0].exposure_balance);

  if (balanceAfterReject !== initialCoins || exposureAfterReject !== initialExposure) {
    throw new Error(`User balance changed after rejected bet! Available: ${balanceAfterReject} vs ${initialCoins}, Exposure: ${exposureAfterReject} vs ${initialExposure}`);
  }
  console.log(`✓ User balance confirmed untouched: ${balanceAfterReject} coins, Exposure: ${exposureAfterReject}`);

  // 9. Admin extends match schedule via PUT /api/admin/matches/:id/schedule
  console.log('\n9. Admin updates match end time to +1 hour in the future...');
  const extendedEndTime = new Date(Date.now() + 3600000);
  const updateSchedRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/admin/matches/${matchId}/schedule`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    matchEndTime: extendedEndTime.toISOString(),
    scheduledTime: 'Tomorrow, 08:00 PM'
  });

  if (updateSchedRes.status !== 200 || updateSchedRes.body.data?.match?.isExpired) {
    throw new Error('Update schedule failed: ' + JSON.stringify(updateSchedRes.body));
  }
  console.log(`✓ Admin extended schedule successfully. New end time: ${updateSchedRes.body.data.match.match_end_time}, isExpired: ${updateSchedRes.body.data.match.isExpired}`);

  // 10. Verify match reappears on User Home API
  console.log('\n10. Checking User Home API after schedule extension...');
  const homeReappear = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/matches',
    method: 'GET'
  });
  const foundReappear = homeReappear.body.data?.matches?.find(m => m.id === matchId);
  if (!foundReappear) {
    throw new Error(`Match ${matchId} should have reappeared on Home after extension!`);
  }
  console.log(`✓ Match ${matchId} reappeared on Home API!`);

  // 11. Place a valid bet on the active match
  console.log('\n11. Placing bet on active match...');
  const validBetRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/bets/place',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    }
  }, {
    matchId: matchId,
    selection: 'Mumbai Indians',
    stake: 50
  });

  if (validBetRes.status !== 201) {
    throw new Error('Valid bet failed: ' + JSON.stringify(validBetRes.body));
  }
  const betId = validBetRes.body.data?.bet?.id;
  console.log(`✓ Bet placed successfully (Bet ID: ${betId}, Remaining coins: ${validBetRes.body.data?.user?.coins})`);

  // 12. Re-expire match by setting end time to past
  console.log('\n12. Admin sets match end time back to past (-1 minute)...');
  const pastEndTime = new Date(Date.now() - 60000);
  const reExpireRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/admin/matches/${matchId}/schedule`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    matchEndTime: pastEndTime.toISOString()
  });

  if (reExpireRes.status !== 200 || !reExpireRes.body.data?.match?.isExpired) {
    throw new Error('Re-expiring match failed: ' + JSON.stringify(reExpireRes.body));
  }
  console.log(`✓ Match re-expired in DB. isExpired=${reExpireRes.body.data.match.isExpired}`);

  // 13. Verify Home excludes it again
  console.log('\n13. Checking Home API after re-expiry...');
  const homeReExclude = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/matches',
    method: 'GET'
  });
  if (homeReExclude.body.data?.matches?.find(m => m.id === matchId)) {
    throw new Error(`Match ${matchId} should be excluded from Home!`);
  }
  console.log(`✓ Match ${matchId} is excluded from Home API.`);

  // 14. Verify historical bet and passbook records are preserved
  console.log('\n14. Checking historical bets and passbook records...');
  const userBetsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/bets/my-bets',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const betFound = userBetsRes.body.data?.bets?.find(b => b.id === betId);
  if (!betFound) {
    throw new Error(`Bet ${betId} must remain in user bets history!`);
  }
  console.log(`✓ Historical bet ${betId} exists and is intact in user bets history.`);

  // 15. Verify admin can still view the match's bets
  console.log('\n15. Checking Admin Bets Review endpoint...');
  const adminMatchBetsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/admin/matches/${matchId}/bets`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  if (adminMatchBetsRes.status !== 200 || !adminMatchBetsRes.body.data?.bets?.length) {
    throw new Error(`Admin should be able to view bets for expired match ${matchId}!`);
  }
  console.log(`✓ Admin successfully retrieved bet records for expired match ${matchId}. Configured end time in metadata: ${adminMatchBetsRes.body.data?.match?.match_end_time}`);

  // 16. Verify bet record directly in MySQL database
  console.log('\n16. Checking bet persistence directly in MySQL database...');
  const [dbBetRows] = await pool.query('SELECT id, match_id, user_id, selection, odds, stake, status FROM bets WHERE id = ?', [betId]);
  if (!dbBetRows.length) {
    throw new Error(`Bet record for ${betId} should exist in MySQL!`);
  }
  const dbBet = dbBetRows[0];
  console.log(`✓ Direct MySQL query verified: bet=${dbBet.id}, match=${dbBet.match_id}, selection=${dbBet.selection}, stake=${dbBet.stake}, status=${dbBet.status}`);

  console.log('\n=============================================');
  console.log('🎉 ALL 16 AUTOMATED TESTS PASSED SUCCESSFULLY!');
  console.log('=============================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
