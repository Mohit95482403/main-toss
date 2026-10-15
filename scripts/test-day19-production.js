/**
 * IRONMAN TOSS BOOK - DAY 19 PRODUCTION READINESS & RELEASE VALIDATION TEST SUITE
 * 
 * Verifies production configuration, environment variable validation,
 * database SSL capability, liveness and readiness probes, security headers,
 * containerization specifications, and graceful shutdown handling.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('IRONMAN TOSS BOOK - DAY 19 RELEASE VALIDATION SUITE');
  console.log('====================================================\n');

  // --- 1. ENVIRONMENT VALIDATOR AUDIT ---
  console.log('--- 1. Environment Validator & Configuration Security ---');
  const envValidatorPath = path.resolve(__dirname, '../backend/src/config/envValidator.js');
  assert(fs.existsSync(envValidatorPath), 'backend/src/config/envValidator.js exists');

  const { validateEnvironment, DEFAULT_INSECURE_SECRET } = require('../backend/src/config/envValidator');
  assert(typeof validateEnvironment === 'function', 'validateEnvironment is an exported function');

  // Test valid development config
  const devCheck = validateEnvironment({
    NODE_ENV: 'development',
    PORT: '5000',
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_NAME: 'ironman_toss_book',
    DB_USER: 'root'
  });
  assert(devCheck.valid === true, 'validateEnvironment approves standard development configuration');

  // Test production rejections
  const prodWeakSecret = validateEnvironment({
    NODE_ENV: 'production',
    PORT: '5000',
    DB_HOST: 'mysql-cluster.internal',
    DB_PORT: '3306',
    DB_NAME: 'ironman_toss_book',
    DB_USER: 'itb_app',
    DB_PASSWORD: 'secure_db_pass_123',
    SESSION_SECRET: DEFAULT_INSECURE_SECRET
  });
  assert(prodWeakSecret.valid === false, 'validateEnvironment rejects default template secret in production');
  assert(
    prodWeakSecret.errors.some(e => e.includes('insecure default template secret')),
    'Rejection error clearly identifies default template secret'
  );

  const prodShortSecret = validateEnvironment({
    NODE_ENV: 'production',
    PORT: '5000',
    DB_HOST: 'mysql-cluster.internal',
    DB_PORT: '3306',
    DB_NAME: 'ironman_toss_book',
    DB_USER: 'itb_app',
    DB_PASSWORD: 'secure_db_pass_123',
    SESSION_SECRET: 'short_secret'
  });
  assert(prodShortSecret.valid === false, 'validateEnvironment rejects secrets under 32 characters in production');

  const prodMissingDbPass = validateEnvironment({
    NODE_ENV: 'production',
    PORT: '5000',
    DB_HOST: 'mysql-cluster.internal',
    DB_PORT: '3306',
    DB_NAME: 'ironman_toss_book',
    DB_USER: 'itb_app',
    DB_PASSWORD: '',
    SESSION_SECRET: 'a_very_long_and_secure_random_production_secret_key_12345'
  });
  assert(prodMissingDbPass.valid === false, 'validateEnvironment requires DB_PASSWORD in production');

  const invalidPortCheck = validateEnvironment({
    PORT: 'invalid_port'
  });
  assert(invalidPortCheck.valid === false, 'validateEnvironment rejects non-numeric PORT');

  // Verify .env.example documentation
  const envExamplePath = path.resolve(__dirname, '../.env.example');
  assert(fs.existsSync(envExamplePath), '.env.example exists in repository root');
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
  assert(envExampleContent.includes('NODE_ENV='), '.env.example documents NODE_ENV');
  assert(envExampleContent.includes('DB_SSL='), '.env.example documents DB_SSL');
  assert(envExampleContent.includes('SESSION_SECRET='), '.env.example documents SESSION_SECRET');
  assert(envExampleContent.includes('TRUST_PROXY='), '.env.example documents TRUST_PROXY');
  assert(envExampleContent.includes('SERVE_STATIC_FRONTEND='), '.env.example documents SERVE_STATIC_FRONTEND');

  // Verify .gitignore coverage
  const gitignorePath = path.resolve(__dirname, '../.gitignore');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  assert(gitignoreContent.includes('.env'), '.gitignore excludes .env files');
  assert(gitignoreContent.includes('*.pem'), '.gitignore excludes *.pem certificate files');
  assert(gitignoreContent.includes('*.key'), '.gitignore excludes *.key private keys');

  // --- 2. DATABASE CONNECTIVITY & SSL READINESS ---
  console.log('\n--- 2. Database Connectivity & SSL/TLS Configuration ---');
  const { testConnection, dbConfig, closePool } = require('../backend/src/config/db');
  assert(typeof testConnection === 'function', 'testConnection is exported by db.js');
  assert(dbConfig !== undefined && typeof dbConfig === 'object', 'dbConfig metadata is exported by db.js');
  assert('ssl' in dbConfig, 'dbConfig exports ssl configuration flag');

  const liveDbStatus = await testConnection();
  assert(liveDbStatus.connected === true, 'MySQL database pool connected and healthy');
  assert(liveDbStatus.status === 'online', 'Database status reports "online"');

  // --- 3. HEALTH CHECKS: LIVENESS & READINESS ---
  console.log('\n--- 3. Health Checks: Liveness & Readiness Probes ---');
  const app = require('../backend/app');
  assert(typeof app === 'function', 'backend/app.js exports Express application');

  // Test server instance for HTTP probes
  const testServer = http.createServer(app);
  await new Promise(resolve => testServer.listen(0, resolve));
  const testPort = testServer.address().port;

  async function makeRequest(pathName, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: testPort,
          path: pathName,
          method: 'GET',
          headers
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            try {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: JSON.parse(data)
              });
            } catch (e) {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                text: data
              });
            }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  // Probe /api/health (Liveness)
  const healthRes = await makeRequest('/api/health');
  assert(healthRes.status === 200, 'GET /api/health returns 200 OK');
  assert(healthRes.body.probe === 'liveness', 'GET /api/health identifies as liveness probe');
  assert(healthRes.body.status === 'healthy', 'Liveness probe status is "healthy"');

  // Probe /api/health/live alias
  const liveRes = await makeRequest('/api/health/live');
  assert(liveRes.status === 200, 'GET /api/health/live returns 200 OK');
  assert(liveRes.body.probe === 'liveness', 'GET /api/health/live identifies as liveness probe');

  // Probe /api/health/db (Readiness)
  const dbHealthRes = await makeRequest('/api/health/db');
  assert(dbHealthRes.status === 200, 'GET /api/health/db returns 200 OK');
  assert(dbHealthRes.body.probe === 'readiness', 'GET /api/health/db identifies as readiness probe');
  assert(dbHealthRes.body.database.status === 'online', 'Readiness probe reports database online');

  // Probe /api/health/ready alias
  const readyRes = await makeRequest('/api/health/ready');
  assert(readyRes.status === 200, 'GET /api/health/ready returns 200 OK');
  assert(readyRes.body.probe === 'readiness', 'GET /api/health/ready identifies as readiness probe');

  // --- 4. SECURITY HEADERS & HSTS ---
  console.log('\n--- 4. Security Headers & HSTS Enforcement ---');
  assert(healthRes.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff header present');
  assert(healthRes.headers['x-frame-options'] === 'SAMEORIGIN', 'X-Frame-Options: SAMEORIGIN header present');
  assert(!healthRes.headers['x-powered-by'], 'X-Powered-By server header is stripped');

  // Test conditional HSTS when request arrives via HTTPS reverse-proxy
  const httpsProxyRes = await makeRequest('/api/health', {
    'x-forwarded-proto': 'https'
  });
  assert(
    httpsProxyRes.headers['strict-transport-security'] !== undefined,
    'Strict-Transport-Security header attached when forwarded over HTTPS'
  );
  assert(
    httpsProxyRes.headers['strict-transport-security'].includes('max-age=31536000'),
    'HSTS sets 1-year max-age (31536000 seconds)'
  );

  // --- 5. CONTAINERIZATION & DEPLOYMENT ARTIFACTS ---
  console.log('\n--- 5. Containerization & Deployment Artifacts ---');
  const dockerfilePath = path.resolve(__dirname, '../Dockerfile');
  assert(fs.existsSync(dockerfilePath), 'Dockerfile exists in repository root');
  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
  assert(dockerfileContent.includes('node:22-alpine'), 'Dockerfile uses official node:22-alpine base image');
  assert(dockerfileContent.includes('USER node'), 'Dockerfile executes under unprivileged "node" user');
  assert(dockerfileContent.includes('HEALTHCHECK'), 'Dockerfile specifies container HEALTHCHECK instruction');

  const dockerignorePath = path.resolve(__dirname, '../.dockerignore');
  assert(fs.existsSync(dockerignorePath), '.dockerignore exists in repository root');
  const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf8');
  assert(dockerignoreContent.includes('node_modules'), '.dockerignore excludes node_modules');
  assert(dockerignoreContent.includes('.env'), '.dockerignore excludes .env');

  const composePath = path.resolve(__dirname, '../docker-compose.yml');
  assert(fs.existsSync(composePath), 'docker-compose.yml exists in repository root');
  const composeContent = fs.readFileSync(composePath, 'utf8');
  assert(composeContent.includes('mysql:8.0'), 'docker-compose.yml configures MySQL 8.0 service');
  assert(composeContent.includes('mysql_data:'), 'docker-compose.yml defines persistent volume mysql_data');

  // --- 6. FRONTEND API CONFIGURATION & CORE PAGES ---
  console.log('\n--- 6. Frontend API Resolution & Core Entry Points ---');
  const frontendConfigPath = path.resolve(__dirname, '../frontend/js/config.js');
  const frontendConfigContent = fs.readFileSync(frontendConfigPath, 'utf8');
  assert(
    frontendConfigContent.includes('window.ITB_API_URL'),
    'frontend/js/config.js supports runtime window.ITB_API_URL override'
  );

  const corePages = [
    'frontend/index.html',
    'frontend/pages/admin.html',
    'frontend/pages/bets.html',
    'frontend/pages/passbook.html',
    'frontend/pages/profile.html',
    'frontend/pages/match-details.html',
    'frontend/pages/login.html',
    'frontend/pages/register.html'
  ];

  for (const page of corePages) {
    const fullPath = path.resolve(__dirname, '..', page);
    assert(fs.existsSync(fullPath), `Core entry point ${page} exists`);
  }

  // --- 7. GRACEFUL SHUTDOWN AUDIT ---
  console.log('\n--- 7. Graceful Shutdown & Process Signals ---');
  const appFileContent = fs.readFileSync(path.resolve(__dirname, '../backend/app.js'), 'utf8');
  assert(appFileContent.includes("handleGracefulShutdown('SIGINT')"), 'app.js binds SIGINT graceful shutdown');
  assert(appFileContent.includes("handleGracefulShutdown('SIGTERM')"), 'app.js binds SIGTERM graceful shutdown');
  assert(appFileContent.includes('shutdownTimer'), 'app.js includes timeout guard for graceful shutdown');

  // Close test HTTP server and database pool
  await new Promise(resolve => testServer.close(resolve));
  await closePool();

  console.log('\n====================================================');
  console.log(`DAY 19 TEST SUMMARY: ${passed} / ${passed + failed} PASSED`);
  if (failed === 0) {
    console.log('ALL DAY 19 RELEASE VALIDATION CHECKS PASSED (100%)');
  } else {
    console.error(`FAILED CHECKS: ${failed}`);
  }
  console.log('====================================================\n');
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch(err => {
  console.error('Day 19 Test Suite Uncaught Error:', err);
  process.exit(1);
});
