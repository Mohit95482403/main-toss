/**
 * Automated Verification Script for Day 12: Application-Wide UI Consistency,
 * Notifications, Loading States & Shared Component Improvements
 */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('IRONMAN TOSS BOOK - DAY 12 AUTOMATED TEST SUITE');
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
const componentsCssPath = path.join(root, 'frontend', 'css', 'components.css');
const layoutCssPath = path.join(root, 'frontend', 'css', 'layout.css');
const responsiveCssPath = path.join(root, 'frontend', 'css', 'responsive.css');
const sharedLayoutJsPath = path.join(root, 'frontend', 'js', 'shared-layout.js');
const homeJsPath = path.join(root, 'frontend', 'js', 'home.js');
const betsJsPath = path.join(root, 'frontend', 'js', 'bets.js');
const passbookJsPath = path.join(root, 'frontend', 'js', 'passbook.js');
const matchDetailsHtmlPath = path.join(root, 'frontend', 'pages', 'match-details.html');
const appJsPath = path.join(root, 'frontend', 'js', 'app.js');

// 1. File Existence Tests
assert(fs.existsSync(componentsCssPath), 'components.css exists');
assert(fs.existsSync(layoutCssPath), 'layout.css exists');
assert(fs.existsSync(responsiveCssPath), 'responsive.css exists');
assert(fs.existsSync(sharedLayoutJsPath), 'shared-layout.js exists');

// 2. Standardized Status Badges in components.css
const componentsCss = fs.readFileSync(componentsCssPath, 'utf8');

assert(componentsCss.includes('.badge-live'), 'components.css defines .badge-live');
assert(componentsCss.includes('.badge-won'), 'components.css defines .badge-won');
assert(componentsCss.includes('.badge-lost'), 'components.css defines .badge-lost');
assert(componentsCss.includes('.badge-no-result'), 'components.css defines .badge-no-result');
assert(componentsCss.includes('.badge-pending'), 'components.css defines .badge-pending');
assert(componentsCss.includes('.badge-completed'), 'components.css defines .badge-completed');
assert(componentsCss.includes('.badge-upcoming'), 'components.css defines .badge-upcoming');
assert(componentsCss.includes('.badge-credit'), 'components.css defines .badge-credit');
assert(componentsCss.includes('.badge-debit'), 'components.css defines .badge-debit');
assert(componentsCss.includes('.badge-neutral'), 'components.css defines .badge-neutral');
assert(componentsCss.includes('live-pulse'), 'Pulsing live beacon animation defined for live status');

// 3. Standardized Loading Indicators & Skeletons in components.css
assert(componentsCss.includes('.btn-spinner'), 'components.css defines .btn-spinner');
assert(componentsCss.includes('@keyframes itb-spin'), 'components.css defines itb-spin keyframes');
assert(componentsCss.includes('.btn.btn-loading'), 'components.css defines .btn.btn-loading state');
assert(componentsCss.includes('.skeleton'), 'components.css defines .skeleton shimmer');
assert(componentsCss.includes('@keyframes itb-skeleton'), 'components.css defines itb-skeleton keyframes');
assert(componentsCss.includes('.skeleton-text'), 'components.css defines .skeleton-text');
assert(componentsCss.includes('.skeleton-title'), 'components.css defines .skeleton-title');
assert(componentsCss.includes('.skeleton-card'), 'components.css defines .skeleton-card');
assert(componentsCss.includes('.skeleton-circle'), 'components.css defines .skeleton-circle');

// 4. Standardized Inline Alerts in components.css
assert(componentsCss.includes('.alert'), 'components.css defines base .alert');
assert(componentsCss.includes('.alert-danger'), 'components.css defines .alert-danger');
assert(componentsCss.includes('.alert-warning'), 'components.css defines .alert-warning');
assert(componentsCss.includes('.alert-info'), 'components.css defines .alert-info');
assert(componentsCss.includes('.alert-success'), 'components.css defines .alert-success');

// 5. Standardized Empty States in components.css
assert(componentsCss.includes('.empty-state'), 'components.css defines base .empty-state');
assert(componentsCss.includes('.empty-state-icon'), 'components.css defines .empty-state-icon');
assert(componentsCss.includes('.empty-state-title'), 'components.css defines .empty-state-title');
assert(componentsCss.includes('.empty-state-desc'), 'components.css defines .empty-state-desc');

// 6. Standardized Reusable Toast Notifications in components.css
assert(componentsCss.includes('.app-toast-container'), 'components.css defines .app-toast-container');
assert(componentsCss.includes('.app-toast'), 'components.css defines base .app-toast');
assert(componentsCss.includes('.app-toast.show'), 'components.css defines .app-toast.show entrance state');
assert(componentsCss.includes('.app-toast-success'), 'components.css defines .app-toast-success');
assert(componentsCss.includes('.app-toast-error'), 'components.css defines .app-toast-error');
assert(componentsCss.includes('.app-toast-warning'), 'components.css defines .app-toast-warning');
assert(componentsCss.includes('.app-toast-info'), 'components.css defines .app-toast-info');
assert(componentsCss.includes('.app-toast-close'), 'components.css defines .app-toast-close button');

// 7. Accessibility & Reduced Motion in components.css
assert(componentsCss.includes('@media (prefers-reduced-motion: reduce)'), 'components.css includes prefers-reduced-motion overrides');

// 8. Layout and Safe Area Insets in layout.css and responsive.css
const layoutCss = fs.readFileSync(layoutCssPath, 'utf8');
assert(layoutCss.includes('env(safe-area-inset-bottom'), 'layout.css bottom-nav-spacer accounts for safe-area-inset-bottom');

const responsiveCss = fs.readFileSync(responsiveCssPath, 'utf8');
assert(!responsiveCss.includes('max-height: 900px'), 'responsive.css no longer clips app-container to max-height: 900px on desktop');

// 9. Shared Layout Utilities in shared-layout.js
const sharedJs = fs.readFileSync(sharedLayoutJsPath, 'utf8');
assert(sharedJs.includes('showToast'), 'shared-layout.js defines showToast function');
assert(sharedJs.includes('formatCurrency'), 'shared-layout.js defines formatCurrency function');
assert(sharedJs.includes('formatDate'), 'shared-layout.js defines formatDate function');
assert(sharedJs.includes('setButtonLoading'), 'shared-layout.js defines setButtonLoading function');
assert(sharedJs.includes('setupGlobalModalAccessibility'), 'shared-layout.js defines setupGlobalModalAccessibility');
assert(sharedJs.includes('window.showAppToast = showToast'), 'Global window.showAppToast exported');
assert(sharedJs.includes('window.ITB_FORMATTERS ='), 'Global window.ITB_FORMATTERS exported');

// 10. Algorithmic Unit Tests on Formatters
let formatCurrencyFn, formatDateFn;
try {
  const formatCurrencyMatch = sharedJs.match(/function formatCurrency\(amount, symbol = '₹'\) \{([\s\S]*?)\n  \}/);
  if (formatCurrencyMatch) {
    formatCurrencyFn = new Function('amount', "symbol = '₹'", formatCurrencyMatch[1]);
  }

  const formatDateMatch = sharedJs.match(/function formatDate\(dateInput, includeTime = true\) \{([\s\S]*?)\n  \}/);
  if (formatDateMatch) {
    formatDateFn = new Function('dateInput', 'includeTime = true', formatDateMatch[1]);
  }
} catch (e) {
  console.warn('Unit test function extraction notice:', e);
}

if (formatCurrencyFn) {
  assert(formatCurrencyFn(10000) === '₹10,000.00', 'formatCurrency(10000) correctly outputs ₹10,000.00');
  assert(formatCurrencyFn(1500.5) === '₹1,500.50', 'formatCurrency(1500.5) correctly outputs ₹1,500.50');
  assert(formatCurrencyFn(0) === '₹0.00', 'formatCurrency(0) correctly outputs ₹0.00');
  assert(formatCurrencyFn('invalid') === '₹0.00', 'formatCurrency("invalid") safely returns ₹0.00');
  assert(formatCurrencyFn(250000) === '₹2,50,000.00', 'formatCurrency(250000) formats Indian numbering system (₹2,50,000.00)');
}

if (formatDateFn) {
  const testIso = '2026-10-14T15:30:00.000Z';
  const formatted = formatDateFn(testIso, false);
  assert(formatted.includes('Oct') && formatted.includes('2026'), 'formatDate safely extracts day, month, and year');
  assert(formatDateFn(null) === '—', 'formatDate(null) returns fallback em-dash');
}

// 11. Consistency in Application Empty States
const homeJs = fs.readFileSync(homeJsPath, 'utf8');
assert(homeJs.includes('match-empty-state empty-state'), 'Home feed empty state includes standard empty-state class');

const betsJs = fs.readFileSync(betsJsPath, 'utf8');
assert(betsJs.includes('bets-empty-state empty-state'), 'Bets feed empty state includes standard empty-state class');

const passbookJs = fs.readFileSync(passbookJsPath, 'utf8');
assert(passbookJs.includes('passbook-empty-state empty-state'), 'Passbook feed empty state includes standard empty-state class');

const matchDetailsHtml = fs.readFileSync(matchDetailsHtmlPath, 'utf8');
assert(matchDetailsHtml.includes('match-not-found empty-state'), 'Match details not-found state includes standard empty-state class');

// 12. App.js Diagnostic Feedback
const appJs = fs.readFileSync(appJsPath, 'utf8');
assert(appJs.includes('setButtonLoading'), 'app.js uses setButtonLoading on health check button');
assert(appJs.includes('showToast'), 'app.js uses showToast for manual diagnostic feedback');

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
