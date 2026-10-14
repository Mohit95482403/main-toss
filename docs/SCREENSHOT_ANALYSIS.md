# IRONMAN TOSS BOOK - Reference Screenshot Analysis

This document provides an architectural and visual breakdown based on the reference screenshots for the **IRONMAN TOSS BOOK** platform. 

> [!IMPORTANT]
> The screenshots establish three specific mobile interfaces: **Bets Page**, **Passbook Page**, and **Profile Page**.
> The Home page, Login/Registration flows, Deposit/Withdrawal modals, and Admin Dashboard have **not** been visually captured in these reference screenshots and will be designed following consistent design system tokens during their scheduled implementation days.

---

## 1. Global / Shared Elements Observed Across Pages

### Shared Header
- **Branding**: "IRONMAN TOSS BOOK" text logo displayed prominently with brand color accentuation.
- **Financial Status Bar**:
  - **Available Balance**: Distinct pill/badge displaying balance (e.g., `Bal: ₹0.00`).
  - **Secondary Exposure / Liability**: Indicator showing ongoing exposure or secondary funds.
- **Announcement Ticker**: A scrolling horizontal marquee/ticker strip directly below the header presenting platform notices, match announcements, or system alerts.

### Bottom Navigation Bar (Fixed Mobile Tabbar)
- Fixed at the bottom of the viewport (`position: fixed; bottom: 0; left: 0; right: 0; z-index: 100`).
- Displays 4 primary destination items:
  1. **Home** (icon + label)
  2. **Bets** (icon + label)
  3. **Passbook** (icon + label)
  4. **Profile** (icon + label)
- Active tab state indicated with primary blue tint (`#0860BE`) and contrasting fill/icon stroke.

---

## 2. Page A: Bets Page Analysis

### 1. Visible Components
- Shared Header with Logo, Balance indicator, and Exposure.
- Scrolling Announcement Ticker.
- Horizontal Segmented Filter Bar:
  - Filters: `All`, `Live`, `Won`, `Lost`, `No Result`.
- Date grouping headers (e.g., "14 Oct 2026", "Yesterday").
- Betting History Cards:
  - Tournament badge / label (e.g., "ICC Men's T20 World Cup").
  - Competing teams header (e.g., "India vs Australia").
  - Selected outcome / team (e.g., "Toss Winner: India").
  - Displayed betting rate / odds (e.g., `Rate: 1.95`).
  - Stake / Amount invested (e.g., `Amount: ₹500.00`).
  - Status pill / badge (`Lost`, `Won`, `Live`).
  - Outcome result summary message.
- Fixed Bottom Navigation Bar.

### 2. Component Hierarchy
```text
Body
└── Page Container
    ├── Header (Brand + Balance + Exposure)
    ├── Announcement Ticker
    ├── Filter Tab Strip (All | Live | Won | Lost | No Result)
    ├── Bets Feed Container
    │   ├── Date Group Header
    │   └── Bet Card Item
    │       ├── Card Header (Tournament & Match Title)
    │       ├── Card Body (Chosen Side, Rate, Stake)
    │       └── Card Footer (Status Pill & Settlement Message)
    └── Bottom Navigation Bar
```

### 3. Approximate Layout
- Mobile-first, single column layout (max container width ~480px centered on wider screens).
- Filter strip is horizontally scrollable or full-width segmented on mobile.
- Bet cards feature a clean elevated surface on a soft background.

### 4. Colors & Visual Treatment
- **Background**: Soft off-white/light gray (`#F6F8FA`).
- **Cards**: Clean white (`#FFFFFF`) with subtle border (`#E5E7EB`) and micro drop-shadow.
- **Primary Highlights**: Royal blue (`#0860BE`).
- **Status Badges**:
  - `Won`: Soft green background with dark green text (`#16A34A` / `#DCFCE7`).
  - `Lost`: Soft red background with deep crimson text (`#D62828` / `#FEE2E2`).
  - `Live` / `Pending`: Soft amber or blue badge.

### 5. Typography Hierarchy
- Header Brand: Semi-bold / Bold, ~16px-18px.
- Match Titles: Semi-bold, ~14px-15px (`#15171A`).
- Tournament Label: Uppercase micro-label, ~11px-12px (`#737B87`).
- Rate & Amount: Medium, ~13px (`#4B5563`), with numeric values emphasized.

### 6. Spacing & Rounded Corners
- Card padding: `12px` to `16px`.
- Card border radius: `10px` to `12px`.
- Status pills: Fully rounded (`border-radius: 9999px`).
- Filter buttons: `6px` to `8px` border radius.

### 7. Responsive Inferences
- On small screens (< 480px), cards span 100% width with 12px margin.
- On tablet/desktop (> 768px), the layout should constrain to a mobile emulator or centered app card container (~480px-600px) to preserve native mobile app ergonomics.

### 8. Shared Components
- Header, Ticker, and Bottom Navigation are identical across tabs.

### 9. Uncertainties & Assumptions
- *Uncertainty*: Exact live betting placement interaction (drawer vs modal vs inline odds click).
- *Assumption*: Clicking a match or bet opens a detailed modal or navigation state on future implementation days.

### 10. Future Implementation Requirements (Scheduled Day: Day 4)
- Filter state handler.
- Dynamic bet card rendering engine.
- Responsive date-grouped collection view.

---

## 3. Page B: Passbook Page Analysis

### 1. Visible Components
- Shared Header (Brand, Balance, Exposure).
- Account Balance Summary Hero Card:
  - Total Wallet Balance display.
  - Active Exposure balance.
  - Action CTA Buttons: **Deposit** (Primary) and **Withdraw** (Secondary / Outline).
- Search & Filter Controls:
  - Search input field (filter by transaction ID or description).
  - Activity / Transaction Type filter pills (`All`, `Credit`, `Debit`).
- Chronological Transaction Cards:
  - Transaction Type indicator / icon (Credit vs Debit).
  - Transaction Title / Description (e.g., "Toss Bet Won - IND vs AUS", "Deposit via UPI").
  - Unique Transaction ID reference code.
  - Formatted Timestamp (e.g., "14 Oct 2026, 04:30 PM").
  - Signed Transaction Amount (+₹975.00 in green, -₹500.00 in red).
  - Closing balance post-transaction.
- Fixed Bottom Navigation Bar.

### 2. Component Hierarchy
```text
Body
└── Page Container
    ├── Header
    ├── Hero Balance Card
    │   ├── Balance Display (Available & Exposure)
    │   └── Action Row (Deposit Button + Withdraw Button)
    ├── Search & Filter Toolbar
    │   ├── Search Input Box
    │   └── Activity Filter Pills (All | Credit | Debit)
    ├── Transaction Feed Container
    │   └── Transaction Item Card
    │       ├── Left Column: Transaction Type Icon & Details (Title, ID, Date)
    │       └── Right Column: Signed Amount & Post-Balance
    └── Bottom Navigation Bar
```

### 3. Approximate Layout
- Hero card sits immediately below the header.
- Deposit and Withdraw buttons positioned side-by-side with equal flex ratio.
- Transaction items stacked in a dense, scannable list.

### 4. Colors & Visual Treatment
- Hero Card: Solid high-contrast surface or deep primary gradient with white text.
- Credit Amount: Vibrant forest green (`#16A34A`).
- Debit Amount: Vibrant warning red (`#D62828`).
- Transaction ID: Muted monospace or small gray label (`#737B87`).

### 5. Typography Hierarchy
- Hero Balance: Bold headline ~24px-28px.
- Action Buttons: Semi-bold ~14px.
- Transaction Amount: Bold ~15px with explicit `+` or `-` prefix.
- Timestamp & ID: Regular ~11px-12px.

### 6. Spacing & Rounded Corners
- Hero Card: `14px` border radius, `16px-20px` internal padding.
- Action Buttons: `8px-10px` border radius.
- Transaction Item Cards: `8px-10px` border radius with `8px` bottom margin.

### 7. Responsive Inferences
- Compact vertical stacking keeps critical financial balances visible without scrolling on standard smartphones.

### 8. Shared Components
- Top Header and Bottom Navigation.

### 9. Uncertainties & Assumptions
- *Uncertainty*: Exact payment gateway modal or manual deposit upload proof flow.
- *Assumption*: Deposit & Withdraw triggers will open dedicated verification workflows (scheduled for Day 15).

### 10. Future Implementation Requirements (Scheduled Day: Day 5)
- Search filter debouncing.
- Ledger pagination / infinite scroll capability.
- Signed currency formatting utility.

---

## 4. Page C: Profile Page Analysis

### 1. Visible Components
- Shared Header (Brand, Balance, Exposure).
- User Profile Overview Card:
  - User Avatar placeholder / profile picture.
  - Username display (e.g., `IRONMAN_99`).
  - User Mobile / ID reference.
  - "Edit Profile" action button or pencil icon.
- Settings & Preferences Menu List:
  - **App Rules**: Terms, toss rules, settlement conditions (navigates to App Rules view).
  - **Dark Mode**: Interactive toggle switch (light/dark theme switcher).
  - **Notifications**: Push / alert preference toggle or subpage link.
  - **Help & Support / Contact**: WhatsApp/Telegram customer care link.
  - **Logout**: Distinct red / warning button.
- Fixed Bottom Navigation Bar.

### 2. Component Hierarchy
```text
Body
└── Page Container
    ├── Header
    ├── Profile Header Card
    │   ├── Avatar Container
    │   ├── User Meta (Username, Registered Phone/Email)
    │   └── Edit Profile Action
    ├── Settings Menu List Group
    │   ├── Menu Item: App Rules (Icon + Label + Chevron)
    │   ├── Menu Item: Dark Mode (Icon + Label + Toggle Switch)
    │   ├── Menu Item: Notifications (Icon + Label + Toggle / Link)
    │   ├── Menu Item: Customer Support (Icon + Label + External Indicator)
    │   └── Menu Item: Sign Out / Logout
    └── Bottom Navigation Bar
```

### 3. Approximate Layout
- Centered or left-aligned avatar banner at top.
- Grouped list items with subtle dividers and chevron arrows pointing right.

### 4. Colors & Visual Treatment
- Avatar ring in primary blue (`#0860BE`).
- Setting icons enclosed in soft rounded squares with light pastel or gray background.
- Toggle switch: Neutral gray off state, brand blue on state.
- Logout row: Styled with muted danger accent (`#D62828`).

### 5. Typography Hierarchy
- Username: Semi-bold / Bold ~18px.
- Menu Item Titles: Medium ~14px-15px (`#15171A`).
- Secondary Descriptions: ~12px (`#737B87`).

### 6. Spacing & Rounded Corners
- Avatar: Circular (`border-radius: 50%`), ~64px-72px diameter.
- Menu group container: `12px` border radius, card style.
- Menu rows: `14px-16px` vertical padding.

### 7. Responsive Inferences
- Clean mobile settings view matching standard iOS/Android native settings design conventions.

### 8. Shared Components
- Top Header and Bottom Navigation.

### 9. Uncertainties & Assumptions
- *Uncertainty*: Dark mode color palette specifications.
- *Assumption*: Full Dark Mode CSS custom properties will be defined in the design system to ensure seamless toggle capability.

### 10. Future Implementation Requirements (Scheduled Day: Day 6)
- Dark mode persistent local storage hook.
- Profile update validation.
- Secure session invalidation on logout.

---

## 5. Summary Matrix of Visible vs Future Pages

| Page | Visual Status in Screenshots | Implementation Day |
| :--- | :--- | :--- |
| **Bets Page** | **Observed in reference screenshots** | Day 4 |
| **Passbook Page** | **Observed in reference screenshots** | Day 5 |
| **Profile Page** | **Observed in reference screenshots** | Day 6 |
| **Shared Header & Nav** | **Observed in reference screenshots** | Day 2 |
| **Home Dashboard** | Proposed / Future | Day 7 |
| **Login / Register** | Proposed / Future | Day 3 |
| **Deposit / Withdraw** | Proposed / Future | Day 15 |
| **Admin Area** | Proposed / Future | Days 16 & 17 |
