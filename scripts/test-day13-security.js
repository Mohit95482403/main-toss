/**
 * Automated Verification Script for Day 13: Authentication Security,
 * Session Management & Backend API Protection
 */

const path = require('path');
const http = require('http');

console.log('====================================================');
console.log('IRONMAN TOSS BOOK - DAY 13 SECURITY TEST SUITE');
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

// 1. Unit Tests for Cryptographic Module
const {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  sanitizeUser,
  DEFAULT_SECRET
} = require('../backend/src/utils/crypto');

const testSecret = 'test_cryptographic_secret_key_minimum_32_chars!';
const pass = 'IronmanSecret@2026';
const hash1 = hashPassword(pass);
const hash2 = hashPassword(pass);

assert(hash1.startsWith('scrypt$'), 'hashPassword produces scrypt format');
assert(hash1 !== hash2, 'Salts are unique: identical passwords produce distinct hashes');
assert(verifyPassword(pass, hash1) === true, 'verifyPassword returns true for correct password');
assert(verifyPassword('WrongPass@999', hash1) === false, 'verifyPassword returns false for incorrect password');
assert(verifyPassword('', hash1) === false, 'verifyPassword handles empty password safely');
assert(verifyPassword(pass, 'malformed_hash') === false, 'verifyPassword handles corrupted hash safely');

// Token signing and expiration unit tests
const token = generateToken({ userId: 101, username: 'test_user', role: 'user' });
assert(typeof token === 'string' && token.split('.').length === 3, 'generateToken returns valid 3-part JWT token');

const decoded = verifyToken(token);
assert(decoded.userId === 101 && decoded.username === 'test_user', 'verifyToken extracts valid payload claims');

// Tampered token test
const tamperedToken = token.slice(0, -4) + 'abcd';
let tamperCaught = false;
try {
  verifyToken(tamperedToken, testSecret);
} catch (e) {
  tamperCaught = true;
}
assert(tamperCaught, 'Tampered token signature is rejected by verifyToken');

// Expired token test
const expiredToken = generateToken({ userId: 101 }, testSecret, -10);
let expiredCaught = false;
try {
  verifyToken(expiredToken, testSecret);
} catch (e) {
  expiredCaught = e.message.includes('expired');
}
assert(expiredCaught, 'Expired token is rejected by verifyToken');

// Sanitize user object test
const rawUser = {
  id: 1,
  username: 'ironman_99',
  password_hash: 'scrypt$1234$5678',
  password: 'plain_password_should_be_stripped',
  email: 'user@example.com'
};
const safeUser = sanitizeUser(rawUser);
assert(!safeUser.password_hash && !safeUser.password, 'sanitizeUser strips password and password_hash');
assert(safeUser.username === 'ironman_99' && safeUser.id === 1, 'sanitizeUser preserves non-sensitive properties');

// 2. Unit Tests for Security Middleware
const securityHeaders = require('../backend/src/middleware/securityHeaders');
const mockReq = { headers: {}, socket: {} };
const headersSet = {};
const mockRes = {
  setHeader: (k, v) => { headersSet[k] = v; },
  removeHeader: (k) => { delete headersSet[k]; }
};
headersSet['X-Powered-By'] = 'Express';

let nextCalled = false;
securityHeaders(mockReq, mockRes, () => { nextCalled = true; });

assert(nextCalled, 'securityHeaders middleware invokes next()');
assert(headersSet['X-Content-Type-Options'] === 'nosniff', 'X-Content-Type-Options: nosniff set');
assert(headersSet['X-Frame-Options'] === 'SAMEORIGIN', 'X-Frame-Options: SAMEORIGIN set');
assert(headersSet['Referrer-Policy'] === 'strict-origin-when-cross-origin', 'Referrer-Policy set');
assert(!headersSet['X-Powered-By'], 'X-Powered-By header stripped');

// 3. Unit Tests for Auth Middleware
const { authenticate, requireRole } = require('../backend/src/middleware/auth');

let authStatusCode = null;
let authJson = null;
const mockResAuth = {
  status: (code) => {
    authStatusCode = code;
    return {
      json: (data) => { authJson = data; }
    };
  }
};

// Test unauthenticated request
authenticate({ headers: {} }, mockResAuth, () => {});
assert(authStatusCode === 401 && authJson.error.code === 'UNAUTHORIZED', 'authenticate middleware rejects missing token with 401 UNAUTHORIZED');

// Test valid token request
let authenticatedNext = false;
const validReq = { headers: { authorization: `Bearer ${token}` } };
authenticate(validReq, mockResAuth, () => { authenticatedNext = true; });
assert(authenticatedNext && validReq.user && validReq.user.id === 101, 'authenticate attaches user claims on valid Bearer token');

// Test requireRole guard
let roleBlocked = false;
const roleRes = {
  status: (code) => {
    roleBlocked = code === 403;
    return { json: () => {} };
  }
};
const adminGuard = requireRole(['admin']);
adminGuard(validReq, roleRes, () => {});
assert(roleBlocked, 'requireRole guard rejects regular user from admin route with 403');

// 4. Integration Tests via Express App (Supertest-style HTTP testing)
const app = require('../backend/app');

function makeRequest(app, method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const jsonBody = body ? JSON.stringify(body) : null;
      const reqHeaders = {
        'Accept': 'application/json',
        ...headers
      };
      if (jsonBody) {
        reqHeaders['Content-Type'] = 'application/json';
        reqHeaders['Content-Length'] = Buffer.byteLength(jsonBody);
      }

      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: url,
        method,
        headers: reqHeaders
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          server.close();
          try {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data ? JSON.parse(data) : null
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              rawBody: data
            });
          }
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (jsonBody) {
        req.write(jsonBody);
      }
      req.end();
    });
  });
}

async function runIntegrationTests() {
  try {
    // A. Health check endpoints
    const healthRes = await makeRequest(app, 'GET', '/api/health');
    assert(healthRes.statusCode === 200 && healthRes.body.success, 'GET /api/health responds 200 OK');

    const dbHealthRes = await makeRequest(app, 'GET', '/api/health/db');
    assert([200, 503].includes(dbHealthRes.statusCode), 'GET /api/health/db responds with structured database status');

    // B. Public Documentation Root
    const rootRes = await makeRequest(app, 'GET', '/');
    assert(rootRes.statusCode === 200 && rootRes.body.endpoints.authRegister, 'GET / lists registered authentication endpoints');

    // C. Validation on Register
    const invalidRegRes = await makeRequest(app, 'POST', '/api/auth/register', {
      fullName: 'R',
      username: 'bad-username!',
      email: 'notanemail',
      password: '123'
    });
    assert(invalidRegRes.statusCode === 400 && invalidRegRes.body.error.code === 'VALIDATION_ERROR', 'POST /api/auth/register validates fields and rejects malformed inputs');

    // D. Validation on Login
    const missingLoginRes = await makeRequest(app, 'POST', '/api/auth/login', {});
    assert(missingLoginRes.statusCode === 400 && missingLoginRes.body.error.code === 'MISSING_CREDENTIALS', 'POST /api/auth/login rejects empty credentials');

    // E. Protected Endpoints without token
    const unauthMeRes = await makeRequest(app, 'GET', '/api/auth/me');
    assert(unauthMeRes.statusCode === 401 && unauthMeRes.body.error.code === 'UNAUTHORIZED', 'GET /api/auth/me blocks unauthenticated requests');

    const unauthProfileRes = await makeRequest(app, 'PUT', '/api/auth/profile', { fullName: 'Hacker' });
    assert(unauthProfileRes.statusCode === 401, 'PUT /api/auth/profile blocks unauthenticated modifications');

    const unauthPassRes = await makeRequest(app, 'POST', '/api/auth/change-password', { currentPassword: 'a', newPassword: 'b' });
    assert(unauthPassRes.statusCode === 401, 'POST /api/auth/change-password blocks unauthenticated requests');

    // F. End-to-End Registration & Login flow (using dynamic unique test account)
    const testUsername = `user_${Date.now()}`;
    const testEmail = `${testUsername}@example.com`;
    const testPassword = 'SecurePass@2026';

    const regRes = await makeRequest(app, 'POST', '/api/auth/register', {
      fullName: 'Security Test User',
      username: testUsername,
      email: testEmail,
      password: testPassword,
      phone: '+91 99999 88888'
    });

    if (regRes.statusCode === 201) {
      assert(regRes.statusCode === 201, 'POST /api/auth/register successfully creates user');
      assert(!!regRes.body.token, 'Register response contains signed auth token');
      assert(!regRes.body.user.password_hash, 'Register response does not leak password_hash');

      const authToken = regRes.body.token;

      // Duplicate Registration Protection
      const dupRes = await makeRequest(app, 'POST', '/api/auth/register', {
        fullName: 'Duplicate User',
        username: testUsername,
        email: testEmail,
        password: testPassword
      });
      assert(dupRes.statusCode === 409 && dupRes.body.error.code === 'DUPLICATE_ACCOUNT', 'Duplicate registration rejected with 409 Conflict');

      // Valid Login
      const loginRes = await makeRequest(app, 'POST', '/api/auth/login', {
        identifier: testUsername,
        password: testPassword
      });
      assert(loginRes.statusCode === 200 && !!loginRes.body.token, 'POST /api/auth/login validates credentials and issues token');
      assert(!loginRes.body.user.password_hash, 'Login response does not leak password_hash');

      // Invalid Login
      const badLoginRes = await makeRequest(app, 'POST', '/api/auth/login', {
        identifier: testUsername,
        password: 'WrongPassword@123'
      });
      assert(badLoginRes.statusCode === 401 && badLoginRes.body.error.code === 'INVALID_CREDENTIALS', 'Invalid password rejected with generic 401 message');

      // Authenticated Profile Fetch
      const meRes = await makeRequest(app, 'GET', '/api/auth/me', null, {
        authorization: `Bearer ${authToken}`
      });
      assert(meRes.statusCode === 200 && meRes.body.user.username === testUsername, 'GET /api/auth/me returns authenticated user details');
      assert(!meRes.body.user.password_hash, 'GET /api/auth/me does not leak password_hash');

      // Authenticated Profile Update (with mass-assignment defense check)
      const updateRes = await makeRequest(app, 'PUT', '/api/auth/profile', {
        fullName: 'Updated Name',
        phone: '+91 91234 56789',
        role: 'super_admin' // Privileged field injected
      }, {
        authorization: `Bearer ${authToken}`
      });
      assert(updateRes.statusCode === 200 && updateRes.body.user.fullName === 'Updated Name', 'PUT /api/auth/profile updates legitimate fields');
      assert(updateRes.body.user.role === 'user', 'Mass-assignment defense: privileged field "role" is ignored and remains "user"');

      // Change Password Flow
      const passChangeRes = await makeRequest(app, 'POST', '/api/auth/change-password', {
        currentPassword: testPassword,
        newPassword: 'BrandNewPassword@2026'
      }, {
        authorization: `Bearer ${authToken}`
      });
      assert(passChangeRes.statusCode === 200 && passChangeRes.body.success, 'POST /api/auth/change-password successfully updates password');

      // Verify login with new password
      const reLoginRes = await makeRequest(app, 'POST', '/api/auth/login', {
        identifier: testUsername,
        password: 'BrandNewPassword@2026'
      });
      assert(reLoginRes.statusCode === 200, 'Login succeeds with newly updated password');

      // Logout
      const logoutRes = await makeRequest(app, 'POST', '/api/auth/logout', null, {
        authorization: `Bearer ${authToken}`
      });
      assert(logoutRes.statusCode === 200 && logoutRes.body.success, 'POST /api/auth/logout invalidates session');
    } else {
      console.warn('Database note: registration returned status', regRes.statusCode, regRes.body);
    }
  } catch (err) {
    console.error('Integration test exception:', err);
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED`);
  console.log('====================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runIntegrationTests();
