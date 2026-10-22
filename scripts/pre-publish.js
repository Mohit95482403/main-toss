/**
 * DADDY TOSS BOOK - Pre-Publish Safe Verification Script
 * Audits branch, uncommitted secrets, syntax, endpoints, and deployment readiness
 * before code is pushed to production.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function runCheck(name, fn) {
  process.stdout.write(`[CHECK] ${name.padEnd(45, '.')}`);
  try {
    const result = fn();
    console.log(' \x1b[32mPASS\x1b[0m');
    return { name, passed: true, detail: result };
  } catch (err) {
    console.log(' \x1b[31mFAIL\x1b[0m');
    console.error(`        Error: ${err.message}`);
    return { name, passed: false, error: err.message };
  }
}

console.log('\n=== DADDY TOSS BOOK — PRE-PUBLISH VERIFICATION AUDIT ===\n');

const checks = [];

// 1. Branch verification
checks.push(runCheck('Current Git Branch is main', () => {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  if (branch !== 'main') throw new Error(`Active branch is '${branch}', expected 'main'`);
  return branch;
}));

// 2. Secret exclusion check
checks.push(runCheck('No sensitive .env files staged', () => {
  const staged = execSync('git diff --name-only --cached', { cwd: ROOT_DIR, encoding: 'utf8' });
  const dangerous = ['.env', 'backend/.env', 'ca.pem', 'id_rsa', 'secret'];
  const violations = staged.split('\n').filter(f => dangerous.some(d => f.includes(d)));
  if (violations.length > 0) throw new Error(`Staged sensitive files detected: ${violations.join(', ')}`);
  return 'Clean';
}));

// 3. Syntax audit across 90+ files
checks.push(runCheck('Frontend & Backend JS Syntax Audit', () => {
  const syntaxScript = path.join(ROOT_DIR, 'scripts', 'syntax-check.js');
  execSync(`node "${syntaxScript}"`, { cwd: ROOT_DIR, stdio: 'pipe' });
  return 'All JS files valid syntax';
}));

// 4. Config backend URL integrity
checks.push(runCheck('Production Backend URL in config.js', () => {
  const configContent = fs.readFileSync(path.join(ROOT_DIR, 'frontend', 'js', 'config.js'), 'utf8');
  if (!configContent.includes("https://daddy-toss-book-backend.onrender.com")) {
    throw new Error('config.js does not contain official production Render backend URL');
  }
  return 'Production URL configured';
}));

// 5. Vercel rewrites & Cache-Control integrity
checks.push(runCheck('Vercel Routing & Cache Invalidation Headers', () => {
  const fVercel = fs.readFileSync(path.join(ROOT_DIR, 'frontend', 'vercel.json'), 'utf8');
  const rVercel = fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8');
  if (!fVercel.includes('/api/:path*') || !rVercel.includes('/api/:path*')) {
    throw new Error('API proxy rewrite missing in vercel.json');
  }
  if (!fVercel.includes('s-maxage=0') || !rVercel.includes('s-maxage=0')) {
    throw new Error('Instant edge cache invalidation header missing in vercel.json');
  }
  return 'Rewrites and cache headers verified';
}));

// 6. Homepage authentication gate verification
checks.push(runCheck('Homepage Auth Gate Guard & Expiration Check', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'frontend', 'index.html'), 'utf8');
  if (!indexHtml.includes('auth-gate-style') || !indexHtml.includes('body { display: none !important; }')) {
    throw new Error('Missing auth-gate-style body concealment');
  }
  if (!indexHtml.includes('(payload.exp * 1000) <= Date.now()')) {
    throw new Error('Missing token expiration validation in index.html');
  }
  return 'Auth gate verified';
}));

console.log('\n=======================================================\n');

const failed = checks.filter(c => !c.passed);
if (failed.length === 0) {
  console.log('\x1b[32m✔ ALL PRE-PUBLISH CHECKS PASSED. Safe to commit and push to main.\x1b[0m\n');
  process.exit(0);
} else {
  console.error(`\x1b[31m✖ ${failed.length} check(s) failed. Please resolve before pushing.\x1b[0m\n`);
  process.exit(1);
}
