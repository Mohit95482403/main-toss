# IRONMAN TOSS BOOK - Design System Specification

## 1. Design Principles

- **Mobile-First App Feel**: Designed primarily for handheld sports bettors seeking instant, friction-free wager tracking.
- **Visual Contrast & Legibility**: High contrast against clean white surfaces ensures readability under all lighting conditions.
- **Clarity of Financial State**: Distinct color coding for credits (+ green), debits (- red), stakes, and exposure.
- **Performance & Purity**: Built using standard CSS custom properties without third-party CSS utility frameworks or bloated preprocessors.

---

## 2. Color Palette & Token Definitions

### Light Mode (Default)
```css
:root {
  /* Brand & Primary Actions */
  --color-primary: #0860BE;
  --color-primary-hover: #064F9D;
  --color-primary-light: #E8F2FC;
  --color-primary-focus: rgba(8, 96, 190, 0.25);

  /* Neutrals & Surfaces */
  --color-background: #F6F8FA;
  --color-surface: #FFFFFF;
  --color-surface-elevated: #FFFFFF;
  --color-surface-subtle: #F1F4F8;

  /* Typography Colors */
  --color-text: #15171A;
  --color-text-secondary: #4B5563;
  --color-text-muted: #737B87;
  --color-text-inverse: #FFFFFF;

  /* Borders & Dividers */
  --color-border: #E5E7EB;
  --color-border-subtle: #EEF0F2;
  --color-border-focus: #0860BE;

  /* Semantic Feedback */
  --color-success: #16A34A;
  --color-success-bg: #DCFCE7;
  --color-success-text: #14532D;

  --color-danger: #D62828;
  --color-danger-bg: #FEE2E2;
  --color-danger-text: #7F1D1D;

  --color-warning: #F59E0B;
  --color-warning-bg: #FEF3C7;
  --color-warning-text: #78350F;

  --color-info: #0284C7;
  --color-info-bg: #E0F2FE;
  --color-info-text: #075985;

  /* Overlays & Shadows */
  --color-overlay: rgba(15, 23, 42, 0.6);
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
  --shadow-nav: 0 -2px 10px rgba(0, 0, 0, 0.05);
}
```

### Dark Mode (Ready Token Map)
```css
[data-theme="dark"] {
  --color-primary: #3B82F6;
  --color-primary-hover: #2563EB;
  --color-primary-light: #1E293B;
  --color-primary-focus: rgba(59, 130, 246, 0.35);

  --color-background: #0F172A;
  --color-surface: #1E293B;
  --color-surface-elevated: #334155;
  --color-surface-subtle: #1E293B;

  --color-text: #F8FAFC;
  --color-text-secondary: #94A3B8;
  --color-text-muted: #64748B;
  --color-text-inverse: #0F172A;

  --color-border: #334155;
  --color-border-subtle: #1E293B;

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
  --shadow-nav: 0 -2px 10px rgba(0, 0, 0, 0.3);
}
```

---

## 3. Spacing Scale

Based on an 8-point harmonic grid:

| Token | Pixel Equivalent | Typical Application |
| :--- | :--- | :--- |
| `--space-2xs` | 2px | Micro-borders, tiny tag offsets |
| `--space-xs` | 4px | Inline icon gaps, badge vertical padding |
| `--space-sm` | 8px | Button inline gaps, list item margins |
| `--space-md` | 12px | Compact card padding, input internal padding |
| `--space-lg` | 16px | Standard card padding, container gutter |
| `--space-xl` | 24px | Section gaps, hero card padding |
| `--space-2xl` | 32px | Major section breaks |
| `--space-3xl` | 48px | Page bottom clearance for fixed navigation |

---

## 4. Typography Scale

Clean system font stack with optimized legibility on mobile retina screens:
```css
--font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

| Token | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `--font-size-2xs` | 11px | 500 / 600 | 1.3 | Badges, timestamps, ID labels |
| `--font-size-xs` | 12px | 400 / 500 | 1.4 | Secondary notes, ticker notices |
| `--font-size-sm` | 13px | 400 / 500 | 1.5 | Metadata, odds rates, descriptions |
| `--font-size-base` | 14px | 400 / 500 | 1.5 | Primary body, form inputs, button text |
| `--font-size-md` | 16px | 600 | 1.4 | Subheaders, match titles, header brand |
| `--font-size-lg` | 18px | 600 / 700 | 1.3 | Card headers, section titles |
| `--font-size-xl` | 24px | 700 | 1.2 | Wallet hero balance headline |

---

## 5. Border Radius & Shape Tokens

| Token | Value | Target Elements |
| :--- | :--- | :--- |
| `--radius-sm` | 4px | Small tags, indicator dots |
| `--radius-md` | 8px | Form inputs, buttons, segmented filter items |
| `--radius-lg` | 12px | Bet cards, transaction items, settings panels |
| `--radius-xl` | 16px | Hero balance card, modal dialogs |
| `--radius-full` | 9999px | Status pills, avatars, rounded chips |

---

## 6. Layout & Sizing Tokens

```css
--container-max-width: 480px;      /* Canonical mobile container width */
--container-desktop-max: 960px;    /* Optional expanded tablet/desktop view */
--header-height: 56px;             /* Fixed top header height */
--ticker-height: 32px;             /* Marquee ticker strip height */
--bottom-nav-height: 60px;         /* Fixed bottom navigation bar height */
```

### Breakpoints
- **Small Mobile**: `@media (max-width: 360px)` - Compact fonts and tight spacing.
- **Standard Mobile (Default)**: `361px - 767px` - Primary target viewport.
- **Tablet**: `@media (min-width: 768px)` - Centered app card frame with shadow.
- **Desktop**: `@media (min-width: 1024px)` - Refined desktop container.

---

## 7. Accessibility & Ergonomics

1. **Focus States**: High-visibility outline (`outline: 2px solid var(--color-primary-focus); outline-offset: 2px`) for keyboard and assistive navigation.
2. **Color Contrast**: All primary text against surfaces exceeds WCAG AA standards (4.5:1 ratio).
3. **Motion Sensitivity**: `@media (prefers-reduced-motion: reduce)` resets all transitions and animations to instantaneous.
4. **Touch Target Size**: All interactive elements (tabs, buttons, inputs) meet or exceed the recommended 44x44px touch area.
