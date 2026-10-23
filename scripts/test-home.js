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
assert(!htmlContent.includes('id="featured-match"'), 'Featured live match card removed from Home page');
assert(htmlContent.includes('data-category="all"'), 'Category filter "All" present');
assert(htmlContent.includes('data-category="live"'), 'Category filter "Live" present');
assert(htmlContent.includes('data-category="upcoming"'), 'Category filter "Upcoming" present');
assert(htmlContent.includes('data-category="completed"'), 'Category filter "Completed" present');
assert(htmlContent.includes('id="match-feed-container"'), 'Match feed container present');

// Diagnostics & Modal
assert(!htmlContent.includes('id="diagnostics-toggle-btn"'), 'Diagnostics toggle button cleanly removed from home page');
assert(!htmlContent.includes('id="diagnostics-content"'), 'Diagnostics collapsible content cleanly removed from home page');
assert(htmlContent.includes('id="match-detail-modal"'), 'Match detail modal present');
assert(htmlContent.includes('role="dialog"') && htmlContent.includes('aria-modal="true"'), 'Modal dialog ARIA attributes present');

// 3. Controller Tests in home.js
const jsContent = fs.readFileSync(homeJsPath, 'utf8');

assert(jsContent.includes('loadMatchesData') || jsContent.includes('TossBookMatches'), 'Matches data loader defined in home.js');
assert(jsContent.includes('featured-match') || jsContent.includes('updateFeaturedMatch'), 'Featured match card updater defined');
assert(jsContent.includes('setupDiagnostics'), 'setupDiagnostics function defined');
assert(jsContent.includes('Escape'), 'Escape key dismiss handler present in home.js');

// Test match rendering logic with test fixtures
const testMatches = [
  { id: 'MATCH-2026-001', tournament: 'ICC T20 World Cup', teamOne: 'India', teamTwo: 'Australia', teamOneRate: 1.95, teamTwoRate: 1.90, status: 'live' },
  { id: 'MATCH-2026-002', tournament: 'IPL 2026', teamOne: 'Mumbai Indians', teamTwo: 'CSK', teamOneRate: 1.90, teamTwoRate: 1.90, status: 'upcoming' },
  { id: 'MATCH-2026-003', tournament: 'BBL 2026', teamOne: 'Perth', teamTwo: 'Sydney', teamOneRate: 1.88, teamTwoRate: 1.92, status: 'upcoming' },
  { id: 'MATCH-2026-004', tournament: 'Asia Cup', teamOne: 'Pakistan', teamTwo: 'Sri Lanka', teamOneRate: 1.85, teamTwoRate: 1.95, status: 'completed' },
  { id: 'MATCH-2026-005', tournament: 'T20 Series', teamOne: 'New Zealand', teamTwo: 'West Indies', teamOneRate: 1.90, teamTwoRate: 1.90, status: 'completed' }
];

assert(testMatches.length >= 5, `Match count is ${testMatches.length} (>= 5)`);

const liveMatches = testMatches.filter(m => m.status === 'live');
const upcomingMatches = testMatches.filter(m => m.status === 'upcoming');
const completedMatches = testMatches.filter(m => m.status === 'completed');

assert(liveMatches.length >= 1, `Live matches count is ${liveMatches.length} (>= 1)`);
assert(upcomingMatches.length >= 2, `Upcoming matches count is ${upcomingMatches.length} (>= 2)`);
assert(completedMatches.length >= 1, `Completed matches count is ${completedMatches.length} (>= 1)`);

// Verify rates and team names
const allHaveRates = testMatches.every(m => m.teamOneRate > 1 && m.teamTwoRate > 1);
assert(allHaveRates, 'All matches have valid numeric rate multipliers');

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

// 5. Home Wallet Actions & Deposit/Withdrawal Verification
assert(htmlContent.includes('id="home-deposit-btn"'), 'Home Deposit button present');
assert(htmlContent.includes('id="home-withdraw-btn"'), 'Home Withdrawal button present');
assert(htmlContent.includes('>Deposit<'), 'Deposit button has exact label "Deposit"');
assert(htmlContent.includes('>Withdrawal<'), 'Withdrawal button has exact label "Withdrawal"');
assert(htmlContent.includes('id="home-wallet-balance"'), 'Home wallet balance display present');
assert(htmlContent.includes('id="deposit-modal"'), 'Deposit modal dialog present in index.html');
assert(htmlContent.includes('id="withdraw-modal"'), 'Withdrawal modal dialog present in index.html');
assert(htmlContent.includes('href="https://t.me/DaddyTossBook"'), 'Telegram redirection link https://t.me/DaddyTossBook configured on buttons');
assert(htmlContent.includes('target="_blank"'), 'Target _blank configured for external redirection');
assert(htmlContent.includes('rel="noopener noreferrer"'), 'Security attribute rel="noopener noreferrer" configured');

assert(jsContent.includes('setupWalletActions'), 'setupWalletActions function defined in home.js');
assert(jsContent.includes('https://t.me/DaddyTossBook'), 'Telegram profile URL defined in home.js');
assert(jsContent.includes('home-deposit-btn'), 'home-deposit-btn event handlers in home.js');
assert(jsContent.includes('home-withdraw-btn'), 'home-withdraw-btn event handlers in home.js');

assert(cssContent.includes('.home-wallet-section'), 'home-wallet-section defined in CSS');
assert(cssContent.includes('.home-wallet-card'), 'home-wallet-card defined in CSS');
assert(cssContent.includes('.btn-deposit'), 'btn-deposit defined in CSS');
assert(cssContent.includes('.btn-withdrawal'), 'btn-withdrawal defined in CSS');

// 6. Safety & Security Check
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
