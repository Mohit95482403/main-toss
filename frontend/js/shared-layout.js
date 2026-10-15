/**
 * IRONMAN TOSS BOOK - Shared Layout Component Engine (Day 2)
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
        <a href="${homeUrl}" class="header-brand" aria-label="IRONMAN TOSS BOOK - Go to Home">
          <div class="brand-logo-fallback" id="brand-logo-fallback">
            <div class="brand-icon-badge">
              ${ICONS.brandShield}
            </div>
            <div class="brand-text-group">
              <span class="brand-title">IRONMAN</span>
              <span class="brand-subtitle">TOSS BOOK</span>
            </div>
          </div>
          <!-- Optional image logo with fallback handling -->
          <img src="${logoSrc}" alt="IRONMAN TOSS BOOK Logo" class="brand-logo-img" style="display: none;" id="brand-logo-img" />
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
      : ['WELCOME TO IRONMAN TOSS BOOK'];

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

    if (availEl && available !== undefined) {
      const formatted = formatVal(available);
      if (formatted !== null) {
        availEl.textContent = `${symbol}${formatted}`;
      }
    }
    if (expEl && exposure !== undefined) {
      const formatted = formatVal(exposure);
      if (formatted !== null) {
        expEl.textContent = `${symbol}${formatted}`;
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
      if (window.ApiClient && typeof window.ApiClient.getBalance === 'function' && window.ApiClient.isAuthenticated()) {
        const b = window.ApiClient.getBalance();
        updateBalances(b.formattedAvailable, b.formattedExposure);
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

    setupGlobalModalAccessibility();
  }

  // Export to global window object
  window.SharedLayout = {
    init,
    updateBalances,
    renderHeader,
    renderTicker,
    renderBottomNav,
    showToast,
    formatCurrency,
    formatDate,
    setButtonLoading,
    setupGlobalModalAccessibility,
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
