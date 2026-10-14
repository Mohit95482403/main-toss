/**
 * Automated Verification Script for Day 5: Passbook UI & Ledger Feed
 */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('IRONMAN TOSS BOOK - DAY 5 AUTOMATED TEST SUITE');
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

// 1. File Existence Tests
const root = path.join(__dirname, '..');
const passbookHtmlPath = path.join(root, 'frontend', 'pages', 'passbook.html');
const passbookCssPath = path.join(root, 'frontend', 'css', 'passbook.css');
const passbookJsPath = path.join(root, 'frontend', 'js', 'passbook.js');

assert(fs.existsSync(passbookHtmlPath), 'passbook.html exists');
assert(fs.existsSync(passbookCssPath), 'passbook.css exists');
assert(fs.existsSync(passbookJsPath), 'passbook.js exists');

// 2. Syntax & Content Tests on passbook.html
const htmlContent = fs.readFileSync(passbookHtmlPath, 'utf8');
assert(htmlContent.includes('id="shared-header"'), 'Shared header container present');
assert(htmlContent.includes('id="shared-ticker"'), 'Shared ticker container present');
assert(htmlContent.includes('id="shared-bottom-nav"'), 'Shared bottom navigation container present');
assert(htmlContent.includes('id="hero-available-balance"'), 'Hero available balance element present');
assert(htmlContent.includes('₹10,000.00'), 'Hero available balance displays ₹10,000.00');
assert(htmlContent.includes('id="hero-total-credits"'), 'Hero Total Credits indicator present');
assert(htmlContent.includes('id="hero-total-debits"'), 'Hero Total Debits indicator present');
assert(htmlContent.includes('id="deposit-btn"'), 'Deposit button present');
assert(htmlContent.includes('id="withdraw-btn"'), 'Withdraw button present');
assert(htmlContent.includes('id="txn-search-input"'), 'Transaction search input present');
assert(htmlContent.includes('id="search-clear-btn"'), 'Search clear button present');
assert(htmlContent.includes('data-filter="all"'), 'Filter "All" button present');
assert(htmlContent.includes('data-filter="credit"'), 'Filter "Credit" button present');
assert(htmlContent.includes('data-filter="debit"'), 'Filter "Debit" button present');
assert(htmlContent.includes('id="txn-feed-container"'), 'Transaction feed container present');
assert(htmlContent.includes('id="deposit-modal"'), 'Deposit placeholder modal present');
assert(htmlContent.includes('id="withdraw-modal"'), 'Withdraw placeholder modal present');
assert(htmlContent.includes('role="dialog"') && htmlContent.includes('aria-modal="true"'), 'Modal dialog accessibility attributes present');

// 3. Mathematical Consistency Tests on Ledger Data in passbook.js
const jsContent = fs.readFileSync(passbookJsPath, 'utf8');

// Extract DEMO_TRANSACTIONS using regex / vm
const jsonMatch = jsContent.match(/const DEMO_TRANSACTIONS = (\[[\s\S]*?\]);/);
assert(jsonMatch !== null, 'DEMO_TRANSACTIONS array found in passbook.js');

if (jsonMatch) {
  // Parse using eval in safe sandbox
  const demoTransactions = eval(jsonMatch[1]);
  assert(demoTransactions.length >= 5, `Demo transactions count is ${demoTransactions.length} (>= 5)`);

  let totalCredits = 0;
  let totalDebits = 0;

  demoTransactions.forEach(txn => {
    if (txn.type === 'credit') {
      totalCredits += txn.amount;
    } else if (txn.type === 'debit') {
      totalDebits += txn.amount;
    }
  });

  const availableBalance = totalCredits - totalDebits;

  assert(totalCredits === 15000, `Total Credits equal exactly ₹15,000.00 (Actual: ₹${totalCredits})`);
  assert(totalDebits === 5000, `Total Debits equal exactly ₹5,000.00 (Actual: ₹${totalDebits})`);
  assert(availableBalance === 10000, `Available Balance equals exactly ₹10,000.00 (Actual: ₹${availableBalance})`);

  // Verify Chronological timestamps
  const timestamps = demoTransactions.map(t => new Date(t.timestamp).getTime());
  const allValidDates = timestamps.every(ts => !isNaN(ts));
  assert(allValidDates, 'All transaction timestamps are valid ISO 8601 Date strings');

  // Verify signed amounts & status badges exist
  const hasCompleted = demoTransactions.some(t => t.status === 'completed');
  const hasPending = demoTransactions.some(t => t.status === 'pending');
  assert(hasCompleted, 'Dataset contains Completed transactions');
  assert(hasPending, 'Dataset contains Pending transactions');
}

// 4. CSS Token & Responsive Verification
const cssContent = fs.readFileSync(passbookCssPath, 'utf8');
assert(cssContent.includes('.hero-balance-card'), 'hero-balance-card class defined in CSS');
assert(cssContent.includes('.hero-btn-deposit'), 'hero-btn-deposit class defined in CSS');
assert(cssContent.includes('.hero-btn-withdraw'), 'hero-btn-withdraw class defined in CSS');
assert(cssContent.includes('.txn-card'), 'txn-card class defined in CSS');
assert(cssContent.includes('.txn-amount.credit'), 'Positive credit amount styling defined');
assert(cssContent.includes('.txn-amount.debit'), 'Negative debit amount styling defined');
assert(cssContent.includes('.modal-overlay'), 'modal-overlay class defined in CSS');
assert(cssContent.includes('.passbook-empty-state'), 'passbook-empty-state class defined in CSS');
assert(cssContent.includes('@media (max-width: 360px)'), 'Small mobile responsive breakpoint defined');

// 5. Check No Fake Payment Processing / Financial Settlement
assert(!jsContent.includes('fakePaymentSuccess'), 'No fake payment success handlers');
assert(!jsContent.includes('processPayment'), 'No payment gateway processing');
assert(!jsContent.includes('upi://pay'), 'No real or fake UPI URI schemes');

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
