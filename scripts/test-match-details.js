/**
 * Automated Verification Script for Day 8: Match Details Page UI & Home Integration
 */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('IRONMAN TOSS BOOK - DAY 8 AUTOMATED TEST SUITE');
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

const root = path.join(__dirname, '..');
const detailsHtmlPath = path.join(root, 'frontend', 'pages', 'match-details.html');
const detailsCssPath = path.join(root, 'frontend', 'css', 'match-details.css');
const detailsJsPath = path.join(root, 'frontend', 'js', 'match-details.js');
const matchesDataJsPath = path.join(root, 'frontend', 'js', 'matches-data.js');
const homeHtmlPath = path.join(root, 'frontend', 'index.html');
const homeJsPath = path.join(root, 'frontend', 'js', 'home.js');

// 1. File Existence Tests
assert(fs.existsSync(detailsHtmlPath), 'frontend/pages/match-details.html exists');
assert(fs.existsSync(detailsCssPath), 'frontend/css/match-details.css exists');
assert(fs.existsSync(detailsJsPath), 'frontend/js/match-details.js exists');
assert(fs.existsSync(matchesDataJsPath), 'frontend/js/matches-data.js exists');

// 2. Syntax & Content Tests on match-details.html
const detailsHtml = fs.readFileSync(detailsHtmlPath, 'utf8');

// Shared layout containers
assert(detailsHtml.includes('id="shared-header"'), 'Shared header container present');
assert(detailsHtml.includes('id="shared-ticker"'), 'Shared ticker container present');
assert(detailsHtml.includes('id="shared-bottom-nav"'), 'Shared bottom navigation container present');

// Back Navigation
assert(detailsHtml.includes('id="back-nav-btn"'), 'Back navigation button present');
assert(detailsHtml.includes('href="../index.html"'), 'Back navigation links safely to ../index.html');

// Content & Not Found views
assert(detailsHtml.includes('id="match-content-view"'), 'Match content view container present');
assert(detailsHtml.includes('id="match-not-found-view"'), 'Match not-found view container present');

// Hero Summary Card elements
assert(detailsHtml.includes('id="hero-tournament"'), 'Hero tournament label present');
assert(detailsHtml.includes('id="hero-status-container"'), 'Hero status container present');
assert(detailsHtml.includes('id="hero-team-one-name"'), 'Hero Team One name element present');
assert(detailsHtml.includes('id="hero-team-two-name"'), 'Hero Team Two name element present');
assert(detailsHtml.includes('id="hero-scheduled-time"'), 'Hero scheduled time element present');
assert(detailsHtml.includes('id="hero-venue"'), 'Hero venue element present');

// Toss Market Rates Overview
assert(detailsHtml.includes('id="toss-market-title"'), 'Toss market section title present');
assert(detailsHtml.includes('id="toss-market-status-badge"'), 'Toss market status badge present');
assert(detailsHtml.includes('id="toss-rate-one-val"'), 'Team One rate value element present');
assert(detailsHtml.includes('id="toss-rate-two-val"'), 'Team Two rate value element present');

// Metadata & Rules
assert(detailsHtml.includes('id="meta-competition"'), 'Metadata competition element present');
assert(detailsHtml.includes('id="meta-venue"'), 'Metadata venue element present');
assert(detailsHtml.includes('id="meta-pitch"'), 'Metadata pitch element present');
assert(detailsHtml.includes('id="meta-referee"'), 'Metadata referee element present');
assert(detailsHtml.includes('id="meta-captains"'), 'Metadata captains element present');
assert(detailsHtml.includes('id="toss-rules-title"'), 'Toss rules card present');

// 3. Centralized Matches Data Module Tests
const matchesDataJs = fs.readFileSync(matchesDataJsPath, 'utf8');

// Execute matches-data in safe sandbox
const sandbox = { window: {} };
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(matchesDataJs, sandbox);

assert(typeof sandbox.window.TossBookMatches === 'object', 'TossBookMatches module exported to window');
assert(typeof sandbox.window.TossBookMatches.getAll === 'function', 'TossBookMatches.getAll function exists');
assert(typeof sandbox.window.TossBookMatches.getById === 'function', 'TossBookMatches.getById function exists');

const allMatches = sandbox.window.TossBookMatches.getAll();
assert(allMatches.length === 6, `TossBookMatches contains 6 fixtures (Actual: ${allMatches.length})`);

const match1 = sandbox.window.TossBookMatches.getById('MATCH-2026-001');
assert(match1 !== null && match1.matchTitle === 'India vs Australia', 'MATCH-2026-001 correctly resolved to India vs Australia');

const match2 = sandbox.window.TossBookMatches.getById('MATCH-2026-002');
assert(match2 !== null && match2.teamOne === 'Mumbai Indians', 'MATCH-2026-002 correctly resolved to Mumbai Indians vs CSK');

const invalidMatch = sandbox.window.TossBookMatches.getById('INVALID-ID-999');
assert(invalidMatch === null, 'Invalid match ID returns null safely');

// 4. Home Page Integration Tests
const homeHtml = fs.readFileSync(homeHtmlPath, 'utf8');
const homeJs = fs.readFileSync(homeJsPath, 'utf8');

assert(homeHtml.includes('href="pages/match-details.html?id=MATCH-2026-001"'), 'Featured match card links directly to match-details.html?id=MATCH-2026-001');
assert(homeHtml.includes('script src="js/matches-data.js"'), 'index.html includes matches-data.js script');
assert(homeJs.includes('pages/match-details.html?id='), 'home.js renders match card links targeting pages/match-details.html');

// 5. CSS Token & Responsive Verification
const cssContent = fs.readFileSync(detailsCssPath, 'utf8');

assert(cssContent.includes('.match-summary-card'), 'match-summary-card defined in CSS');
assert(cssContent.includes('.toss-market-card'), 'toss-market-card defined in CSS');
assert(cssContent.includes('.toss-rates-grid'), 'toss-rates-grid defined in CSS');
assert(cssContent.includes('.match-details-grid'), 'match-details-grid defined in CSS');
assert(cssContent.includes('.match-rules-card'), 'match-rules-card defined in CSS');
assert(cssContent.includes('.match-not-found'), 'match-not-found defined in CSS');
assert(cssContent.includes('[data-theme="dark"]'), 'Dark theme selector defined in CSS');
assert(cssContent.includes('@media (max-width: 600px)'), 'Mobile stacking breakpoint defined');
assert(cssContent.includes('@media (max-width: 360px)'), 'Compact mobile responsive breakpoint defined');

// 6. Safety & Security Check
const detailsJs = fs.readFileSync(detailsJsPath, 'utf8');
assert(!detailsJs.includes('eval('), 'No eval calls in match-details.js');
assert(!detailsJs.includes('placeBet'), 'No live betting placement in match-details.js');

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
