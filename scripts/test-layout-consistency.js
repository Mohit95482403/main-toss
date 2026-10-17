/**
 * IRONMAN TOSS BOOK - Layout & Spacing Consistency Automated Audit Test Suite
 * 
 * Verifies:
 * 1. Global Spacing Scale Tokens & Variable Declarations in variables.css
 * 2. Standardized Page Layout & Header Hierarchy in layout.css
 * 3. Mobile, Tablet, and Desktop Breakpoints in responsive.css
 * 4. Header & Navigation Alignment & Docking
 * 5. BET ON TOSS Popup Centering, Spacing, and Theme Tokens
 * 6. Admin Panel Topbar, Tabs, and Main Content Sizing (1440px Max Width)
 * 7. Unified Light-Pink Theme Tokens & Elimination of Hardcoded Grays/Blacks
 * 8. HTML Page Stylesheet Inclusion & Link Integrity
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName} ${details ? '- ' + details : ''}`);
    failed++;
  }
}

function runAudit() {
  console.log('==================================================================');
  console.log('  IRONMAN TOSS BOOK — LAYOUT, ALIGNMENT & SPACING AUDIT SUITE');
  console.log('==================================================================\n');

  const cssDir = path.join(__dirname, '..', 'frontend', 'css');
  const pagesDir = path.join(__dirname, '..', 'frontend', 'pages');
  const indexHtmlPath = path.join(__dirname, '..', 'frontend', 'index.html');

  // 1. Audit variables.css
  console.log('--- SECTION 1: GLOBAL SPACING SYSTEM & SCALE AUDIT ---');
  const variablesCss = fs.readFileSync(path.join(cssDir, 'variables.css'), 'utf8');

  const requiredTokens = [
    '--space-1: 4px;',
    '--space-2: 8px;',
    '--space-3: 12px;',
    '--space-4: 16px;',
    '--space-5: 20px;',
    '--space-6: 24px;',
    '--space-8: 32px;',
    '--space-10: 40px;',
    '--space-12: 48px;',
    '--page-padding-desktop: 32px;',
    '--page-padding-tablet: 24px;',
    '--page-padding-mobile: 16px;',
    '--content-max-width: 1440px;',
    '--radius-sm: 8px;',
    '--radius-md: 12px;',
    '--radius-lg: 16px;',
    '--radius-xl: 20px;'
  ];

  requiredTokens.forEach(token => {
    assert(variablesCss.includes(token), `variables.css defines '${token.trim()}'`);
  });

  // 2. Audit layout.css
  console.log('\n--- SECTION 2: GLOBAL PAGE LAYOUT & HEADER HIERARCHY ---');
  const layoutCss = fs.readFileSync(path.join(cssDir, 'layout.css'), 'utf8');

  assert(layoutCss.includes('.page-container'), 'layout.css provides .page-container class');
  assert(layoutCss.includes('max-width: var(--content-max-width'), 'page-container uses --content-max-width');
  assert(layoutCss.includes('.page-header'), 'layout.css standardizes .page-header');
  assert(layoutCss.includes('.page-section + .page-section'), 'layout.css standardizes inter-section spacing');
  assert(layoutCss.includes('.main-content'), 'layout.css standardizes .main-content');
  assert(layoutCss.includes('.bottom-nav-spacer'), 'layout.css defines .bottom-nav-spacer to prevent bottom nav overlap');
  assert(layoutCss.includes('font-size: 1.5rem'), 'layout.css standardizes user page header titles to 1.5rem (24px)');

  // 3. Audit reset.css and global box-sizing
  console.log('\n--- SECTION 3: CSS RESET & GLOBAL BOX MODEL ---');
  const resetCss = fs.readFileSync(path.join(cssDir, 'reset.css'), 'utf8');
  assert(resetCss.includes('box-sizing: border-box;'), 'reset.css enforces universal box-sizing: border-box');
  assert(!resetCss.includes('#15171A'), 'reset.css uses light-pink text color tokens');

  // 4. Audit responsive.css viewports
  console.log('\n--- SECTION 4: RESPONSIVE FOUNDATIONS (320px to 1920px) ---');
  const responsiveCss = fs.readFileSync(path.join(cssDir, 'responsive.css'), 'utf8');

  assert(responsiveCss.includes('overflow-x: hidden;'), 'responsive.css enforces zero horizontal overflow');
  assert(responsiveCss.includes('max-width: 340px'), 'responsive.css covers ultra-narrow viewports (320px-340px)');
  assert(responsiveCss.includes('max-width: 380px'), 'responsive.css covers standard mobile viewports (360px-380px)');
  assert(responsiveCss.includes('min-width: 640px'), 'responsive.css covers phablet/small tablet viewports (640px)');
  assert(responsiveCss.includes('min-width: 768px'), 'responsive.css covers tablet portrait (768px)');
  assert(responsiveCss.includes('min-width: 1024px'), 'responsive.css covers laptop/desktop viewports (1024px)');
  assert(responsiveCss.includes('min-width: 1440px'), 'responsive.css enforces 1440px-1920px max content boundaries');

  // 5. Audit header.css & bottom-navigation.css
  console.log('\n--- SECTION 5: HEADER & NAVIGATION DOCKING & ALIGNMENT ---');
  const headerCss = fs.readFileSync(path.join(cssDir, 'header.css'), 'utf8');
  const bottomNavCss = fs.readFileSync(path.join(cssDir, 'bottom-navigation.css'), 'utf8');

  assert(headerCss.includes('border-top-left-radius'), 'header.css aligns with rounded app-container on tablet/desktop');
  assert(bottomNavCss.includes('border-left: 1px solid'), 'bottom-navigation.css aligns side borders on tablet/desktop');
  assert(bottomNavCss.includes('max-width: var(--container-max-width'), 'bottom-navigation.css adheres to container width');

  // 6. Audit home.css & BET ON TOSS popup
  console.log('\n--- SECTION 6: HOME PAGE & BET ON TOSS POPUP ALIGNMENT ---');
  const homeCss = fs.readFileSync(path.join(cssDir, 'home.css'), 'utf8');

  assert(homeCss.includes('.bet-modal-overlay'), 'home.css styles bet modal overlay');
  assert(homeCss.includes('.bet-modal-card'), 'home.css styles bet modal card');
  assert(homeCss.includes('.bet-limits-pill'), 'home.css styles stake limits pill');
  assert(homeCss.includes('.bet-presets-row'), 'home.css styles quick stake preset buttons');
  assert(homeCss.includes('.bet-summary-card'), 'home.css styles wager summary card');
  assert(homeCss.includes('.btn-confirm-bet'), 'home.css styles full-width bet confirm action');

  // 7. Audit admin.css
  console.log('\n--- SECTION 7: ADMIN PORTAL ALIGNMENT & 1440PX CONTAINER ---');
  const adminCss = fs.readFileSync(path.join(cssDir, 'admin.css'), 'utf8');

  assert(adminCss.includes('max-width: var(--content-max-width, 1440px)'), 'admin.css uses --content-max-width for admin-header-inner, admin-nav-inner, and admin-main');
  assert(adminCss.includes('padding: 0 var(--page-padding-desktop, 32px)'), 'admin.css uses --page-padding-desktop for topbar and nav');
  assert(adminCss.includes('.admin-kpi-grid'), 'admin.css defines .admin-kpi-grid');
  assert(adminCss.includes('.admin-table-container'), 'admin.css defines responsive table containers');

  // 8. Audit HTML page stylesheet inclusion
  console.log('\n--- SECTION 8: HTML PAGE STYLESHEET LINK INTEGRITY ---');
  const htmlFiles = [
    indexHtmlPath,
    path.join(pagesDir, 'bets.html'),
    path.join(pagesDir, 'passbook.html'),
    path.join(pagesDir, 'profile.html'),
    path.join(pagesDir, 'match-details.html'),
    path.join(pagesDir, 'admin.html'),
    path.join(pagesDir, 'login.html'),
    path.join(pagesDir, 'register.html'),
    path.join(pagesDir, 'forgot-password.html'),
    path.join(pagesDir, 'reset-password.html')
  ];

  htmlFiles.forEach(file => {
    const filename = path.basename(file);
    const content = fs.readFileSync(file, 'utf8');
    assert(content.includes('variables.css'), `${filename} links to variables.css`);
    assert(content.includes('reset.css'), `${filename} links to reset.css`);
    assert(content.includes('global.css'), `${filename} links to global.css`);
    assert(content.includes('layout.css'), `${filename} links to layout.css`);
    assert(content.includes('responsive.css'), `${filename} links to responsive.css`);
  });

  // 9. Absence of hardcoded rogue colors
  console.log('\n--- SECTION 9: THEME CONSISTENCY & NO ROGUE #15171A ---');
  const allCssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
  let rogueColorFound = false;

  allCssFiles.forEach(cssFile => {
    const content = fs.readFileSync(path.join(cssDir, cssFile), 'utf8');
    if (content.includes('#15171A')) {
      rogueColorFound = true;
      console.error(`  [FAIL] ${cssFile} contains rogue color #15171A`);
      failed++;
    }
  });

  if (!rogueColorFound) {
    assert(true, 'All CSS files are free of rogue #15171A text colors');
  }

  console.log('\n==================================================================');
  console.log(`AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runAudit();
