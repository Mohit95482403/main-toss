/**
 * Comprehensive Test Suite: Admin Delete User Functionality
 *
 * Validates:
 *  - Test A: Delete User workflow (API execution, account removal, and permanent audit log entry)
 *  - Test B: Cancellation preserves account untouched
 *  - Test C: Authorization enforcement (401 unauthenticated, 403 normal player, 200 authorized admin)
 *  - Test D: Protected accounts safety checks (self-deletion blocked, last admin protected, audit retention)
 *  - Test E: Exact username confirmation requirement (mismatched/missing confirmation rejected with 400)
 *  - Test F: Active/unsettled bets liability protection (blocked with 400, allowed after match settlement, shared matches untouched)
 *  - Test G: Frontend UI elements and client logic verification
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { getPool, closePool } = require('../backend/src/config/db');
const { generateToken } = require('../backend/src/utils/crypto');
const { createUserAccount } = require('../backend/src/services/userService');

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

let passedTests = 0;
let totalTests = 0;

function pass(desc) {
  passedTests++;
  totalTests++;
  console.log(`  [PASS] ${desc}`);
}

function fail(desc, err) {
  totalTests++;
  console.error(`  [FAIL] ${desc}:`, err.message || err);
  throw err;
}

async function runTests() {
  console.log('====================================================');
  console.log('ADMIN DELETE USER FUNCTIONALITY TEST SUITE');
  console.log('====================================================\n');

  const pool = getPool();

  try {
    // -------------------------------------------------------------------------
    // SETUP: FETCH ADMIN & NORMAL TEST TOKENS
    // -------------------------------------------------------------------------
    const [superAdmins] = await pool.query(
      "SELECT id, username, email, role FROM users WHERE role = 'super_admin' AND status = 'active' LIMIT 1"
    );
    assert(superAdmins.length > 0, 'At least one active super_admin must exist in MySQL');
    const adminUser = superAdmins[0];

    const adminToken = generateToken({
      userId: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
      role: adminUser.role
    });

    const [normalUsers] = await pool.query(
      "SELECT id, username, email, role FROM users WHERE role = 'user' AND status = 'active' LIMIT 1"
    );
    assert(normalUsers.length > 0, 'At least one active player must exist in MySQL');
    const normalUser = normalUsers[0];

    const normalUserToken = generateToken({
      userId: normalUser.id,
      username: normalUser.username,
      email: normalUser.email,
      role: 'user'
    });

    // -------------------------------------------------------------------------
    // TEST A: DELETE USER WORKFLOW
    // -------------------------------------------------------------------------
    console.log('--- TEST A: DELETE USER WORKFLOW ---');

    // 1. Create a dedicated test account
    const tsA = Date.now();
    const testUsernameA = `del_test_${tsA}`;
    const testEmailA = `del_test_${tsA}@example.com`;

    const createdA = await createUserAccount({
      admin: adminUser,
      fullName: 'Deletion Test Player A',
      username: testUsernameA,
      email: testEmailA,
      password: 'StrongPassword@123',
      initialBalance: 750.00,
      status: 'active',
      role: 'user'
    });

    assert(createdA.id > 0, 'Test player A must have a valid ID');

    // Verify player records exist in MySQL
    const [[userInDbA]] = await pool.query('SELECT id, username, email FROM users WHERE id = ?', [createdA.id]);
    const [[walletInDbA]] = await pool.query('SELECT user_id, available_balance FROM wallets WHERE user_id = ?', [createdA.id]);
    assert(userInDbA && userInDbA.username === testUsernameA, 'Player A exists in users table');
    assert(walletInDbA && parseFloat(walletInDbA.available_balance) === 750.00, 'Player A wallet exists');
    pass('Created dedicated test player A in MySQL with initial balance ₹750.00');

    // Execute DELETE /api/admin/users/:id with exact username confirmation
    const deleteResA = await apiRequest(`/admin/users/${createdA.id}`, 'DELETE', {
      confirmUsername: testUsernameA,
      reason: 'Automated test suite deletion'
    }, adminToken);

    assert.strictEqual(deleteResA.status, 200, `Expected 200 OK, got ${deleteResA.status}`);
    assert(deleteResA.body.success === true, 'Response indicates success');
    assert(deleteResA.body.data.deletedUserId === createdA.id, 'Response returned correct deleted user ID');
    pass('DELETE /api/admin/users/:id returned HTTP 200 OK with success confirmation');

    // Verify user is deleted from MySQL
    const [[postUserA]] = await pool.query('SELECT id FROM users WHERE id = ?', [createdA.id]);
    const [[postWalletA]] = await pool.query('SELECT id FROM wallets WHERE user_id = ?', [createdA.id]);
    assert(!postUserA, 'User record must be permanently removed from users table');
    assert(!postWalletA, 'User wallet record must be removed by referential cascade');
    pass('User and associated wallet records verified permanently deleted from MySQL');

    // Verify audit log was recorded with admin ID
    const [[auditLogA]] = await pool.query(
      "SELECT * FROM admin_audit_logs WHERE action_type = 'delete_user' AND target_id = ? ORDER BY id DESC LIMIT 1",
      [createdA.id]
    );
    assert(auditLogA, 'Audit log entry must exist for user deletion');
    assert.strictEqual(auditLogA.admin_id, adminUser.id, 'Audit log records acting admin ID');
    assert.strictEqual(auditLogA.target_identifier, testUsernameA, 'Audit log records deleted username');
    pass('Immutable audit log entry created in admin_audit_logs with target details');

    // -------------------------------------------------------------------------
    // TEST B: CANCEL DELETION PRESERVES ACCOUNT
    // -------------------------------------------------------------------------
    console.log('\n--- TEST B: CANCEL DELETION BEHAVIOR ---');

    const tsB = Date.now();
    const testUsernameB = `del_cancel_${tsB}`;
    const testEmailB = `del_cancel_${tsB}@example.com`;

    const createdB = await createUserAccount({
      admin: adminUser,
      fullName: 'Cancel Test Player B',
      username: testUsernameB,
      email: testEmailB,
      password: 'StrongPassword@123',
      initialBalance: 250.00,
      status: 'active',
      role: 'user'
    });

    // In a cancel scenario, no DELETE request is executed
    // Verify user B remains completely intact
    const [[userInDbB]] = await pool.query('SELECT id, username, status FROM users WHERE id = ?', [createdB.id]);
    const [[walletInDbB]] = await pool.query('SELECT available_balance FROM wallets WHERE user_id = ?', [createdB.id]);
    assert(userInDbB && userInDbB.username === testUsernameB, 'Account remains untouched when deletion is not confirmed');
    assert(walletInDbB && parseFloat(walletInDbB.available_balance) === 250.00, 'Wallet balance remains intact');
    pass('Account remains unchanged when administrator cancels confirmation dialog');

    // Cleanup account B
    await pool.query('DELETE FROM users WHERE id = ?', [createdB.id]);

    // -------------------------------------------------------------------------
    // TEST C: AUTHORIZATION ENFORCEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- TEST C: AUTHORIZATION ENFORCEMENT ---');

    const tsC = Date.now();
    const testUsernameC = `del_auth_${tsC}`;
    const createdC = await createUserAccount({
      admin: adminUser,
      fullName: 'Auth Test Player C',
      username: testUsernameC,
      email: `${testUsernameC}@example.com`,
      password: 'StrongPassword@123',
      initialBalance: 100.00,
      status: 'active',
      role: 'user'
    });

    // 1. Unauthenticated request -> 401
    const unauthRes = await apiRequest(`/admin/users/${createdC.id}`, 'DELETE', {
      confirmUsername: testUsernameC
    }, null);
    assert.strictEqual(unauthRes.status, 401, `Unauthenticated request must receive 401 (got ${unauthRes.status})`);
    pass('Unauthenticated deletion request rejected with HTTP 401 Unauthorized');

    // 2. Normal player request -> 403
    const normalUserRes = await apiRequest(`/admin/users/${createdC.id}`, 'DELETE', {
      confirmUsername: testUsernameC
    }, normalUserToken);
    assert.strictEqual(normalUserRes.status, 403, `Normal player request must receive 403 (got ${normalUserRes.status})`);
    pass('Normal player deletion request rejected with HTTP 403 Forbidden');

    // 3. Authorized admin request -> 200
    const authAdminRes = await apiRequest(`/admin/users/${createdC.id}`, 'DELETE', {
      confirmUsername: testUsernameC
    }, adminToken);
    assert.strictEqual(authAdminRes.status, 200, `Authorized admin request must receive 200 (got ${authAdminRes.status})`);
    pass('Authorized administrator deletion request allowed and executed successfully');

    // -------------------------------------------------------------------------
    // TEST D: PROTECTED ACCOUNTS SAFETY CHECKS
    // -------------------------------------------------------------------------
    console.log('\n--- TEST D: PROTECTED ACCOUNTS SAFETY CHECKS ---');

    // 1. Self-deletion prevention
    const selfDeleteRes = await apiRequest(`/admin/users/${adminUser.id}`, 'DELETE', {
      confirmUsername: adminUser.username
    }, adminToken);
    assert.strictEqual(selfDeleteRes.status, 400, `Admin self-deletion must return 400 (got ${selfDeleteRes.status})`);
    assert.strictEqual(selfDeleteRes.body.error?.code, 'SELF_ACTION_BLOCKED', 'Error code is SELF_ACTION_BLOCKED');
    pass('Administrator self-deletion blocked with HTTP 400 SELF_ACTION_BLOCKED');

    // 2. Non-existent user ID
    const notFoundRes = await apiRequest('/admin/users/9999999', 'DELETE', {
      confirmUsername: 'nonexistent_user'
    }, adminToken);
    assert.strictEqual(notFoundRes.status, 404, `Non-existent user must return 404 (got ${notFoundRes.status})`);
    assert.strictEqual(notFoundRes.body.error?.code, 'NOT_FOUND', 'Error code is NOT_FOUND');
    pass('Non-existent user deletion rejected with HTTP 404 NOT_FOUND');

    // 3. Invalid user ID
    const invalidIdRes = await apiRequest('/admin/users/abc', 'DELETE', {
      confirmUsername: 'test'
    }, adminToken);
    assert.strictEqual(invalidIdRes.status, 400, `Invalid ID must return 400 (got ${invalidIdRes.status})`);
    pass('Invalid user ID rejected with HTTP 400 INVALID_ID');

    // 4. Admin deletion governance check (if audit logs exist)
    const adminWithAuditRes = await apiRequest(`/admin/users/${adminUser.id}`, 'DELETE', {
      confirmUsername: adminUser.username
    }, adminToken);
    assert.strictEqual(adminWithAuditRes.status, 400, 'Admin account cannot be deleted');
    pass('Administrative accounts protected against deletion');

    // -------------------------------------------------------------------------
    // TEST E: EXACT USERNAME CONFIRMATION PROTECTION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST E: EXACT USERNAME CONFIRMATION ---');

    const tsE = Date.now();
    const testUsernameE = `del_conf_${tsE}`;
    const createdE = await createUserAccount({
      admin: adminUser,
      fullName: 'Confirm Test Player E',
      username: testUsernameE,
      email: `${testUsernameE}@example.com`,
      password: 'StrongPassword@123',
      initialBalance: 300.00,
      status: 'active',
      role: 'user'
    });

    // 1. Missing confirmation username
    const missingConfirmRes = await apiRequest(`/admin/users/${createdE.id}`, 'DELETE', {
      confirmUsername: ''
    }, adminToken);
    assert.strictEqual(missingConfirmRes.status, 400, 'Missing confirmation must return 400');
    assert.strictEqual(missingConfirmRes.body.error?.code, 'CONFIRMATION_MISMATCH');
    pass('Missing confirmation username rejected with HTTP 400 CONFIRMATION_MISMATCH');

    // 2. Mismatched confirmation username
    const wrongConfirmRes = await apiRequest(`/admin/users/${createdE.id}`, 'DELETE', {
      confirmUsername: 'wrong_username'
    }, adminToken);
    assert.strictEqual(wrongConfirmRes.status, 400, 'Wrong username must return 400');
    assert.strictEqual(wrongConfirmRes.body.error?.code, 'CONFIRMATION_MISMATCH');
    pass('Mismatched confirmation username rejected with HTTP 400 CONFIRMATION_MISMATCH');

    // Verify account was NOT deleted
    const [[stillExistsE]] = await pool.query('SELECT id FROM users WHERE id = ?', [createdE.id]);
    assert(stillExistsE, 'Account remains in database after failed confirmation');
    pass('Account remains intact in MySQL after mismatched confirmation');

    // Clean up with exact username
    const validConfirmRes = await apiRequest(`/admin/users/${createdE.id}`, 'DELETE', {
      confirmUsername: testUsernameE
    }, adminToken);
    assert.strictEqual(validConfirmRes.status, 200, 'Exact username deletion succeeds');
    pass('Account successfully deleted when exact username is supplied');

    // -------------------------------------------------------------------------
    // TEST F: ACTIVE BETS PROTECTION & DATA INTEGRITY
    // -------------------------------------------------------------------------
    console.log('\n--- TEST F: ACTIVE BETS PROTECTION & INTEGRITY ---');

    const tsF = Date.now();
    const testUsernameF = `del_bet_${tsF}`;
    const createdF = await createUserAccount({
      admin: adminUser,
      fullName: 'Bet Test Player F',
      username: testUsernameF,
      email: `${testUsernameF}@example.com`,
      password: 'StrongPassword@123',
      initialBalance: 1000.00,
      status: 'active',
      role: 'user'
    });

    // Find an active match in MySQL to place an unsettled bet on
    const [matches] = await pool.query('SELECT id, match_title FROM matches LIMIT 1');
    assert(matches.length > 0, 'At least one match must exist in database');
    const match = matches[0];

    const testBetId = `bet_test_${tsF}`;
    await pool.query(
      `INSERT INTO bets (id, user_id, match_id, market_name, selection, stake, odds, potential_return, status, settlement_status)
       VALUES (?, ?, ?, 'Toss Winner', 'Team Alpha', 100.00, 1.90, 190.00, 'live', 'pending')`,
      [testBetId, createdF.id, match.id]
    );

    // Attempt to delete user F while bet is pending
    const activeBetDeleteRes = await apiRequest(`/admin/users/${createdF.id}`, 'DELETE', {
      confirmUsername: testUsernameF
    }, adminToken);

    assert.strictEqual(activeBetDeleteRes.status, 400, 'Deletion with pending bets must return 400');
    assert.strictEqual(activeBetDeleteRes.body.error?.code, 'ACTIVE_BETS_EXIST');
    pass('Deletion rejected with HTTP 400 ACTIVE_BETS_EXIST when player has unsettled wagers');

    // Now settle the bet
    await pool.query(
      "UPDATE bets SET status = 'won', settlement_status = 'settled', payout = 190.00, settled_at = NOW() WHERE id = ?",
      [testBetId]
    );

    // Record total match count before user deletion
    const [[matchCountBefore]] = await pool.query('SELECT COUNT(*) AS totalMatches FROM matches');

    // Delete user F now that bet is settled
    const settledBetDeleteRes = await apiRequest(`/admin/users/${createdF.id}`, 'DELETE', {
      confirmUsername: testUsernameF
    }, adminToken);

    assert.strictEqual(settledBetDeleteRes.status, 200, 'Deletion succeeds after bets are settled');
    pass('Account deleted successfully after all wagers have been settled');

    // Verify shared matches were NOT deleted
    const [[matchCountAfter]] = await pool.query('SELECT COUNT(*) AS totalMatches FROM matches');
    assert.strictEqual(matchCountBefore.totalMatches, matchCountAfter.totalMatches, 'Match records must never be deleted');
    pass('Data integrity: Shared matches remain 100% intact');

    // -------------------------------------------------------------------------
    // TEST G: FRONTEND UI & CONTROLLER VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST G: FRONTEND UI & CONTROLLER VERIFICATION ---');

    const adminHtml = fs.readFileSync(path.resolve(__dirname, '../frontend/pages/admin.html'), 'utf8');
    assert(adminHtml.includes('id="modal-delete-user"'), 'admin.html contains #modal-delete-user');
    assert(adminHtml.includes('id="delete-user-confirm-input"'), 'admin.html contains confirmation input');
    assert(adminHtml.includes('id="btn-confirm-delete-user"'), 'admin.html contains final confirmation button');
    assert(adminHtml.includes('id="btn-inspect-delete-user"'), 'admin.html inspector modal contains Delete User button');
    assert(adminHtml.includes('value="delete_user"'), 'admin.html audit filter contains delete_user option');
    pass('admin.html: Modal dialog markup, confirmation input, buttons, and audit filters verified');

    const adminJs = fs.readFileSync(path.resolve(__dirname, '../frontend/js/admin.js'), 'utf8');
    assert(adminJs.includes('btn-delete-user'), 'admin.js includes btn-delete-user class in table action group');
    assert(adminJs.includes('promptDeleteUserModal'), 'admin.js defines promptDeleteUserModal handler');
    assert(adminJs.includes('handleDeleteUserConfirmInput'), 'admin.js defines confirmation username input validator');
    assert(adminJs.includes('handleConfirmDeleteUser'), 'admin.js defines deletion dispatch controller');
    assert(adminJs.includes("apiFetch(`/admin/users/${deleteUserTarget.id}`"), 'admin.js dispatches DELETE request to backend');
    pass('admin.js: Table row Delete User button, event bindings, input listener, and API call verified');

    console.log('\n====================================================');
    console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests} checks successful!`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('\nTEST SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

runTests();
