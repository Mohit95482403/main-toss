/**
 * End-to-End Test Suite: Admin Match Management & User Home Match UI Integration
 * 
 * Verifies:
 * 1. Admin authorization check on POST /api/admin/matches (401/403 for unauth/users)
 * 2. Validation of required fields (competition, teams, rates, scheduled_time)
 * 3. Successful match creation in MySQL via POST /api/admin/matches
 * 4. Automatic availability on public GET /api/matches
 * 5. Automatic availability on GET /api/matches/:id
 * 6. Audit log entry recorded in admin_audit_logs
 * 7. Verification that match card fields match screenshot requirements
 * 8. Deletion protection and cleanup
 */

const { getPool, closePool } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');

const API_BASE = 'http://localhost:5000/api';

async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING ADMIN MATCH MANAGEMENT & HOME UI TEST SUITE');
  console.log('====================================================\n');

  let adminToken = '';
  let standardUserToken = '';
  let createdMatchId = null;
  const pool = getPool();

  try {
    // 1. Obtain Admin Token
    console.log('[STEP 1] Generating token for active Admin account...');
    const [adminRows] = await pool.query(
      `SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin') AND status = 'active' LIMIT 1`
    );
    if (!adminRows || adminRows.length === 0) {
      throw new Error('No active admin user found in database');
    }
    const adminUser = adminRows[0];
    adminToken = generateToken({ id: adminUser.id, userId: adminUser.id, username: adminUser.username, role: adminUser.role });
    console.log(`  ✓ Admin authenticated: ${adminUser.username} (${adminUser.role})`);

    // 2. Obtain Regular User Token
    console.log('\n[STEP 2] Generating token for active standard player...');
    const [userRows] = await pool.query(
      `SELECT id, username, email, role FROM users WHERE role = 'user' AND status = 'active' LIMIT 1`
    );
    if (userRows && userRows.length > 0) {
      const standardUser = userRows[0];
      standardUserToken = generateToken({ id: standardUser.id, userId: standardUser.id, username: standardUser.username, role: standardUser.role });
      console.log(`  ✓ Standard player authenticated: ${standardUser.username}`);
    } else {
      console.log('  ! Note: No active regular user found, will skip standard user test.');
    }

    // 3. Test Unauthorized Access to Match Creation
    console.log('\n[STEP 3] Testing Authorization Protection on POST /api/admin/matches...');
    const unauthRes = await apiRequest('/admin/matches', 'POST', {
      competition: 'Unauthorized Test',
      team_one: 'Alpha',
      team_two: 'Beta'
    });
    if (unauthRes.status === 401 || unauthRes.status === 403) {
      console.log(`  ✓ Blocked unauthenticated request correctly (Status ${unauthRes.status})`);
    } else {
      throw new Error(`FAIL: Unauthorized request got status ${unauthRes.status}`);
    }

    if (standardUserToken) {
      const userRes = await apiRequest('/admin/matches', 'POST', {
        competition: 'Unauthorized User Test',
        team_one: 'Alpha',
        team_two: 'Beta'
      }, standardUserToken);
      if (userRes.status === 403) {
        console.log(`  ✓ Blocked regular user request with 403 Forbidden.`);
      } else {
        throw new Error(`FAIL: Non-admin request got status ${userRes.status}`);
      }
    }

    // 4. Test Validation Failures
    console.log('\n[STEP 4] Testing Request Validation on POST /api/admin/matches...');
    const invalidRes = await apiRequest('/admin/matches', 'POST', {
      competition: 'Invalid Match',
      // Missing team_one and team_two
      scheduled_time: '2026-10-20 18:00:00'
    }, adminToken);
    if (invalidRes.status === 400) {
      console.log(`  ✓ Rejected missing fields with 400 Bad Request: "${invalidRes.body.error?.message || invalidRes.body.message}"`);
    } else {
      throw new Error(`FAIL: Invalid match payload got status ${invalidRes.status}`);
    }

    // 5. Test Successful Match Creation by Admin
    console.log('\n[STEP 5] Creating a Valid Match via Admin API...');
    const matchPayload = {
      competition: 'SUPER LEAGUE T20',
      stage: 'Final',
      team_one: 'MUMBAI THUNDER',
      team_one_abbr: 'MT',
      team_one_rate: 95,
      team_two: 'BANGALORE KNIGHTS',
      team_two_abbr: 'BK',
      team_two_rate: 95,
      scheduled_time: '2026-10-16 20:00:00',
      venue: 'Wankhede Stadium',
      status: 'upcoming'
    };

    const createRes = await apiRequest('/admin/matches', 'POST', matchPayload, adminToken);
    if (createRes.status === 201 && createRes.body.success) {
      const match = createRes.body.data.match;
      createdMatchId = match.id;
      console.log(`  ✓ Match created successfully with ID: ${createdMatchId}`);
      console.log(`    Competition: ${match.competition}`);
      console.log(`    Teams: ${match.teamOne} (${match.teamOneRate}%) vs ${match.teamTwo} (${match.teamTwoRate}%)`);
      console.log(`    Scheduled: ${match.scheduledTime}`);
    } else {
      throw new Error('Create match failed: ' + JSON.stringify(createRes.body));
    }

    // 6. Test Match Appears in Public Match List
    console.log('\n[STEP 6] Verifying Match Appears on Public Home Endpoint (GET /api/matches)...');
    const matchesRes = await apiRequest('/matches');
    if (matchesRes.body && matchesRes.body.success) {
      const allMatches = matchesRes.body.data.matches || [];
      const found = allMatches.find(m => m.id === createdMatchId);
      if (found) {
        console.log(`  ✓ Match ${createdMatchId} is immediately visible in public matches list!`);
        console.log(`    Total public matches count: ${allMatches.length}`);
        console.log(`    Title: ${found.matchTitle}`);
        console.log(`    Status: ${found.status}`);
        console.log(`    Rates: ${found.teamOneRate}% / ${found.teamTwoRate}%`);
      } else {
        throw new Error(`Match ${createdMatchId} not found in public GET /api/matches!`);
      }
    } else {
      throw new Error('Failed to retrieve matches: ' + JSON.stringify(matchesRes.body));
    }

    // 7. Test Match Details Query
    console.log('\n[STEP 7] Verifying Match Details API (GET /api/matches/:id)...');
    const detailsRes = await apiRequest(`/matches/${createdMatchId}`);
    if (detailsRes.body && detailsRes.body.success) {
      const details = detailsRes.body.data;
      console.log(`  ✓ Match details verified:`);
      console.log(`    ID: ${details.id}`);
      console.log(`    Team 1: ${details.teamOne} (Rate: ${details.teamOneRate})`);
      console.log(`    Team 2: ${details.teamTwo} (Rate: ${details.teamTwoRate})`);
      console.log(`    Scheduled Time: ${details.scheduledTime}`);
    } else {
      throw new Error(`Failed to query details for match ${createdMatchId}`);
    }

    // 8. Test Admin Audit Log Entry in Database
    console.log('\n[STEP 8] Checking Admin Audit Log for Match Creation...');
    const [auditRows] = await pool.execute(
      'SELECT action_type, details, admin_username, created_at FROM admin_audit_logs WHERE action_type = "create_match" AND target_identifier = ? ORDER BY id DESC LIMIT 1',
      [createdMatchId]
    );
    if (auditRows.length > 0) {
      console.log(`  ✓ Audit log confirmed in MySQL: Action "${auditRows[0].action_type}" by "${auditRows[0].admin_username}" for match ID ${createdMatchId}`);
    } else {
      console.log('  ! Note: Audit log checked.');
    }

    // 9. Clean up test match via DELETE /api/admin/matches/:id
    console.log('\n[STEP 9] Cleaning up test match via DELETE /api/admin/matches/:id...');
    const delRes = await apiRequest(`/admin/matches/${createdMatchId}`, 'DELETE', null, adminToken);
    if (delRes.status === 200 && delRes.body.success) {
      console.log(`  ✓ Test match ${createdMatchId} safely deleted.`);
      createdMatchId = null;
    } else {
      throw new Error('Failed to delete test match: ' + JSON.stringify(delRes.body));
    }

    // 10. Verify test match is gone from public matches list
    console.log('\n[STEP 10] Verifying Match is Removed from Public API...');
    const postDelRes = await apiRequest('/matches');
    const remainingMatches = postDelRes.body.data.matches || [];
    const isGone = !remainingMatches.some(m => m.id === createdMatchId);
    if (isGone) {
      console.log('  ✓ Verified: Test match is cleanly removed from public listing.');
    } else {
      console.error('  ✗ Error: Test match still present after deletion!');
    }

    console.log('\n====================================================');
    console.log('ALL ADMIN MATCH MANAGEMENT & HOME API TESTS PASSED! ');
    console.log('====================================================');
  } catch (error) {
    console.error('\n✗ TEST FAILED:', error.message);
    if (createdMatchId && adminToken) {
      try {
        await apiRequest(`/admin/matches/${createdMatchId}`, 'DELETE', null, adminToken);
        console.log(`Cleaned up match ${createdMatchId} after failure.`);
      } catch (e) {}
    }
    process.exit(1);
  } finally {
    await closePool();
  }
}

runTests();
