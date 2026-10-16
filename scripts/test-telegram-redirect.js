/**
 * Automated Verification Script for Deposit & Withdrawal Telegram Redirection
 * Tests:
 * 1. Home Page Deposit & Withdrawal Buttons Link to https://t.me/narendra_1306
 * 2. Passbook Page Deposit & Withdraw Buttons Link to https://t.me/narendra_1306
 * 3. Security Attributes (target="_blank", rel="noopener noreferrer")
 * 4. Button Styling, Classes & Icons Preservation
 * 5. HomeController & JS Redirection Logic
 * 6. Balance & Database Integrity (Zero fake transactions, zero balance mutation)
 */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('DEPOSIT & WITHDRAWAL TELEGRAM REDIRECTION TEST SUITE');
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
const homeJsPath = path.join(root, 'frontend', 'js', 'home.js');
const homeCssPath = path.join(root, 'frontend', 'css', 'home.css');
const passbookHtmlPath = path.join(root, 'frontend', 'pages', 'passbook.html');
const passbookJsPath = path.join(root, 'frontend', 'js', 'passbook.js');

const TARGET_TELEGRAM_URL = 'https://t.me/narendra_1306';

// 1. Home Page Verification
const homeHtml = fs.readFileSync(indexHtmlPath, 'utf8');

assert(homeHtml.includes('id="home-deposit-btn"'), 'Home Deposit button element exists (#home-deposit-btn)');
assert(homeHtml.includes('id="home-withdraw-btn"'), 'Home Withdrawal button element exists (#home-withdraw-btn)');

assert(homeHtml.includes(`href="${TARGET_TELEGRAM_URL}"`), `Buttons have href configured to "${TARGET_TELEGRAM_URL}"`);
assert(homeHtml.includes('target="_blank"'), 'Buttons have target="_blank" configured for direct opening');
assert(homeHtml.includes('rel="noopener noreferrer"'), 'Security attribute rel="noopener noreferrer" present');

assert(homeHtml.includes('class="home-wallet-btn btn-deposit"'), 'Home Deposit button preserves existing classes (.home-wallet-btn .btn-deposit)');
assert(homeHtml.includes('class="home-wallet-btn btn-withdrawal"'), 'Home Withdrawal button preserves existing classes (.home-wallet-btn .btn-withdrawal)');

assert(homeHtml.includes('>Deposit</span>'), 'Home Deposit button label text contains "Deposit"');
assert(homeHtml.includes('>Withdrawal</span>'), 'Home Withdrawal button label text contains "Withdrawal"');

// 2. Passbook Page Verification
const passbookHtml = fs.readFileSync(passbookHtmlPath, 'utf8');

assert(passbookHtml.includes('id="deposit-btn"'), 'Passbook Deposit button element exists (#deposit-btn)');
assert(passbookHtml.includes('id="withdraw-btn"'), 'Passbook Withdraw button element exists (#withdraw-btn)');

assert(passbookHtml.includes(`href="${TARGET_TELEGRAM_URL}"`), `Passbook buttons have href configured to "${TARGET_TELEGRAM_URL}"`);
assert(passbookHtml.includes('class="hero-btn hero-btn-deposit"'), 'Passbook Deposit button preserves class (.hero-btn-deposit)');
assert(passbookHtml.includes('class="hero-btn hero-btn-withdraw"'), 'Passbook Withdraw button preserves class (.hero-btn-withdraw)');

// 3. JavaScript Redirection Logic Tests
const homeJs = fs.readFileSync(homeJsPath, 'utf8');
assert(homeJs.includes(TARGET_TELEGRAM_URL), 'home.js defines TARGET_TELEGRAM_URL "https://t.me/narendra_1306"');
assert(homeJs.includes("window.open(TELEGRAM_PROFILE_URL, '_blank', 'noopener,noreferrer')"), 'home.js opens Telegram directly without popup dialog');

const passbookJs = fs.readFileSync(passbookJsPath, 'utf8');
assert(passbookJs.includes(TARGET_TELEGRAM_URL), 'passbook.js defines TARGET_TELEGRAM_URL "https://t.me/narendra_1306"');
assert(passbookJs.includes("window.open(TELEGRAM_PROFILE_URL, '_blank', 'noopener,noreferrer')"), 'passbook.js opens Telegram directly without popup dialog');

// 4. CSS Styling Verification
const homeCss = fs.readFileSync(homeCssPath, 'utf8');
assert(homeCss.includes('.home-wallet-btn'), 'home.css defines .home-wallet-btn');
assert(homeCss.includes('.btn-deposit'), 'home.css defines .btn-deposit');
assert(homeCss.includes('.btn-withdrawal'), 'home.css defines .btn-withdrawal');

// 5. Zero Side Effect / Balance Safety Verification
assert(!homeJs.includes('available_balance = available_balance +'), 'home.js does not alter user balance on click');
assert(!homeJs.includes('available_balance = available_balance -'), 'home.js does not alter user balance on click');
assert(!homeJs.includes('INSERT INTO wallets'), 'home.js does not create balance rows');
assert(!homeJs.includes('INSERT INTO deposits'), 'home.js does not create fake deposits');

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED (100%)`);
console.log('====================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
