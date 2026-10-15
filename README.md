# IRONMAN TOSS BOOK

A responsive sports toss wagering, ledger, and account management web platform. Designed with a mobile-first philosophy inspired by clean sports entertainment interfaces, the system delivers real-time match toss betting, instant passbook tracking, and administrative governance.

---

## 1. Project Overview

**IRONMAN TOSS BOOK** is being developed incrementally following a structured **20-Day Implementation Roadmap**. The platform provides sports bettors with a friction-free experience for wagering on cricket and sports toss outcomes, monitoring account balances and exposure, reviewing immutable passbook ledgers, and managing personal preferences.

---

## 2. Technology Stack

The platform intentionally leverages standard, lightweight, and performant web technologies:

- **Frontend**: HTML5, CSS3 (Vanilla design tokens & custom properties), Vanilla JavaScript (ES6+). Zero external frameworks (no React, Next.js, Vue, or Angular).
- **Backend**: Node.js (v24.x LTS) with Express.js (v4.x), using standard CommonJS modules.
- **Database**: MySQL (v8.x+) for strict ACID compliance, relational foreign-key integrity, and decimal precision.
- **Tooling**: npm, Git, CORS, Dotenv, native `node --watch`.

---

## 3. Directory Structure

```text
toss/
├── frontend/                     # Client-side web application
│   ├── index.html                # Home page with shared layout & diagnostics
│   ├── pages/                    # Sub-pages
│   │   ├── bets.html             # Bets view shell (active tab test)
│   │   ├── passbook.html         # Passbook ledger shell (active tab test)
│   │   ├── profile.html          # Profile settings shell (active tab test)
│   │   ├── match-details.html    # [Day 8] Detailed match overview & toss rates
│   │   ├── login.html            # [Day 3] Sign in with validation & toggle
│   │   ├── register.html         # [Day 3] Registration with strength meter
│   │   ├── forgot-password.html  # [Day 3] Password recovery instructions
│   │   └── reset-password.html   # [Day 3] Password reset & matching
│   ├── css/
│   │   ├── variables.css         # Design tokens, color palette, spacing, typography
│   │   ├── reset.css             # Cross-browser CSS normalization
│   │   ├── global.css            # Base typography, link states, focus-visible
│   │   ├── layout.css            # Mobile-first app container & flex utilities
│   │   ├── components.css        # Buttons, cards, form inputs, status badges
│   │   ├── responsive.css        # Breakpoints & accessibility (prefers-reduced-motion)
│   │   ├── header.css            # Shared header, logo fallback, balance pills
│   │   ├── announcement-ticker.css # Ticker continuous marquee & dual tracks
│   │   ├── bottom-navigation.css # 4-tab fixed bottom navigation bar
│   │   ├── auth.css              # [Day 3] Authentication forms, strength meter & cards
│   │   ├── bets.css              # [Day 4] Bets filters, cards, and date groups
│   │   ├── passbook.css          # [Day 5] Hero balance card, search, filters, modals
│   │   ├── profile.css           # [Day 6] Profile card, settings list, switch toggles & modals
│   │   ├── home.css              # [Day 7] Featured match card, category filters & fixture cards
│   │   └── match-details.css     # [Day 8] Match summary hero, toss rates grid & metadata
│   ├── js/
│   │   ├── auth/                 # [Day 3] Client-side authentication logic
│   │   │   ├── validation.js     # Field validation, password toggles & strength checker
│   │   │   ├── login.js          # Login submission & accessible error handling
│   │   │   ├── register.js       # Register submission, strength meter & matching
│   │   │   ├── forgot-password.js# Email syntax validation & reset simulation
│   │   │   └── reset-password.js # Token status notice & password update simulation
│   │   ├── bets.js               # [Day 4] Bets dataset, date grouping & status filters
│   │   ├── passbook.js           # [Day 5] Ledger dataset, search, filters & modals
│   │   ├── profile.js            # [Day 6] Profile state, edit form, password dialog & modals
│   │   ├── matches-data.js       # [Day 8] Centralized cricket fixtures dataset & lookup
│   │   ├── home.js               # [Day 7] Fixtures feed, category filters & diagnostics
│   │   ├── match-details.js      # [Day 8] Match details controller, param resolver & rules
│   │   ├── config.js             # API base URL, mock balances, announcements config
│   │   ├── shared-layout.js      # Shared Header, Ticker & Nav rendering engine
│   │   ├── navigation.js         # Tab active states & accessibility controller
│   │   └── app.js                # Theme switcher & backend health check probe
│   └── assets/                   # Static media, icons, and fonts
│
├── backend/                      # Express.js REST API service
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js             # Non-blocking MySQL pool & diagnostics
│   │   ├── routes/
│   │   │   └── health.js         # GET /api/health and /api/health/db
│   │   └── middleware/
│   │       ├── logger.js         # Safe request logger (no sensitive leak)
│   │       └── errorHandler.js   # 404 handler & centralized error handler
│   ├── database/
│   │   └── README.md             # Schema notes (scheduled for Day 9)
│   ├── app.js                    # Express application entry point
│   └── package.json              # Backend dependencies & dev scripts
│
├── docs/                         # Architecture & planning documentation
│   ├── PROJECT_OVERVIEW.md       # High-level architecture & system scope
│   ├── SCREENSHOT_ANALYSIS.md    # Detailed UI breakdown of reference screenshots
│   ├── DESIGN_SYSTEM.md          # Tokens, color palettes, spacing, & accessibility
│   ├── DATABASE_PLAN.md          # Relational entities, ledger rules, & table specs
│   └── DEVELOPMENT_ROADMAP.md   # Day-by-day 20-day implementation plan
│
├── scripts/
│   └── serve-frontend.js         # Zero-dependency local static server (port 5500)
├── .editorconfig                 # Consistent indentation & formatting rules
├── .env.example                  # Environment variable configuration template
├── .gitignore                    # Version control exclusion rules
├── package.json                  # Root orchestration scripts
└── README.md                     # Project documentation
```

---

## 4. Prerequisites

Before running the application locally, ensure you have:

- **Node.js**: `v18.0.0` or higher (tested on `v24.18.0`)
- **npm**: `v9.0.0` or higher (tested on `v11.16.0`)
- **MySQL Server** *(Optional on Day 1)*: MySQL v8.0+ running on port 3306. Note that Day 1 runs completely without requiring a live MySQL server.
- **Web Browser**: Any modern browser (Chrome, Edge, Firefox, Safari).

---

## 5. Installation Instructions

1. Clone or navigate to the project directory:
   ```bash
   cd toss
   ```

2. Copy the environment variables template:
   - On Windows (PowerShell):
     ```powershell
     Copy-Item .env.example .env
     ```
   - On macOS/Linux:
     ```bash
     cp .env.example .env
     ```

3. Install backend dependencies:
   ```bash
   cd backend
   npm install
   cd ..
   ```

---

## 6. How to Run the Project

### A. Starting the Backend API Server

From the project root:
```bash
npm run start:backend
```
Or for auto-reloading during development:
```bash
npm run dev:backend
```
The Express server will start listening at: `http://localhost:5000`

### B. Starting the Frontend Web App

In a separate terminal window from the project root:
```bash
npm run serve-frontend
```
Open your browser and navigate to:
```text
http://localhost:5500/
```

You can also directly open `frontend/index.html` in your browser.

---

## 7. How to Test the Health Endpoint

### In the Browser
- Open `http://localhost:5000/api/health` directly, or click the **"Test Health Probe"** button on the frontend entry page (`http://localhost:5500/`).

### Via Terminal / PowerShell
```powershell
npm run test:health
```
Or with curl:
```bash
curl http://localhost:5000/api/health
```

Expected JSON response:
```json
{
  "success": true,
  "message": "IRONMAN TOSS BOOK API is running",
  "service": "ironman-toss-book-api",
  "version": "1.0.0",
  "environment": "development",
  "timestamp": "2026-10-14T...",
  "uptime": 12.34
}
```

### Database Diagnostic Endpoint
You can also test the database connection status:
```bash
curl http://localhost:5000/api/health/db
```
If MySQL is not yet configured or the `ironman_toss_book` database does not exist, it safely returns HTTP 503 with the diagnostic status without crashing the server.

---

## 8. MySQL Preparation & Current Status

- **Status**: Architecture and relational schema plan documented in `docs/DATABASE_PLAN.md`.
- **Diagnostics**: Non-blocking connectivity probe implemented in `backend/src/config/db.js`.
- **Scheduled Schema Creation**: **Day 9** will introduce the physical SQL DDL schema script (`backend/database/schema.sql`) and development seed data (`seed.sql`).
- **Honest Connection Reporting**: The backend accurately reports whether a connection could be established rather than falsifying database connectivity.

---

## 9. Current Implementation Status (Day 15 of 20)

| Feature / Area | Status | Notes |
| :--- | :--- | :--- |
| Project Structure & Config | Completed | Verified directory topology and environment template |
| Screenshot Analysis | Completed | Documented in `docs/SCREENSHOT_ANALYSIS.md` |
| Design System Tokens | Completed | CSS custom properties, typography, buttons, badges |
| Frontend Entry Point | Completed | Verified responsive layout, zero overflow, Dark Mode toggle |
| Backend Server | Completed | Express server, request logger, 404 handler, central error handler |
| API Health Endpoint | Completed | `GET /api/health` and `GET /api/health/db` verified with 200 OK |
| Shared Header | Completed (Day 2) | Brand logo fallback, Available balance (blue), Exposure (red) |
| Announcement Ticker | Completed (Day 2) | Continuous marquee with dual track loop, English & Hindi, pause on hover |
| Bottom Navigation | Completed (Day 2) | 4 tabs (Home, Bets, Passbook, Profile) with SVGs, active states, safe-area support |
| Authentication Suite | Completed (Day 3) | Login, Register, Forgot Password, Reset Password, validation, strength meter |
| Bets Page UI (Baseline) | Completed (Day 4) | Status filters (All, Live, Won, Lost, No Result), date grouping, bet cards, empty state |
| Passbook Page UI (Baseline) | Completed (Day 5) | Hero balance card (₹10,000), search, type/status filters, ledger cards, Deposit/Withdraw modals |
| Profile & Settings UI | Completed (Day 6) | Hero profile card, personal info grid, interactive settings, Dark Mode switch, edit & security modals |
| Home Dashboard & Matches | Completed (Day 7) | Featured live toss card, category filter pills, match fixture cards, rate previews |
| Match Details Page UI | Completed (Day 8) | Dynamic URL routing (`?id=`), match summary hero, toss rates preview, venue metadata, rules, and not-found state |
| Bets Page Enhancement | Completed (Day 9) | Dynamic summary metrics cards, search input with clear button, status filter strip with counter badges, enhanced cards with bet ID & financial breakdown, accessible Bet Details modal, and empty state reset |
| Passbook Page Enhancement | Completed (Day 10) | Dynamic ledger balance derivation (`calculateLedgerSummary()`), enriched transaction metadata (category, method, reference code, remarks), interactive Transaction Details modal dialog, synchronized header balances, unified search, and empty state reset |
| Profile & Account Settings Enhancement | Completed (Day 11) | Dynamic avatar initials badge (`#hero-avatar-initials`), real-time error clearing, button loading states ("Saving...", "Updating..."), password policy validation, notification switches with toast feedback, and session clearance on logout |
| UI Consistency & Shared Components | Completed (Day 12) | Standardized status badges (.badge-live, .badge-won, .badge-lost, etc.), skeleton loaders (.skeleton, .skeleton-text), inline alerts (.alert), standardized empty states across all feeds (.empty-state), reusable toast notification engine (SharedLayout.showToast), INR currency & date formatters, button loading states (.btn-loading, .btn-spinner), safe-area bottom navigation, and global modal Escape listener |
| Auth Security & Backend API Protection | Completed (Day 13) | MySQL users & wallets relational schema DDL, scrypt password hashing with unique salts, HS256 signed JWT tokens, timing-safe equality verification, in-memory rate-limiter, security headers (nosniff, SAMEORIGIN), authentication middleware (Bearer token & role guard), sanitized user responses, IDOR protection, mass-assignment defense, and full endpoint suite (register, login, me, profile, change-password, logout) |
| Admin Dashboard & Application Governance | Completed (Day 14) | Comprehensive SaaS administrative portal (`frontend/pages/admin.html`), KPI cards, server-side paginated user management with search and filters, user moderation (suspend/restore/ban) with immediate session revocation, role assignments, immutable audit trail (`admin_audit_logs`), operational monitoring (`/api/admin/system/status`), idempotent admin seeding (`backend/src/config/seedAdmin.js`), and role-based API protection (`admin`, `super_admin`) |
| API Integration, Data Integrity & Reliability | Completed (Day 15) | Standardized frontend HTTP client (`frontend/js/api-client.js`), normalized response envelopes (`data: { user, token }` and top-level fields), live auth flows (Login, Register, Profile, Change Password, Logout), session synchronization with header and passbook balance cards, strict user isolation / IDOR defense, atomic MySQL transactions across `users`, `wallets`, and `user_preferences`, and full end-to-end regression testing (82/82 Day 15 tests passed; 450+ total test assertions passed) |

> [!NOTE]
> **Backend API Integration, MySQL Data Integrity, End-to-End Testing & Reliability (Day 15)**:
> Day 15 audits and strengthens all connections between the frontend, Express backend APIs, authentication system, and MySQL database. A standardized, resilient frontend API client (`frontend/js/api-client.js`) centralizes base URL resolution, token lifecycle management, response error normalization, and real-time wallet balance synchronization. Backend auth and profile response envelopes were normalized with dual-property compatibility (`full_name` and `fullName`, `wallet` object, and structured `data` envelopes). The login and registration pages are fully wired to backend APIs with live error display and redirection. The user profile page is integrated with live `/api/auth/me`, `/api/auth/profile`, and `/api/auth/change-password` endpoints. User isolation is verified to prevent unauthorized cross-user data tampering. Atomic MySQL transactions ensure data consistency across multiple related tables during registration, and comprehensive automated integration testing verifies 82 integration assertions alongside 100% backward test suite compatibility.

---

## 10. Planned 20-Day Sequence

- **Day 1**: Project initialization, screenshot analysis, CSS foundation, Express health probe.
- **Day 2**: Shared header, announcement ticker, and mobile bottom navigation.
- **Day 3**: Login, registration, and password recovery UI.
- **Day 4**: Bets page UI (status filters, bet history cards).
- **Day 5**: Passbook page UI (hero balance, search, credit/debit records).
- **Day 6**: Profile page, Dark Mode toggle, and settings.
- **Day 7**: Home dashboard UI (matches, live odds).
- **Day 8**: Responsive design and visual polish audit.
- **Day 9**: MySQL schema DDL script and seed data.
- **Day 10**: Express backend database connection pool and query helpers.
- **Day 11**: User authentication backend (registration, login, JWT/sessions).
- **Day 12**: Profile and preferences APIs.
- **Day 13**: Bets APIs (odds listing, bet placement with balance locking).
- **Day 14**: Wallet, Passbook, and double-entry ledger APIs.
- **Day 15**: Simulated deposit and withdrawal lifecycle.
- **Day 16**: Admin dashboard UI.
- **Day 17**: Admin management APIs and toss settlement engine.
- **Day 18**: Frontend-backend integration and security audit.
- **Day 19**: End-to-end testing, edge cases, and bug remediation.
- **Day 20**: Production deployment preparation and final verification.

---

## 11. Known Limitations (Day 1)

1. The frontend entry view is an initialization and diagnostic screen; full Bets, Passbook, and Profile UIs will be developed in subsequent days.
2. MySQL database tables have not yet been instantiated (scheduled for Day 9).
3. Authentication and user session tokens are not yet implemented (scheduled for Day 11).
