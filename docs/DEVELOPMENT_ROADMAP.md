# IRONMAN TOSS BOOK - 20-Day Incremental Development Roadmap

This document outlines the systematic, day-by-day development schedule for **IRONMAN TOSS BOOK**. Each day defines specific objectives, deliverables, dependencies, and verifiable completion criteria.

---

### Day 1: Project Initialization and Screenshot Analysis (Current Day)
- **Objective**: Establish foundational directory structure, inspect existing environment, document visual analysis from reference screenshots, construct CSS token system, scaffold Express backend with health diagnostics, and prepare version control.
- **Deliverables**: `.gitignore`, `.editorconfig`, `.env.example`, `README.md`, documentation suite in `docs/`, CSS foundations (`variables.css`, `reset.css`, `global.css`, `layout.css`, `components.css`, `responsive.css`), frontend entry point (`frontend/index.html`), backend initialization (`package.json`, `app.js`, health route).
- **Dependencies**: None.
- **Completion Criteria**: Clean directory structure, working health check endpoint `GET /api/health`, valid HTML/CSS frontend welcome view, no console or linter errors.

---

### Day 2: Shared Header, Ticker, and Navigation
- **Objective**: Build reusable shared components observed in reference screenshots: top branding header with balance/exposure pills, live announcement marquee ticker, and fixed mobile bottom navigation bar.
- **Deliverables**: Component templates for header, marquee ticker, and 4-tab bottom navigation (`frontend/js/navigation.js`, header and navigation styles).
- **Dependencies**: Day 1 Design System & CSS Foundation.
- **Completion Criteria**: Sticky/fixed header and bottom bar with proper z-indexing, active tab styling, ticker horizontal marquee animation, smooth viewport resizing without horizontal overflow.

---

### Day 3: Login, Registration, and Password Reset UI
- **Objective**: Develop user onboarding interfaces matching the platform's visual identity.
- **Deliverables**: `frontend/pages/login.html`, `frontend/pages/register.html`, form validation logic in vanilla JavaScript, input states (idle, active, focus, error, disabled).
- **Dependencies**: Day 1 CSS tokens, Day 2 layout container.
- **Completion Criteria**: Accessible forms, client-side input validation (phone number, strong password), friendly error messaging, link routing between auth views.

---

### Day 4: Bets Page UI
- **Objective**: Implement the full client-side interface for the Bets Page observed in screenshots.
- **Deliverables**: `frontend/pages/bets.html`, segmented status filters (`All`, `Live`, `Won`, `Lost`, `No Result`), date-grouped bet card feed, status badge styling (`Won` green, `Lost` red, `Live` blue).
- **Dependencies**: Day 1 Design tokens, Day 2 Header & Navigation.
- **Completion Criteria**: Interactive filter buttons switching mock card states, accurate typographic and badge representation matching screenshot layout.

---

### Day 5: Passbook Page UI
- **Objective**: Implement the Passbook ledger interface observed in screenshots.
- **Deliverables**: `frontend/pages/passbook.html`, hero account balance card with Deposit and Withdraw CTA buttons, transaction search field, activity filters (`All`, `Credit`, `Debit`), signed transaction rows with timestamps.
- **Dependencies**: Day 1 Design tokens, Day 2 Header & Navigation.
- **Completion Criteria**: Clean hero balance card, working search/filter UI interactions, distinct visual styling for credit (+ green) and debit (- red) records.

---

### Day 6: Profile Page and Settings
- **Objective**: Implement the user profile, dark mode switcher, and settings interface observed in screenshots.
- **Deliverables**: `frontend/pages/profile.html`, user avatar summary card, Dark Mode toggle switch (with `localStorage` persistence), App Rules modal/subview, customer support link integration.
- **Dependencies**: Day 1 CSS tokens & dark theme variables, Day 2 Navigation.
- **Completion Criteria**: Functional Dark Mode toggle switching `data-theme="dark"` across the document, responsive menu layout with touch-friendly rows.

---

### Day 7: Home Dashboard UI
- **Objective**: Design and build the primary Home dashboard presenting live matches, toss market odds, quick wagers, and banner promotions.
- **Deliverables**: `frontend/pages/home.html`, match fixture cards, live odds selector pills, quick stake modal/drawer component.
- **Dependencies**: Days 1–6 components and layout standards.
- **Completion Criteria**: Intuitive match list view, odds selection interaction, seamless integration with top balance and bottom navigation.

---

### Day 8: Responsive Design and Visual Polish
- **Objective**: Comprehensive responsive audit, cross-browser compatibility pass, and UI refinement across mobile, tablet, and desktop viewports.
- **Deliverables**: Media query refinements in `responsive.css`, touch gesture optimizations, accessibility audit (keyboard focus, screen reader aria-labels).
- **Dependencies**: Days 2–7 frontend views.
- **Completion Criteria**: Flawless display on 360px, 480px, 768px, and 1024px+ screens; WCAG AA contrast compliance; zero layout shifting.

---

### Day 9: MySQL Schema and Seed Data
- **Objective**: Write production-grade MySQL schema DDL scripts, table definitions, foreign keys, constraints, and realistic development seed data.
- **Deliverables**: `backend/database/schema.sql`, `backend/database/seed.sql`, migration instructions.
- **Dependencies**: Day 1 Database Plan (`docs/DATABASE_PLAN.md`).
- **Completion Criteria**: Clean DDL execution in MySQL, strict foreign-key integrity, indexed columns, populated seed dataset for testing.

---

### Day 10: Express Backend and Database Foundation
- **Objective**: Build robust MySQL connection pool manager with retry handling, structured configuration, and centralized logging.
- **Deliverables**: `backend/src/config/db.js`, query execution wrappers, database health probe endpoint.
- **Dependencies**: Day 1 Backend scaffold, Day 9 MySQL schema.
- **Completion Criteria**: Automated ping to MySQL verifying connection pooling, graceful fallback handling if database is temporarily offline.

---

### Day 11: Authentication Backend
- **Objective**: Implement secure user registration, password hashing (bcrypt), login authentication, and session/JWT tokens.
- **Deliverables**: `backend/src/controllers/authController.js`, auth routes, validation middleware, rate limiting.
- **Dependencies**: Day 10 Database connectivity, Day 3 Auth forms.
- **Completion Criteria**: Secure registration and login flow, cryptographic password verification, HTTP-only cookie or bearer token response.

---

### Day 12: Profile and Preferences APIs
- **Objective**: Build backend endpoints for retrieving and updating user profile data and personal preferences.
- **Deliverables**: Profile controllers, preferences routes, authentication protection middleware.
- **Dependencies**: Day 11 Authentication middleware.
- **Completion Criteria**: Authenticated user can read profile, update username/contact info, and persist dark mode / notification preferences.

---

### Day 13: Bets APIs
- **Objective**: Develop endpoints for listing active toss markets, placing bets with transactional balance deductions, and retrieving bet histories.
- **Deliverables**: Bets controllers, validation for minimum/maximum stakes, atomic deduction of available balance and increment of exposure.
- **Dependencies**: Day 11 Auth, Day 10 DB transactions.
- **Completion Criteria**: Atomic bet placement prevents overdrafts; bet status filtering (`All`, `Live`, `Won`, `Lost`) returns valid data.

---

### Day 14: Wallet, Passbook, and Ledger APIs
- **Objective**: Build double-entry ledger calculation endpoints, real-time balance queries, and transaction history feeds with search and pagination.
- **Deliverables**: Wallet service, passbook routes, balance inquiry endpoints.
- **Dependencies**: Day 10 Database transactions, Day 13 Bets.
- **Completion Criteria**: Mathematical ledger reconciliation where calculated ledger sum equals current wallet balance.

---

### Day 15: Simulated Deposit and Withdrawal Workflows
- **Objective**: Build the financial request lifecycle for user deposits (payment proof submission) and withdrawal requests.
- **Deliverables**: Deposit/withdrawal controllers, request status tracking, input validation.
- **Dependencies**: Day 14 Wallet ledger.
- **Completion Criteria**: Submitted requests appear in user pending transactions and enter administrative queue.

---

### Day 16: Admin Dashboard UI
- **Objective**: Build the administrative frontend portal with metric cards, live match oversight, and queue counters.
- **Deliverables**: `frontend/pages/admin/dashboard.html`, admin layout styling, management navigation bar.
- **Dependencies**: Days 1–2 design system components.
- **Completion Criteria**: Responsive administrative view displaying platform KPIs (turnover, exposure, pending deposits/withdrawals).

---

### Day 17: Admin APIs and Management Controls
- **Objective**: Implement backend administrative APIs for match creation, toss outcome declaration, deposit/withdrawal approvals, and user moderation.
- **Deliverables**: Admin controllers, match management routes, settlement resolution engine with automatic winner payout distribution, audit log middleware.
- **Dependencies**: Day 13 Bets, Day 14 Wallet, Day 16 Admin UI.
- **Completion Criteria**: Admin can declare toss winner; system automatically distributes winnings and creates ledger records for all affected bettors.

---

### Day 18: Integration and Security Audit
- **Objective**: Wire all frontend pages to live backend REST endpoints, execute security hardening (helmet, CORS validation, rate limiting, SQL injection defense, XSS protection).
- **Deliverables**: Integration service layers in frontend JavaScript, security middleware configuration.
- **Dependencies**: Days 1–17 frontend and backend modules.
- **Completion Criteria**: Zero hardcoded frontend mock states; robust defense against common OWASP vulnerabilities.

---

### Day 19: Testing and Bug Fixing
- **Objective**: Comprehensive end-to-end integration testing, edge-case financial testing, concurrency testing (race conditions on bet placement), and bug remediation.
- **Deliverables**: Test scripts, bug fix patches, performance optimizations.
- **Dependencies**: Day 18 Integrated system.
- **Completion Criteria**: 100% pass on core financial workflows, error-free browser console, sub-100ms API response times on local test runs.

---

### Day 20: Deployment and Final Verification
- **Objective**: Production configuration preparation, process manager setup (PM2/systemd), environment variable validation, and comprehensive final sign-off.
- **Deliverables**: Production deployment checklist, process configuration, final documentation handoff.
- **Dependencies**: Days 1–19 completed deliverables.
- **Completion Criteria**: Application runs reliably in production mode, all 20-day requirements fulfilled and verified.
