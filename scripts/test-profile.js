/**
 * Automated Verification Script for Day 6: Profile Page UI & Account Settings
 */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('IRONMAN TOSS BOOK - DAY 6 AUTOMATED TEST SUITE');
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
const profileHtmlPath = path.join(root, 'frontend', 'pages', 'profile.html');
const profileCssPath = path.join(root, 'frontend', 'css', 'profile.css');
const profileJsPath = path.join(root, 'frontend', 'js', 'profile.js');

// 1. File Existence Tests
assert(fs.existsSync(profileHtmlPath), 'profile.html exists');
assert(fs.existsSync(profileCssPath), 'profile.css exists');
assert(fs.existsSync(profileJsPath), 'profile.js exists');

// 2. Syntax & Content Tests on profile.html
const htmlContent = fs.readFileSync(profileHtmlPath, 'utf8');

// Shared layout mount containers
assert(htmlContent.includes('id="shared-header"'), 'Shared header container present');
assert(htmlContent.includes('id="shared-ticker"'), 'Shared ticker container present');
assert(htmlContent.includes('id="shared-bottom-nav"'), 'Shared bottom navigation container present');

// Hero Profile Card
assert(htmlContent.includes('id="hero-profile-name"'), 'Hero profile name element present');
assert(htmlContent.includes('id="hero-profile-handle"'), 'Hero profile handle element present');
assert(htmlContent.includes('id="hero-profile-id"'), 'Hero profile ID element present');
assert(htmlContent.includes('id="hero-profile-status"'), 'Hero profile status element present');
assert(htmlContent.includes('id="edit-profile-btn"'), 'Edit Profile button present');

// Personal Information Section
assert(htmlContent.includes('id="info-fullname"'), 'Personal info Full Name present');
assert(htmlContent.includes('id="info-username"'), 'Personal info Username present');
assert(htmlContent.includes('id="info-email"'), 'Personal info Email present');
assert(htmlContent.includes('id="info-phone"'), 'Personal info Phone present');
assert(htmlContent.includes('id="info-joined"'), 'Personal info Account Created date present');
assert(htmlContent.includes('id="info-kyc"'), 'Personal info KYC status present');

// Account Settings Menu List Items
assert(htmlContent.includes('id="menu-edit-profile-btn"'), 'Settings menu Edit Profile entry present');
assert(htmlContent.includes('id="menu-change-password-btn"'), 'Settings menu Change Password entry present');
assert(htmlContent.includes('id="dark-mode-item"'), 'Settings menu Dark Mode entry present');
assert(htmlContent.includes('id="dark-mode-switch-input"'), 'Dark Mode toggle switch input present');
assert(htmlContent.includes('id="menu-notifications-btn"'), 'Settings menu Notification Preferences entry present');
assert(htmlContent.includes('id="menu-rules-btn"'), 'Settings menu App Rules entry present');
assert(htmlContent.includes('id="menu-privacy-btn"'), 'Settings menu Privacy Information entry present');
assert(htmlContent.includes('id="menu-support-btn"'), 'Settings menu Customer Support entry present');
assert(htmlContent.includes('id="menu-logout-btn"'), 'Settings menu Logout button present');

// Modals
assert(htmlContent.includes('id="edit-profile-modal"'), 'Edit Profile modal present');
assert(htmlContent.includes('id="change-password-modal"'), 'Change Password modal present');
assert(htmlContent.includes('id="notifications-modal"'), 'Notification Preferences modal present');
assert(htmlContent.includes('id="app-rules-modal"'), 'App Rules modal present');
assert(htmlContent.includes('id="privacy-modal"'), 'Privacy Information modal present');
assert(htmlContent.includes('id="support-modal"'), 'Customer Support modal present');
assert(htmlContent.includes('id="logout-modal"'), 'Logout confirmation modal present');

// Accessibility: Modal dialog attributes
assert(htmlContent.includes('role="dialog"') && htmlContent.includes('aria-modal="true"'), 'Modal dialog ARIA attributes present');
assert(htmlContent.includes('aria-labelledby="edit-profile-title"'), 'Edit Profile modal labelled by title');
assert(htmlContent.includes('aria-labelledby="change-password-title"'), 'Change Password modal labelled by title');
assert(htmlContent.includes('aria-labelledby="notifications-title"'), 'Notification modal labelled by title');

// 3. Controller Tests in profile.js
const jsContent = fs.readFileSync(profileJsPath, 'utf8');

assert(jsContent.includes('const DEFAULT_PROFILE ='), 'DEFAULT_PROFILE constant defined in profile.js');
assert(jsContent.includes('Rahul Sharma'), 'Default demo user name configured');
assert(jsContent.includes('ironman_99'), 'Default demo username configured');
assert(jsContent.includes('UID-2026-8842'), 'Default demo user ID configured');
assert(jsContent.includes('setupEditProfile'), 'setupEditProfile function defined');
assert(jsContent.includes('setupChangePassword'), 'setupChangePassword function defined');
assert(jsContent.includes('setupNotificationPreferences'), 'setupNotificationPreferences function defined');
assert(jsContent.includes('setupDarkModeSwitch'), 'setupDarkModeSwitch function defined');
assert(jsContent.includes('setupInformationalModals'), 'setupInformationalModals function defined');
assert(jsContent.includes('setupGlobalModalListeners'), 'setupGlobalModalListeners function defined');
assert(jsContent.includes('Escape'), 'Escape key dismiss handler present in profile.js');

// 4. CSS Token & Responsive Verification
const cssContent = fs.readFileSync(profileCssPath, 'utf8');

assert(cssContent.includes('.profile-hero-card'), 'profile-hero-card defined in CSS');
assert(cssContent.includes('.profile-avatar-fallback'), 'profile-avatar-fallback defined in CSS');
assert(cssContent.includes('.profile-section-card'), 'profile-section-card defined in CSS');
assert(cssContent.includes('.profile-info-grid'), 'profile-info-grid defined in CSS');
assert(cssContent.includes('.settings-list'), 'settings-list defined in CSS');
assert(cssContent.includes('.settings-item'), 'settings-item defined in CSS');
assert(cssContent.includes('.switch-control'), 'switch-control defined in CSS');
assert(cssContent.includes('.switch-slider'), 'switch-slider defined in CSS');
assert(cssContent.includes('.profile-modal-overlay'), 'profile-modal-overlay defined in CSS');
assert(cssContent.includes('.profile-modal-card'), 'profile-modal-card defined in CSS');
assert(cssContent.includes('.profile-toast'), 'profile-toast defined in CSS');
assert(cssContent.includes('[data-theme="dark"]'), 'Dark theme selector defined in CSS');
assert(cssContent.includes('@media (max-width: 600px)'), 'Mobile stacking breakpoint defined');
assert(cssContent.includes('@media (max-width: 360px)'), 'Compact mobile responsive breakpoint defined');

// 5. Security & Safety Check
assert(!jsContent.includes('eval('), 'No eval calls in profile.js');
assert(!jsContent.includes('password = "'), 'No hardcoded plain-text passwords');

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
