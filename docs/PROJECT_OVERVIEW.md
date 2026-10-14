# IRONMAN TOSS BOOK - Project Overview

## 1. Executive Summary
**IRONMAN TOSS BOOK** is a responsive sports toss wagering, ledger, and account management web platform. Designed with a mobile-first philosophy inspired by clean sports entertainment interfaces, the system delivers real-time match toss betting, instant passbook tracking, and administrative governance.

The project is executed under a structured **20-Day Incremental Development Plan**, transitioning from structural foundation through UI, backend APIs, transactional safety, administrative control, security auditing, and production readiness.

---

## 2. Core Architecture & Tech Stack

The architecture adheres strictly to lightweight, robust, and accessible enterprise standards without heavyweight frontend abstractions:

| Tier | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | HTML5, CSS3 (Vanilla), JavaScript (ES6+ Vanilla) | Native browser performance, minimal bundle overhead, maximum control over CSS variables and design tokens, zero external framework fragility. |
| **Backend** | Node.js (v24.x LTS) + Express.js | High-throughput asynchronous event-driven I/O, simple routing, modular architecture using CommonJS modules. |
| **Database** | MySQL (v8.x+) | Strict relational integrity, ACID-compliant transactional consistency for balances and bets, atomic ledger operations. |
| **Runtime / Tooling** | npm, Git, CORS, Dotenv | Standardized package management, version control, and multi-environment configuration isolation. |

### Architectural Constraints & Non-Negotiables
- **No Heavy Frameworks**: No React, Next.js, Vue, Angular, or TypeScript.
- **Relational Consistency**: No MongoDB, Firebase, or NoSQL solutions for the core database.
- **Backend Simplicity**: No Python or alternative backend servers; pure Node.js Express.
- **Financial Rigor**: Double-entry ledger principles, immutable transaction history, and strictly parameterized SQL queries.

---

## 3. High-Level System Scope

### A. User-Facing Application
1. **Home / Dashboard**: Overview of live and upcoming matches, quick actions, current balance snapshot, announcement carousel/ticker.
2. **Bets Page**: Real-time and historical toss bets, rate and stake details, filterable statuses (All, Live, Won, Lost, No Result).
3. **Passbook Page**: Complete ledger audit trail of deposits, withdrawals, winnings, and losses, with search and activity filters.
4. **Profile & Settings**: Account details, Dark Mode preference, App Rules, customer support, and notification settings.
5. **Authentication & Onboarding**: Login, registration, password recovery, session handling.
6. **Financial Operations**: Deposit request submission, withdrawal request flow, and exposure tracking.
7. **Rules & Notifications**: Platform governance rules, announcements, match alerts.

### B. Admin Governance Area
1. **Admin Login & Dashboard**: Metric overviews (turnover, exposure, pending approvals).
2. **User Management**: KYC verification, user status (active/suspended), balance adjustments.
3. **Match & Toss Management**: Creating matches, setting toss markets, odds/rates, declaring outcomes.
4. **Transaction Management**: Deposit approvals, withdrawal approvals, ledger reconciliation.
5. **Announcements & Rules**: Dynamic broadcast banner management, rule updates.
6. **Audit Logs & Reports**: Comprehensive immutable administrator action logs.

---

## 4. Current Stage: Day 1 of 20
**Focus**: Project initialization, directory topology, visual screenshot analysis, foundational design system (CSS variables, reset, layout, components), Node.js backend baseline with health diagnostics, and environment configuration.
