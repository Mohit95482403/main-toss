/**
 * Automated Verification Script for Day 7: Home Dashboard & Match Listings
 */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('IRONMAN TOSS BOOK - DAY 7 AUTOMATED TEST SUITE');
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
const indexHtmlPath = path.join(root, 'frontend', 'index.html');
const homeCssPath = path.join(root, 'frontend', 'css', 'home.css');
const homeJsPath = path.join(root, 'frontend', 'js', 'home.js');

// 1. File Existence Tests
assert(fs.existsSync(indexHtmlPath), 'frontend/index.html exists');
assert(fs.existsSync(homeCssPath), 'frontend/css/home.css exists');
assert(fs.existsSync(homeJsPath), 'frontend/js/home.js exists');

// 2. Syntax & Content Tests on index.html
const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

// Shared layout mount containers
assert(htmlContent.includes('id="shared-header"'), 'Shared header container present');
assert(htmlContent.includes('id="shared-ticker"'), 'Shared ticker container present');
assert(htmlContent.includes('id="shared-bottom-nav"'), 'Shared bottom navigation container present');

// Home Dashboard Structure
assert(htmlContent.includes('id="home-heading"'), 'Home title heading present');
assert(htmlContent.includes('id="featured-match"'), 'Featured live match card present');
assert(htmlContent.includes('India') && htmlContent.includes('Australia'), 'Featured match displays India vs Australia');
assert(htmlContent.includes('data-category="all"'), 'Category filter "All" present');
assert(htmlContent.includes('data-category="live"'), 'Category filter "Live" present');
assert(htmlContent.includes('data-category="upcoming"'), 'Category filter "Upcoming" present');
assert(htmlContent.includes('data-category="completed"'), 'Category filter "Completed" present');
assert(htmlContent.includes('id="match-feed-container"'), 'Match feed container present');

// Diagnostics & Modal
assert(htmlContent.includes('id="diagnostics-toggle-btn"'), 'Diagnostics toggle button present');
assert(htmlContent.includes('id="diagnostics-content"'), 'Diagnostics collapsible content present');
assert(htmlContent.includes('id="match-detail-modal"'), 'Match detail modal present');
assert(htmlContent.includes('role="dialog"') && htmlContent.includes('aria-modal="true"'), 'Modal dialog ARIA attributes present');

// 3. Controller Tests in home.js
const jsContent = fs.readFileSync(homeJsPath, 'utf8');

assert(jsContent.includes('const DEMO_MATCHES ='), 'DEMO_MATCHES constant defined in home.js');
assert(jsContent.includes('MATCH-2026-001'), 'Featured live match defined in dataset');
assert(jsContent.includes('setupMatchModal'), 'setupMatchModal function defined');
assert(jsContent.includes('setupDiagnostics'), 'setupDiagnostics function defined');
assert(jsContent.includes('Escape'), 'Escape key dismiss handler present in home.js');

// Extract DEMO_MATCHES and test logic
const matchesMatch = jsContent.match(/const DEMO_MATCHES = (\[[\s\S]*?\]);/);
assert(matchesMatch !== null, 'DEMO_MATCHES array parseable in home.js');

if (matchesMatch) {
  const demoMatches = eval(matchesMatch[1]);
  assert(demoMatches.length >= 5, `Match count is ${demoMatches.length} (>= 5)`);

  const liveMatches = demoMatches.filter(m => m.status === 'live');
  const upcomingMatches = demoMatches.filter(m => m.status === 'upcoming');
  const completedMatches = demoMatches.filter(m => m.status === 'completed');

  assert(liveMatches.length >= 1, `Live matches count is ${liveMatches.length} (>= 1)`);
  assert(upcomingMatches.length >= 2, `Upcoming matches count is ${upcomingMatches.length} (>= 2)`);
  assert(completedMatches.length >= 1, `Completed matches count is ${completedMatches.length} (>= 1)`);

  // Verify rates and team names
  const allHaveRates = demoMatches.every(m => m.teamOneRate > 1 && m.teamTwoRate > 1);
  assert(allHaveRates, 'All matches have valid numeric rate multipliers');
}

// 4. CSS Token & Responsive Verification
const cssContent = fs.readFileSync(homeCssPath, 'utf8');

assert(cssContent.includes('.featured-match-card'), 'featured-match-card defined in CSS');
assert(cssContent.includes('.live-pulse-dot'), 'live-pulse-dot defined with animation in CSS');
assert(cssContent.includes('.match-filter-strip'), 'match-filter-strip defined in CSS');
assert(cssContent.includes('.match-card'), 'match-card defined in CSS');
assert(cssContent.includes('.match-empty-state'), 'match-empty-state defined in CSS');
assert(cssContent.includes('.match-modal-overlay'), 'match-modal-overlay defined in CSS');
assert(cssContent.includes('[data-theme="dark"]'), 'Dark theme selector defined in CSS');
assert(cssContent.includes('@media (max-width: 360px)'), 'Compact mobile responsive breakpoint defined');

// 5. Safety & Security Check
assert(!jsContent.includes('fakeBetSuccess'), 'No fake bet placement success handlers');
assert(!jsContent.includes('processWager'), 'No transactional bet deduction');
assert(!jsContent.includes('eval('), 'No eval calls in home.js');

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
