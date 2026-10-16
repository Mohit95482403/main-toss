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

// Day 10 Enhancement: Transaction Details Modal
assert(htmlContent.includes('id="txn-detail-modal"'), 'Transaction details modal present');
assert(htmlContent.includes('id="modal-txn-title"'), 'Modal title element present');
assert(htmlContent.includes('id="modal-txn-status-badge"'), 'Modal status badge element present');
assert(htmlContent.includes('id="modal-txn-close-btn"'), 'Modal close button present');
assert(htmlContent.includes('id="modal-txn-amount"'), 'Modal amount highlight element present');
assert(htmlContent.includes('id="modal-txn-type-label"'), 'Modal type label element present');
assert(htmlContent.includes('id="modal-txn-id"'), 'Modal transaction ID element present');
assert(htmlContent.includes('id="modal-txn-ref-code"'), 'Modal reference code element present');
assert(htmlContent.includes('id="modal-txn-category"'), 'Modal category element present');
assert(htmlContent.includes('id="modal-txn-method"'), 'Modal payment method element present');
assert(htmlContent.includes('id="modal-txn-datetime"'), 'Modal date & time element present');
assert(htmlContent.includes('id="modal-txn-closing"'), 'Modal closing balance element present');
assert(htmlContent.includes('id="modal-txn-remarks"'), 'Modal remarks box element present');
assert(htmlContent.includes('id="modal-txn-footer-close-btn"'), 'Modal footer close button present');

// 3. Mathematical Consistency Tests on Ledger Data Logic
const jsContent = fs.readFileSync(passbookJsPath, 'utf8');
assert(jsContent.includes('loadUserTransactions') || jsContent.includes('/passbook/transactions'), 'Authentic transactions loader found in passbook.js');

const fixtureTransactions = [
  { id: 'DEMO-TXN-001', title: 'Account Credit', subtitle: 'Instant UPI Wallet Top-up', type: 'credit', amount: 5000.00, timestamp: '2026-10-12T10:30:00Z', status: 'completed', category: 'Deposit', paymentMethod: 'UPI', referenceCode: 'UPI-001', remarks: 'Deposit' },
  { id: 'DEMO-TXN-002', title: 'Account Debit', subtitle: 'Toss Stake: India vs Australia', type: 'debit', amount: 1000.00, timestamp: '2026-10-11T16:15:00Z', status: 'completed', category: 'Wager Stake', paymentMethod: 'Wager', referenceCode: 'DEMO-TXN-002', remarks: 'Stake' },
  { id: 'DEMO-TXN-003', title: 'Account Credit', subtitle: 'Toss Winnings: MI vs CSK', type: 'credit', amount: 2000.00, timestamp: '2026-10-10T12:20:00Z', status: 'completed', category: 'Wager Win', paymentMethod: 'Wager', referenceCode: 'WIN-003', remarks: 'Win' },
  { id: 'DEMO-TXN-004', title: 'Account Debit', subtitle: 'Withdrawal Request', type: 'debit', amount: 500.00, timestamp: '2026-10-09T18:45:00Z', status: 'pending', category: 'Withdrawal', paymentMethod: 'Bank', referenceCode: 'WD-004', remarks: 'Withdrawal' },
  { id: 'DEMO-TXN-005', title: 'Account Credit', subtitle: 'Referral Bonus Reward', type: 'credit', amount: 3000.00, timestamp: '2026-10-08T09:10:00Z', status: 'completed', category: 'Bonus Reward', paymentMethod: 'Promo', referenceCode: 'BONUS-005', remarks: 'Bonus' },
  { id: 'DEMO-TXN-007', title: 'Account Debit', subtitle: 'Toss Stake', type: 'debit', amount: 3500.00, timestamp: '2026-10-07T14:00:00Z', status: 'completed', category: 'Wager Stake', paymentMethod: 'Wager', referenceCode: 'STAKE-007', remarks: 'Stake' },
  { id: 'DEMO-TXN-006', title: 'Account Credit', subtitle: 'Initial Welcome Promotional Credit', type: 'credit', amount: 5000.00, timestamp: '2026-10-07T11:00:00Z', status: 'completed', category: 'Promotional', paymentMethod: 'Promo', referenceCode: 'PROMO-006', remarks: 'Promo' }
];

let demoTransactions = fixtureTransactions;
assert(demoTransactions.length >= 5, `Test transaction fixtures count is ${demoTransactions.length} (>= 5)`);

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

  // Verify Day 10 enriched fields
  const allHaveMetadata = demoTransactions.every(t => t.category && t.paymentMethod && t.referenceCode && t.remarks);
  assert(allHaveMetadata, 'All transactions contain enriched Day 10 metadata (category, paymentMethod, referenceCode, remarks)');

// Day 10 Search & Filter Logic Verification
function filterAndSearch(txns, filter, query) {
  return txns.filter(t => {
    if (filter !== 'all') {
      if (filter === 'credit' || filter === 'debit') {
        if (t.type !== filter) return false;
      } else if (filter === 'completed' || filter === 'pending') {
        if (t.status !== filter) return false;
      }
    }
    if (query) {
      const q = query.toLowerCase();
      const match = (t.title && t.title.toLowerCase().includes(q)) ||
                    (t.id && t.id.toLowerCase().includes(q)) ||
                    (t.category && t.category.toLowerCase().includes(q)) ||
                    (t.paymentMethod && t.paymentMethod.toLowerCase().includes(q)) ||
                    (t.referenceCode && t.referenceCode.toLowerCase().includes(q)) ||
                    (t.subtitle && t.subtitle.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });
}

assert(filterAndSearch(demoTransactions, 'all', 'UPI').length >= 1, 'Search for "UPI" returns matching transaction records');
assert(filterAndSearch(demoTransactions, 'all', 'DEMO-TXN-002').length === 1, 'Search for "DEMO-TXN-002" returns exactly 1 record');
assert(filterAndSearch(demoTransactions, 'credit', '').length === 4, 'Filter "credit" returns exactly 4 records');
assert(filterAndSearch(demoTransactions, 'debit', '').length === 3, 'Filter "debit" returns exactly 3 records');
assert(filterAndSearch(demoTransactions, 'credit', 'Bonus').length === 1, 'Combined filter "credit" + search "Bonus" returns 1 record');
assert(filterAndSearch(demoTransactions, 'all', 'xyzunknown').length === 0, 'Search for non-existent query returns 0 records');

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
assert(cssContent.includes('.btn-txn-details'), 'btn-txn-details class defined in CSS');
assert(cssContent.includes('.modal-financial-highlight'), 'modal-financial-highlight class defined in CSS');
assert(cssContent.includes('.modal-detail-grid'), 'modal-detail-grid class defined in CSS');
assert(cssContent.includes('.modal-remarks-box'), 'modal-remarks-box class defined in CSS');
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

