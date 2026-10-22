/**
 * DADDY TOSS BOOK - Shared Layout Component Engine (Day 2)
 * Renders and manages the Shared Header, Announcement Ticker, and Bottom Navigation.
 * Works natively in both HTTP development server and local file execution.
 */

(function () {
  'use strict';

  // SVG Icons for Navigation & Brand
  const ICONS = {
    brandShield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"></path></svg>`,
    megaphone: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`,
    home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    bets: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3z"></path><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>`,
    passbook: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><line x1="9" y1="7" x2="15" y2="7"></line><line x1="9" y1="11" x2="13" y2="11"></line></svg>`,
    profile: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
  };

  /**
   * Determine relative path prefix depending on current page location
   */
  function getRelativePathPrefix() {
    const path = window.location.pathname.replace(/\\/g, '/');
    const isInsidePages = path.includes('/pages/') || (document.body && document.body.dataset.inPages === 'true');
    return isInsidePages ? '../' : '';
  }

  /**
   * Render Shared Header Component
   */
  function renderHeader(container) {
    if (!container) return;

    const prefix = getRelativePathPrefix();
    const config = window.APP_CONFIG || {};
    const defaultBalances = config.initialBalances || { available: '0.00', exposure: '0.00', currencySymbol: '₹' };
    const homeUrl = prefix ? `${prefix}index.html` : 'index.html';
    const logoSrc = `${prefix}${config.logo?.src || 'assets/images/logo.png'}`;

    // Read authoritative balance from stored session if authenticated
    let initialAvail = defaultBalances.available;
    let initialExp = defaultBalances.exposure;
    if (window.ApiClient && typeof window.ApiClient.getBalance === 'function' && window.ApiClient.isAuthenticated()) {
      const b = window.ApiClient.getBalance();
      initialAvail = b.formattedAvailable;
      initialExp = b.formattedExposure;
    }

    container.innerHTML = `
      <header class="app-header" role="banner">
        <a href="${homeUrl}" class="header-brand" aria-label="DADDY TOSS BOOK - Go to Home">
          <div class="brand-logo-fallback" id="brand-logo-fallback">
            <div class="brand-icon-badge">
              ${ICONS.brandShield}
            </div>
            <div class="brand-text-group">
              <span class="brand-title">DADDY</span>
              <span class="brand-subtitle">TOSS BOOK</span>
            </div>
          </div>
          <!-- Optional image logo with fallback handling -->
          <img src="${logoSrc}" alt="DADDY TOSS BOOK Logo" class="brand-logo-img" style="display: none;" id="brand-logo-img" />
        </a>

        <div class="header-balances" role="region" aria-label="Account Balances">
          <!-- Available Balance (Blue) -->
          <div class="balance-item balance-available balance-card-pill" title="Available Account Balance">
            <span class="balance-label" id="label-avail-bal">Bal</span>
            <span class="balance-amount" id="header-available-balance" aria-labelledby="label-avail-bal">
              ${defaultBalances.currencySymbol}${initialAvail}
            </span>
          </div>

          <!-- Secondary / Exposure Indicator (Red) -->
          <div class="balance-item balance-exposure balance-card-pill" title="Active Match Exposure">
            <span class="balance-label" id="label-exp-bal">Exp</span>
            <span class="balance-amount" id="header-exposure-balance" aria-labelledby="label-exp-bal">
              ${defaultBalances.currencySymbol}${initialExp}
            </span>
          </div>
        </div>
      </header>
    `;

    // Handle logo image load gracefully
    const imgEl = container.querySelector('#brand-logo-img');
    const fallbackEl = container.querySelector('#brand-logo-fallback');
    if (imgEl && fallbackEl) {
      imgEl.onload = function () {
        imgEl.style.display = 'block';
        fallbackEl.style.display = 'none';
      };
      imgEl.onerror = function () {
        imgEl.style.display = 'none';
        fallbackEl.style.display = 'flex';
      };
    }
  }

  /**
   * Render Announcement Ticker Component
   */
  function renderTicker(container) {
    if (!container) return;

    const config = window.APP_CONFIG || {};
    const announcements = config.announcements && config.announcements.length > 0
      ? config.announcements
      : ['WELCOME TO DADDY TOSS BOOK'];

    // Generate items string with separator
    const itemsHtml = announcements
      .map(text => `<span class="ticker-item">${escapeHtml(text)}</span><span class="ticker-separator" aria-hidden="true">&#9670;</span>`)
      .join('');

    container.innerHTML = `
      <section class="announcement-ticker-container" role="region" aria-label="Latest Announcements" tabindex="0">
        <div class="ticker-badge" aria-hidden="true" title="Live Notice">
          ${ICONS.megaphone}
        </div>
        <div class="ticker-viewport">
          <div class="ticker-track" aria-hidden="true">
            <!-- Track Segment 1 -->
            ${itemsHtml}
            <!-- Track Segment 2 (Duplicate for continuous seamless loop) -->
            ${itemsHtml}
          </div>
        </div>
        <!-- Screen reader live announcement accessibility -->
        <span class="sr-only">${escapeHtml(announcements.join('. '))}</span>
      </section>
    `;
  }

  /**
   * Render Bottom Navigation Component
   */
  function renderBottomNav(container) {
    if (!container) return;

    const prefix = getRelativePathPrefix();
    const activePage = (document.body && document.body.dataset.page) || 'home';

    const navItems = [
      {
        id: 'home',
        label: 'Home',
        url: prefix ? `${prefix}index.html` : 'index.html',
        icon: ICONS.home
      },
      {
        id: 'bets',
        label: 'Bets',
        url: prefix ? 'bets.html' : 'pages/bets.html',
        icon: ICONS.bets
      },
      {
        id: 'passbook',
        label: 'Passbook',
        url: prefix ? 'passbook.html' : 'pages/passbook.html',
        icon: ICONS.passbook
      },
      {
        id: 'profile',
        label: 'Profile',
        url: prefix ? 'profile.html' : 'pages/profile.html',
        icon: ICONS.profile
      }
    ];

    const itemsHtml = navItems.map(item => {
      const isActive = item.id === activePage;
      return `
        <a href="${item.url}" 
           class="bottom-nav-item ${isActive ? 'active' : ''}" 
           id="nav-item-${item.id}"
           data-nav="${item.id}"
           ${isActive ? 'aria-current="page"' : ''}
           aria-label="${item.label} page">
          <div class="bottom-nav-icon" aria-hidden="true">
            ${item.icon}
          </div>
          <span class="bottom-nav-label">${item.label}</span>
        </a>
      `;
    }).join('');

    container.innerHTML = `
      <nav class="bottom-nav" aria-label="Main Navigation">
        ${itemsHtml}
      </nav>
    `;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Toast Icons SVG Mapping
   */
  const TOAST_ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    close: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
  };

  /**
   * Reusable Toast Notification System (Day 12)
   */
  function showToast(message, type = 'success', duration = 3500) {
    if (!message) return null;

    let container = document.getElementById('app-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'app-toast-container';
      container.className = 'app-toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const safeType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
    toast.className = `app-toast app-toast-${safeType}`;

    const iconSvg = TOAST_ICONS[safeType] || TOAST_ICONS.info;
    toast.innerHTML = `
      <div class="app-toast-content">
        <span class="app-toast-icon" aria-hidden="true">${iconSvg}</span>
        <span class="app-toast-msg">${escapeHtml(message)}</span>
      </div>
      <button type="button" class="app-toast-close" aria-label="Dismiss notification">
        ${TOAST_ICONS.close}
      </button>
    `;

    container.appendChild(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    function dismiss() {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 250);
    }

    const closeBtn = toast.querySelector('.app-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', dismiss);
    }

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }

    return toast;
  }

  /**
   * Standard Currency Formatter (INR Presentation)
   */
  function formatCurrency(amount, symbol = '₹') {
    const num = Number(amount);
    if (isNaN(num)) return `${symbol}0.00`;
    return `${symbol}${num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  /**
   * Standard Date & Time Formatter
   */
  function formatDate(dateInput, includeTime = true) {
    if (!dateInput) return '—';
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return String(dateInput);

      const day = d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      if (!includeTime) return day;

      const time = d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      return `${day}, ${time}`;
    } catch (e) {
      return String(dateInput);
    }
  }

  /**
   * Button Loading State Helper
   */
  function setButtonLoading(btn, isLoading, loadingText = '') {
    if (!btn) return;

    if (isLoading) {
      btn.dataset.origHtml = btn.innerHTML;
      btn.classList.add('btn-loading');
      btn.disabled = true;
      btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span> <span>${escapeHtml(loadingText || 'Please wait...')}</span>`;
    } else {
      if (btn.dataset.origHtml) {
        btn.innerHTML = btn.dataset.origHtml;
        delete btn.dataset.origHtml;
      }
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  }

  /**
   * Global Modal Accessibility Listeners (Escape key and backdrop dismissal)
   */
  function setupGlobalModalAccessibility() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal-overlay.open, .profile-modal-overlay.open, .modal-backdrop.open');
        openModals.forEach(m => {
          m.classList.remove('open');
          m.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        });
      }
    });
  }

  /**
   * Dynamic Balance Update Helper
   */
  function updateBalances(available, exposure) {
    const symbol = (window.APP_CONFIG && window.APP_CONFIG.initialBalances && window.APP_CONFIG.initialBalances.currencySymbol) || '₹';
    const availEl = document.getElementById('header-available-balance');
    const expEl = document.getElementById('header-exposure-balance');

    function formatVal(v) {
      if (v === undefined || v === null) return null;
      if (typeof v === 'number') {
        return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      const clean = String(v).replace(/[^\d.-]/g, '');
      const num = parseFloat(clean);
      return !isNaN(num)
        ? num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : String(v);
    }

    const homeAvailEl = document.getElementById('home-wallet-balance');
    const homeExpEl = document.getElementById('home-wallet-exposure');

    if (availEl && available !== undefined) {
      const formatted = formatVal(available);
      if (formatted !== null) {
        availEl.textContent = `${symbol}${formatted}`;
        if (homeAvailEl) {
          homeAvailEl.textContent = `${symbol}${formatted}`;
        }
      }
    }
    if (expEl && exposure !== undefined) {
      const formatted = formatVal(exposure);
      if (formatted !== null) {
        expEl.textContent = `${symbol}${formatted}`;
        if (homeExpEl) {
          homeExpEl.textContent = `${symbol}${formatted}`;
        }
      }
    }
  }

  /**
   * Initialize Shared Layout Components
   */
  function init() {
    const headerContainer = document.getElementById('shared-header');
    const tickerContainer = document.getElementById('shared-ticker');
    const bottomNavContainer = document.getElementById('shared-bottom-nav');

    if (headerContainer) {
      renderHeader(headerContainer);
      if (window.ApiClient && typeof window.ApiClient.isAuthenticated === 'function' && window.ApiClient.isAuthenticated()) {
        const b = window.ApiClient.getBalance();
        if (b.verified) {
          updateBalances(b.formattedAvailable, b.formattedExposure);
        }
        if (typeof window.ApiClient.refreshBalance === 'function') {
          window.ApiClient.refreshBalance().catch(() => {});
        }
      }
    }
    if (tickerContainer) renderTicker(tickerContainer);
    if (bottomNavContainer) renderBottomNav(bottomNavContainer);

    // Global listener for real-time balance sync across all pages
    window.addEventListener('itb:balance-updated', (e) => {
      if (e.detail) {
        updateBalances(e.detail.formattedAvailable, e.detail.formattedExposure);
      }
    });

    window.addEventListener('itb:balance-error', () => {
      const availEl = document.getElementById('header-available-balance');
      if (availEl && (!window.ApiClient || !window.ApiClient.getLastVerifiedBalance || !window.ApiClient.getLastVerifiedBalance())) {
        availEl.classList.add('balance-error');
        availEl.textContent = '₹—';
      }
    });

    setupGlobalModalAccessibility();

    // Check mandatory password change on page initialization
    checkMandatoryPasswordRequirement();
    window.addEventListener('itb:password-change-required', () => {
      showMandatoryChangePasswordModal();
    });
  }

  /**
   * Mandatory First-Login Password Change Modal System
   */
  let isMandatoryPasswordModalActive = false;

  function ensureMandatoryChangePasswordModal() {
    let overlay = document.getElementById('mandatory-change-password-modal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'mandatory-change-password-modal';
    overlay.className = 'mandatory-pwd-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mandatory-pwd-title');
    overlay.setAttribute('aria-describedby', 'mandatory-pwd-desc');
    overlay.setAttribute('aria-hidden', 'true');

    overlay.innerHTML = `
      <div class="mandatory-pwd-card" role="document">
        <header class="mandatory-pwd-header">
          <div class="mandatory-pwd-icon-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 id="mandatory-pwd-title" class="mandatory-pwd-title">Welcome! Change Your Password</h2>
          <p id="mandatory-pwd-desc" class="mandatory-pwd-desc">
            For your account's security, you must create a new password before continuing.
          </p>
        </header>

        <form id="mandatory-pwd-form" class="mandatory-pwd-body" novalidate autocomplete="off">
          <div id="mandatory-pwd-error" class="mandatory-pwd-error-banner" role="alert"></div>
          <div id="mandatory-pwd-success" class="mandatory-pwd-success-banner" role="status"></div>

          <div class="mandatory-pwd-group">
            <label class="mandatory-pwd-label" for="mandatory-curr-pass">
              <span>Current / Temporary Password</span>
            </label>
            <div class="mandatory-pwd-input-wrap">
              <input type="password" id="mandatory-curr-pass" name="currentPassword" class="mandatory-pwd-input" placeholder="Enter temporary password" required autocomplete="current-password" />
              <button type="button" class="mandatory-pwd-toggle-btn" data-target="mandatory-curr-pass" aria-label="Toggle password visibility">
                <svg viewBox="0 0 24 24" class="eye-open"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </div>

          <div class="mandatory-pwd-group">
            <label class="mandatory-pwd-label" for="mandatory-new-pass">
              <span>New Password</span>
            </label>
            <div class="mandatory-pwd-input-wrap">
              <input type="password" id="mandatory-new-pass" name="newPassword" class="mandatory-pwd-input" placeholder="Min. 8 characters" minlength="8" required autocomplete="new-password" />
              <button type="button" class="mandatory-pwd-toggle-btn" data-target="mandatory-new-pass" aria-label="Toggle password visibility">
                <svg viewBox="0 0 24 24" class="eye-open"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </div>

          <div class="mandatory-pwd-group">
            <label class="mandatory-pwd-label" for="mandatory-confirm-pass">
              <span>Confirm New Password</span>
            </label>
            <div class="mandatory-pwd-input-wrap">
              <input type="password" id="mandatory-confirm-pass" name="confirmPassword" class="mandatory-pwd-input" placeholder="Re-enter new password" minlength="8" required autocomplete="new-password" />
              <button type="button" class="mandatory-pwd-toggle-btn" data-target="mandatory-confirm-pass" aria-label="Toggle password visibility">
                <svg viewBox="0 0 24 24" class="eye-open"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </div>

          <div class="mandatory-pwd-policy">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>Must be at least 8 characters long and different from temporary password.</span>
          </div>

          <button type="submit" id="mandatory-pwd-submit" class="mandatory-pwd-submit-btn">
            <span class="btn-text">Change Password &amp; Continue &rarr;</span>
            <span class="mandatory-pwd-spinner" aria-hidden="true"></span>
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    // Eye toggle controls
    overlay.querySelectorAll('.mandatory-pwd-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const inputId = btn.getAttribute('data-target');
        const input = document.getElementById(inputId);
        if (!input) return;
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        btn.innerHTML = isPass
          ? `<svg viewBox="0 0 24 24" style="stroke: var(--pink-primary, #789B69);"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
          : `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
      });
    });

    // Form submit listener
    const form = overlay.querySelector('#mandatory-pwd-form');
    form.addEventListener('submit', handleMandatoryPasswordSubmit);

    // STRICT GUARD: Block backdrop dismissal
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    return overlay;
  }

  function showMandatoryChangePasswordModal() {
    isMandatoryPasswordModalActive = true;
    const overlay = ensureMandatoryChangePasswordModal();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.display = 'flex';

    // Trap focus inside modal
    const firstInput = overlay.querySelector('#mandatory-curr-pass');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }

    // STRICT ESCAPE KEY INTERCEPTION
    document.addEventListener('keydown', handleMandatoryKeydown, true);
  }

  function handleMandatoryKeydown(e) {
    if (!isMandatoryPasswordModalActive) return;
    if (e.key === 'Escape' || e.keyCode === 27) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Trap focus
    if (e.key === 'Tab') {
      const overlay = document.getElementById('mandatory-change-password-modal');
      if (!overlay) return;
      const focusables = overlay.querySelectorAll('input:not([disabled]), button:not([disabled])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  async function handleMandatoryPasswordSubmit(e) {
    e.preventDefault();
    const overlay = document.getElementById('mandatory-change-password-modal');
    if (!overlay) return;

    const currInput = overlay.querySelector('#mandatory-curr-pass');
    const newInput = overlay.querySelector('#mandatory-new-pass');
    const confirmInput = overlay.querySelector('#mandatory-confirm-pass');
    const errorBanner = overlay.querySelector('#mandatory-pwd-error');
    const successBanner = overlay.querySelector('#mandatory-pwd-success');
    const submitBtn = overlay.querySelector('#mandatory-pwd-submit');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.mandatory-pwd-spinner');

    errorBanner.style.display = 'none';
    errorBanner.textContent = '';
    successBanner.style.display = 'none';
    successBanner.textContent = '';

    const currentPassword = (currInput.value || '').trim();
    const newPassword = (newInput.value || '').trim();
    const confirmPassword = (confirmInput.value || '').trim();

    // Client validations
    if (!currentPassword) {
      errorBanner.textContent = 'Please enter your current or temporary password.';
      errorBanner.style.display = 'block';
      currInput.focus();
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      errorBanner.textContent = 'New password must be at least 8 characters long.';
      errorBanner.style.display = 'block';
      newInput.focus();
      return;
    }
    if (currentPassword === newPassword) {
      errorBanner.textContent = 'New password must be different from your current password.';
      errorBanner.style.display = 'block';
      newInput.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      errorBanner.textContent = 'New password and confirm password do not match.';
      errorBanner.style.display = 'block';
      confirmInput.focus();
      return;
    }

    // Set loading state
    submitBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Securing account...';

    try {
      const res = await window.ApiClient.post('/auth/change-password', {
        currentPassword,
        newPassword,
        confirmPassword
      });

      // Success
      submitBtn.disabled = true;
      if (spinner) spinner.style.display = 'none';
      if (btnText) btnText.textContent = '✓ Password Changed!';
      successBanner.textContent = 'Password changed successfully! Unlocking platform...';
      successBanner.style.display = 'block';

      // Update local authenticated user state
      if (window.ApiClient) {
        const currentUser = window.ApiClient.getUser() || {};
        const updated = {
          ...currentUser,
          ...(res.user || {}),
          mustChangePassword: false,
          must_change_password: false
        };
        window.ApiClient.setUser(updated);
        if (res.token) {
          window.ApiClient.setToken(res.token);
        }
      }

      setTimeout(() => {
        isMandatoryPasswordModalActive = false;
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.display = 'none';
        document.removeEventListener('keydown', handleMandatoryKeydown, true);

        showToast('Password updated successfully. Full access unlocked!', 'success');

        // Refresh balance and notify page
        if (window.ApiClient && typeof window.ApiClient.refreshBalance === 'function') {
          window.ApiClient.refreshBalance(true).catch(() => {});
        }
        window.dispatchEvent(new CustomEvent('itb:password-changed'));
      }, 700);
    } catch (err) {
      submitBtn.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (btnText) btnText.textContent = 'Change Password & Continue →';

      const errorMsg = (err.error && err.error.message) || err.message || 'Failed to update password. Please check your credentials.';
      errorBanner.textContent = errorMsg;
      errorBanner.style.display = 'block';
    }
  }

  function checkMandatoryPasswordRequirement() {
    if (!window.ApiClient || !window.ApiClient.isAuthenticated()) return;

    // Fast check: check locally cached state
    const cachedUser = window.ApiClient.getUser();
    if (cachedUser && (cachedUser.mustChangePassword || cachedUser.must_change_password)) {
      showMandatoryChangePasswordModal();
    }

    // Authoritative check: verify with backend /auth/me
    window.ApiClient.get('/auth/me', { noDedupe: true })
      .then(res => {
        const u = res?.user || res?.data?.user;
        if (u && (u.mustChangePassword || u.must_change_password)) {
          showMandatoryChangePasswordModal();
        } else if (isMandatoryPasswordModalActive) {
          // If already changed in another tab
          const overlay = document.getElementById('mandatory-change-password-modal');
          if (overlay) {
            overlay.classList.remove('open');
            overlay.style.display = 'none';
          }
          isMandatoryPasswordModalActive = false;
        }
      })
      .catch(() => {});
  }

  // Export to global window object
  window.SharedLayout = {
    init,
    updateBalances,
    refreshBalance: () => (window.ApiClient && typeof window.ApiClient.refreshBalance === 'function' ? window.ApiClient.refreshBalance() : Promise.resolve()),
    renderHeader,
    renderTicker,
    renderBottomNav,
    showToast,
    formatCurrency,
    formatDate,
    setButtonLoading,
    setupGlobalModalAccessibility,
    showMandatoryChangePasswordModal,
    checkMandatoryPasswordRequirement,
    escapeHtml
  };

  // Expose global convenience aliases
  window.showAppToast = showToast;
  window.ITB_FORMATTERS = {
    currency: formatCurrency,
    date: formatDate
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
