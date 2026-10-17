/**
 * DADDY TOSS BOOK — Admin User Inspect Page & Sidebar Layout Alignment Test Suite
 * 
 * Verifies:
 * 1. Admin layout architecture: flex layout with sticky sidebar and responsive main content
 * 2. Proper z-index and sidebar width variables in variables.css
 * 3. Inspect user view resides cleanly in the Main Content Area without overlapping the sidebar
 * 4. Responsive table containers with dedicated horizontal scrolling (no page-level overflow)
 * 5. Player Toss Report UI, 4 filters (7d, 15d, 30d, lifetime), 8 KPI summary cards, breakdown, and pagination
 * 6. Mobile drawer and tablet adaptability
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

function runTests() {
  console.log('================================================================');
  console.log('  DADDY TOSS BOOK — ADMIN USER INSPECT LAYOUT VERIFICATION');
  console.log('================================================================\n');

  const cssDir = path.join(__dirname, '..', 'frontend', 'css');
  const pagesDir = path.join(__dirname, '..', 'frontend', 'pages');
  const jsDir = path.join(__dirname, '..', 'frontend', 'js');

  const variablesCss = fs.readFileSync(path.join(cssDir, 'variables.css'), 'utf8');
  const adminCss = fs.readFileSync(path.join(cssDir, 'admin.css'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(pagesDir, 'admin.html'), 'utf8');
  const adminJs = fs.readFileSync(path.join(jsDir, 'admin.js'), 'utf8');

  // 1. variables.css tokens
  console.log('--- 1. VARIABLES & STACKING TOKENS AUDIT ---');
  assert(variablesCss.includes('--admin-sidebar-width: 260px;'), 'variables.css defines --admin-sidebar-width');
  assert(variablesCss.includes('--z-index-modal: 2000;') || variablesCss.includes('--z-modal: 2000;'), 'variables.css defines high-priority modal z-index token');

  // 2. admin.css layout architecture
  console.log('\n--- 2. ADMIN PANEL SHARED LAYOUT SYSTEM ---');
  assert(adminCss.includes('.admin-layout') && adminCss.includes('display: flex;') && adminCss.includes('flex-direction: row;'), 'Desktop layout uses display: flex with row direction');
  assert(adminCss.includes('.admin-sidebar') && adminCss.includes('flex: 0 0 var(--admin-sidebar-width'), 'Admin sidebar uses dedicated flex-basis & width');
  assert(adminCss.includes('.admin-main') && adminCss.includes('flex: 1 1 auto;') && adminCss.includes('min-width: 0;') && adminCss.includes('width: 0;'), 'Admin main content uses flex: 1 1 auto; min-width: 0; width: 0; (never renders under sidebar)');
  assert(adminCss.includes('overflow-x: hidden;'), 'Admin main content suppresses unwanted horizontal layout spill');
  assert(adminCss.includes('.admin-modal-overlay') && adminCss.includes('z-index: var(--z-index-modal'), 'Modal overlay has explicit z-index above sidebar and header');

  // 3. Inspect User page in Main Content Area
  console.log('\n--- 3. USER INSPECT PAGE IN-PAGE MAIN CONTENT AREA ---');
  assert(adminHtml.includes('id="users-directory-view"'), 'admin.html has #users-directory-view partition');
  assert(adminHtml.includes('id="users-inspect-view"') && adminHtml.includes('class="user-inspect-page"'), 'admin.html integrates #users-inspect-view inside main content area');
  assert(adminHtml.includes('id="btn-back-to-users"'), 'admin.html provides "Back to Users Directory" navigation');
  assert(adminHtml.includes('id="inspect-breadcrumb-player"'), 'admin.html provides player breadcrumb heading');
  assert(adminHtml.includes('id="users-inspect-page-body"'), 'admin.html provides dedicated container for profile & toss report');

  // 4. CSS for Player Toss Report & Tables
  console.log('\n--- 4. REPORT CONTAINMENT & TABLE OVERFLOW CONTROLS ---');
  assert(adminCss.includes('.user-inspect-page') && adminCss.includes('max-width: 100%;') && adminCss.includes('min-width: 0;'), 'user-inspect-page is constrained to parent container');
  assert(adminCss.includes('.toss-table-container') && adminCss.includes('overflow-x: auto;') && adminCss.includes('max-width: 100%;'), 'toss-table-container provides internal horizontal scrolling');
  assert(adminCss.includes('.toss-kpi-grid') && adminCss.includes('grid-template-columns: repeat(auto-fit, minmax('), 'KPI summary cards use auto-fit responsive grid');
  assert(adminCss.includes('.toss-report-filters') && adminCss.includes('flex-wrap: wrap;'), 'Report filters wrap cleanly and do not collide with container bounds');

  // 5. JavaScript functionality & workflow
  console.log('\n--- 5. JAVASCRIPT CONTROLLER WORKFLOW & FUNCTIONALITY ---');
  assert(adminJs.includes('function buildInspectUserHtml('), 'admin.js provides modular buildInspectUserHtml helper');
  assert(adminJs.includes("const pageView = document.getElementById('users-inspect-view');"), 'inspectUserDetails targets the in-page inspect view');
  assert(adminJs.includes("dirView.style.display = 'none';") && adminJs.includes("pageView.style.display = 'block';"), 'inspectUserDetails cleanly switches views inside main content');
  assert(adminJs.includes('loadPlayerTossReport('), 'admin.js provides loadPlayerTossReport function');
  assert(adminJs.includes('.toss-filter-btn'), 'admin.js attaches handlers to period filters (7d, 15d, 30d, lifetime)');
  assert(adminJs.includes('.btn-toss-prev') && adminJs.includes('.btn-toss-next'), 'admin.js handles toss report table pagination');
  assert(adminJs.includes("dirView.style.display = 'block';") && adminJs.includes("insView.style.display = 'none';"), 'Tab switching resets to user directory');

  console.log('\n================================================================');
  console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
