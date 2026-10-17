/**
 * DADDY TOSS BOOK - Immutable Username Verification Test Suite
 * 
 * Validates:
 * 1. UI Markup: Username field is read-only with lock badge and helper text
 * 2. CSS Styles: .form-control[readonly] communicates non-editable state with not-allowed cursor
 * 3. Case 1: Updating Full Name succeeds while username is unchanged
 * 4. Case 2: Updating Phone Number succeeds while username is unchanged
 * 5. Case 3: Submitting payload containing original username works normally
 * 6. Case 4: Submitting a modified username does NOT change the username in MySQL
 * 7. Case 5: Manipulating user ID in payload is blocked (target derived from token)
 * 8. Case 6: Submitting only a modified username is rejected with HTTP 400 IMMUTABLE_FIELD
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { getPool, closePool } = require('../backend/src/config/db');

let passed = 0;
let failed = 0;

function logPass(msg) {
  console.log(`  [PASS] ${msg}`);
  passed++;
}

function logFail(msg, err) {
  console.error(`  [FAIL] ${msg}`);
  if (err) console.error('        ', err.message || err);
  failed++;
}

function makeRequest(method, pathUrl, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: pathUrl,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(rawData);
        } catch (e) {
          json = { raw: rawData };
        }
        resolve({ status: res.statusCode, data: json });
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
  console.log('====================================================');
  console.log('  DADDY TOSS BOOK — IMMUTABLE USERNAME TEST SUITE');
  console.log('====================================================\n');

  const root = path.join(__dirname, '..');

  // --- SECTION 1: UI & MARKUP AUDIT ---
  console.log('--- 1. Frontend UI & Markup Verification ---');
  const profileHtml = fs.readFileSync(path.join(root, 'frontend', 'pages', 'profile.html'), 'utf8');

  try {
    assert.ok(profileHtml.includes('id="edit-username-input"'), 'Edit username input element exists');
    assert.ok(profileHtml.includes('readonly'), 'Username input has readonly attribute');
    assert.ok(profileHtml.includes('aria-readonly="true"'), 'Username input has aria-readonly attribute');
    assert.ok(profileHtml.includes('Username cannot be changed.'), 'Helper text "Username cannot be changed." is visible');
    assert.ok(profileHtml.includes('input-lock-badge'), 'Lock badge markup is present');
    logPass('Profile UI modal markup contains read-only username with lock icon and helper text');
  } catch (err) {
    logFail('Profile UI modal markup verification failed', err);
  }

  // --- SECTION 2: CSS STYLES AUDIT ---
  console.log('\n--- 2. CSS Read-Only Styling Verification ---');
  const componentsCss = fs.readFileSync(path.join(root, 'frontend', 'css', 'components.css'), 'utf8');

  try {
    assert.ok(componentsCss.includes('.form-control[readonly]'), '.form-control[readonly] selector defined');
    assert.ok(componentsCss.includes('cursor: not-allowed'), 'Readonly input has cursor: not-allowed');
    assert.ok(componentsCss.includes('.input-readonly-wrap'), '.input-readonly-wrap defined');
    assert.ok(componentsCss.includes('.input-lock-badge'), '.input-lock-badge defined');
    logPass('CSS rules enforce not-allowed cursor and lock badge styling for read-only controls');
  } catch (err) {
    logFail('CSS styling verification failed', err);
  }

  // --- SECTION 3: BACKEND API RULES ENFORCEMENT ---
  console.log('\n--- 3. Backend API Username Immutability & Security ---');
  const pool = getPool();
  const timestamp = Date.now();
  const initialUsername = `user_fixed_${timestamp}`;
  const initialPassword = 'SecurePassword123!';
  let authToken = null;
  let testUserId = null;

  try {
    // 3.1 Provision an account directly in MySQL for this test
    const { hashPassword } = require('../backend/src/utils/crypto');
    const { randomUUID } = require('crypto');
    const pHash = await hashPassword(initialPassword);
    const userUuid = randomUUID();

    const [insertUser] = await pool.query(
      'INSERT INTO users (uuid, full_name, username, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userUuid, 'Original Name', initialUsername, `fixed_${timestamp}@example.com`, '+91 98765 00000', pHash, 'user', 'active']
    );
    testUserId = insertUser.insertId;

    await pool.query(
      'INSERT INTO wallets (user_id, available_balance, exposure_balance) VALUES (?, 1000.00, 0.00)',
      [testUserId]
    );

    // Login to obtain JWT
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      identifier: initialUsername,
      password: initialPassword
    });
    assert.strictEqual(loginRes.status, 200);
    authToken = loginRes.data.token || loginRes.data.data.token;
    logPass(`Created test user with permanent username "@${initialUsername}" and obtained auth session`);

    // Case 1: Update Full Name only
    const updateNameRes = await makeRequest('PUT', '/api/auth/profile', {
      fullName: 'Updated Full Name'
    }, authToken);
    assert.strictEqual(updateNameRes.status, 200);
    assert.strictEqual(updateNameRes.data.user.fullName, 'Updated Full Name');
    assert.strictEqual(updateNameRes.data.user.username, initialUsername);
    logPass('Case 1: User saves a new Full Name without changing the username -> Success');

    // Case 2: Update Phone Number
    const updatePhoneRes = await makeRequest('PUT', '/api/auth/profile', {
      phone: '+91 91234 56789'
    }, authToken);
    assert.strictEqual(updatePhoneRes.status, 200);
    assert.strictEqual(updatePhoneRes.data.user.phone, '+91 91234 56789');
    assert.strictEqual(updatePhoneRes.data.user.username, initialUsername);
    logPass('Case 2: User updates Phone Number -> Success');

    // Case 3: Submit payload containing original username
    const updateWithOrigRes = await makeRequest('PUT', '/api/auth/profile', {
      fullName: 'Name Three',
      username: initialUsername,
      phone: '+91 99999 88888'
    }, authToken);
    assert.strictEqual(updateWithOrigRes.status, 200);
    assert.strictEqual(updateWithOrigRes.data.user.fullName, 'Name Three');
    assert.strictEqual(updateWithOrigRes.data.user.username, initialUsername);
    logPass('Case 3: User submits profile request containing original username -> Success, changes applied');

    // Case 4: Attacker attempts to change username by passing a modified username
    const updateModifiedUserRes = await makeRequest('PUT', '/api/auth/profile', {
      fullName: 'Attempted Hijack',
      username: 'hacked_username_999'
    }, authToken);
    assert.strictEqual(updateModifiedUserRes.status, 200);
    // Username in response must remain initialUsername
    assert.strictEqual(updateModifiedUserRes.data.user.username, initialUsername);

    // Verify in database that username strictly remains initialUsername
    const [dbUser] = await pool.query('SELECT username, full_name FROM users WHERE id = ?', [testUserId]);
    assert.strictEqual(dbUser[0].username, initialUsername, 'MySQL username strictly remains initialUsername');
    assert.strictEqual(dbUser[0].full_name, 'Attempted Hijack');
    logPass('Case 4: User attempts to submit a different username -> Username in MySQL strictly remains unchanged');

    // Case 5: User ID tampering / IDOR attempt
    const idorRes = await makeRequest('PUT', '/api/auth/profile', {
      id: 1,
      userId: 1,
      fullName: 'IDOR Target'
    }, authToken);
    assert.strictEqual(idorRes.status, 200);
    // Verified user 1 was NOT modified
    const [rootUser] = await pool.query('SELECT id, full_name, username FROM users WHERE id = 1');
    if (rootUser.length > 0) {
      assert.notStrictEqual(rootUser[0].full_name, 'IDOR Target');
    }
    logPass('Case 5: Target account is derived strictly from JWT session; client-injected IDs are ignored');

    // Case 6: Submitting only a modified username is rejected
    const onlyModifiedUserRes = await makeRequest('PUT', '/api/auth/profile', {
      username: 'illegal_change'
    }, authToken);
    assert.strictEqual(onlyModifiedUserRes.status, 400);
    assert.strictEqual(onlyModifiedUserRes.data.error.code, 'IMMUTABLE_FIELD');
    assert.strictEqual(onlyModifiedUserRes.data.error.message, 'Username cannot be changed.');
    logPass('Case 6: Submitting only a modified username is rejected with HTTP 400 IMMUTABLE_FIELD');

  } catch (err) {
    logFail('Backend API validation error', err);
  } finally {
    // Cleanup test user
    if (testUserId) {
      await pool.query('DELETE FROM wallets WHERE user_id = ?', [testUserId]).catch(() => {});
      await pool.query('DELETE FROM users WHERE id = ?', [testUserId]).catch(() => {});
    }
    await closePool();
  }

  console.log('\n====================================================');
  console.log(`IMMUTABLE USERNAME TEST RESULTS: ${passed} / ${passed + failed} PASSED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
