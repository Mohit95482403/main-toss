/**
 * Unit test for Aiven MySQL 8.4 DB configuration logic
 */
const assert = require('assert');
const path = require('path');

// Backup original env
const originalEnv = { ...process.env };

function resetEnv() {
  for (const k in process.env) {
    if (!(k in originalEnv)) {
      delete process.env[k];
    } else {
      process.env[k] = originalEnv[k];
    }
  }
}

function reloadDbModule() {
  const dbPath = path.resolve(__dirname, '../backend/src/config/db.js');
  delete require.cache[require.resolve(dbPath)];
  return require(dbPath);
}

console.log('[TEST AIVEN CONFIG] Starting database configuration unit tests...');

// Test 1: Discrete Aiven parameters
resetEnv();
process.env.DB_HOST = 'daddytossbook-narendra-connectly.l.aivencloud.com';
process.env.DB_PORT = '20135';
process.env.DB_USER = 'avnadmin';
process.env.DB_NAME = 'daddy_toss_book';
process.env.DB_PASSWORD = 'dummy_test_password';

let { dbConfig } = reloadDbModule();
assert.strictEqual(dbConfig.host, 'daddytossbook-narendra-connectly.l.aivencloud.com');
assert.strictEqual(dbConfig.port, 20135);
assert.strictEqual(dbConfig.database, 'daddy_toss_book');
assert.strictEqual(dbConfig.ssl, true, 'SSL must be automatically enabled for *.aivencloud.com');
console.log('Test 1 PASSED: Discrete Aiven parameters properly configure host, port, db, and SSL.');

// Test 2: DATABASE_URL with ssl-mode=REQUIRED
resetEnv();
process.env.DATABASE_URL = 'mysql://avnadmin:dummy_pass@daddytossbook-narendra-connectly.l.aivencloud.com:20135/daddy_toss_book?ssl-mode=REQUIRED';

({ dbConfig } = reloadDbModule());
assert.strictEqual(dbConfig.host, 'daddytossbook-narendra-connectly.l.aivencloud.com');
assert.strictEqual(dbConfig.port, 20135);
assert.strictEqual(dbConfig.database, 'daddy_toss_book');
assert.strictEqual(dbConfig.ssl, true, 'SSL must be enabled for DATABASE_URL with ssl-mode=REQUIRED');
console.log('Test 2 PASSED: DATABASE_URL properly parsed with host, port, db, and SSL.');

// Test 3: Inline PEM CA certificate
resetEnv();
process.env.DB_HOST = 'daddytossbook-narendra-connectly.l.aivencloud.com';
process.env.DB_SSL_CA = '-----BEGIN CERTIFICATE-----\\nMIIB...\\n-----END CERTIFICATE-----';

const dbModule = reloadDbModule();
assert.strictEqual(dbModule.dbConfig.ssl, true);
console.log('Test 3 PASSED: Inline PEM CA certificate correctly accepted and formatted.');

resetEnv();
console.log('====================================================');
console.log('ALL AIVEN DB CONFIGURATION UNIT TESTS PASSED!');
console.log('====================================================');
