/**
 * DADDY TOSS BOOK - Home Dashboard & Match Feed Controller
 * Integrates directly with MySQL Match Fixtures API (/api/matches).
 * Eliminates all static demo datasets, hardcoded balances, and sample fixtures.
 */

(function () {
  'use strict';

  // SVGs for Icons
  const ICONS = {
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
    empty: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
  };

  let currentCategory = 'all';
  let matchesState = [];
  let categoryCounts = { all: 0, live: 0, upcoming: 0, completed: 0 };
  let isLoading = false;
  let checkActiveMatchEligibility = null;

  /**
   * Escape HTML utility
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Render Status Badge
   */
  function renderStatusBadge(status) {
    switch (status) {
      case 'live':
        return `<span class="match-status-badge status-live"><span class="live-pulse-dot" aria-hidden="true"></span> Live Toss</span>`;
      case 'upcoming':
        return `<span class="match-status-badge status-upcoming">Upcoming</span>`;
      case 'completed':
        return `<span class="match-status-badge status-completed">Completed</span>`;
      default:
        return `<span class="match-status-badge">${escapeHtml(status)}</span>`;
    }
  }

  /**
   * Format expiry date & time cleanly (e.g. 'Today, 09:30 PM', 'Tomorrow, 08:00 PM', '17 Oct, 09:30 PM')
   */
  function formatExpiryDisplay(dateInput, fallbackScheduled) {
    if (!dateInput) return fallbackScheduled || 'TBA';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return fallbackScheduled || 'TBA';

    const now = new Date();
    const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();

    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    if (isToday) return `Today, ${timeStr}`;
    if (isTomorrow) return `Tomorrow, ${timeStr}`;

    const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    return `${dateStr}, ${timeStr}`;
  }

  /**
   * Parse scheduled time strings (e.g. 'Today, 07:30 PM', 'Tomorrow, 02:30 PM', ISO dates)
   */
  function parseScheduledDateTime(str) {
    if (!str) return null;
    const now = new Date();
    const timeRegex = /(today|tomorrow),?\s*(\d{1,2}):(\d{2})\s*(am|pm)/i;
    const m = str.match(timeRegex);
    if (m) {
      const isTomorrow = m[1].toLowerCase() === 'tomorrow';
      let h = parseInt(m[2], 10);
      const min = parseInt(m[3], 10);
      const isPm = m[4].toLowerCase() === 'pm';
      if (isPm && h < 12) h += 12;
      if (!isPm && h === 12) h = 0;
      const d = new Date(now);
      if (isTomorrow) d.setDate(d.getDate() + 1);
      d.setHours(h, min, 0, 0);
      return d;
    }
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Calculate and format dynamic countdown pill
   */
  function getCountdownDisplay(scheduledStr, status, endStr) {
    if (status === 'live') {
      return `<span class="match-live-pill"><span class="live-pulse-dot" aria-hidden="true"></span> LIVE TOSS</span>`;
    }
    if (status === 'completed') {
      return `<span class="match-status-pill status-completed">COMPLETED</span>`;
    }
    if (status === 'abandoned') {
      return `<span class="match-status-pill status-closed">CLOSED</span>`;
    }

    const targetDate = (endStr ? new Date(endStr) : null) || parseScheduledDateTime(scheduledStr);
    if (!targetDate || isNaN(targetDate.getTime())) {
      return `<span class="match-countdown-pill"><span class="countdown-clock-icon" aria-hidden="true">⏱️</span> <span>${escapeHtml(scheduledStr || 'SCHEDULED')}</span></span>`;
    }
    const diff = targetDate.getTime() - Date.now();
    if (diff <= 0) {
      return `<span class="match-live-pill"><span class="live-pulse-dot" aria-hidden="true"></span> TOSS IN PROGRESS</span>`;
    }
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const timeText = hours > 0
      ? `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    return `<span class="match-countdown-pill"><span class="countdown-clock-icon" aria-hidden="true">⏱️</span> <span class="countdown-text">Starts in ${timeText}</span></span>`;
  }

  /**
   * Render Match Card based on provided screenshot specification:
   * Clean white card, countdown header, rose sport badge, competition header,
   * two blush team panels, centered circular VS divider, two info boxes (ENDTIME & TOSS RATE),
   * and prominent rose BET ON TOSS button.
   */
  function formatLogoUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    if (url.startsWith('/uploads')) {
      if (typeof window !== 'undefined' && window.location.port !== '5000' && window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) {
        try {
          const origin = new URL(window.APP_CONFIG.apiBaseUrl).origin;
          return `${origin}${url}`;
        } catch (e) {}
      }
    }
    return url;
  }

  function renderTeamLogo(logoUrl, teamName, teamAbbr, position = 'left') {
    const safeName = escapeHtml(teamName || 'Team');
    const safeAbbr = escapeHtml(teamAbbr || (teamName ? teamName.substring(0, 3).toUpperCase() : 'TM'));
    const safeUrl = formatLogoUrl(logoUrl);

    if (safeUrl) {
      return `
        <div class="match-team-logo-box ${position}" title="${safeName}">
          <img src="${escapeHtml(safeUrl)}" alt="${safeName}" class="match-team-logo-img"
               onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
          <div class="match-team-logo-fallback" style="display: none;">${safeAbbr}</div>
        </div>
      `;
    }

    return `
      <div class="match-team-logo-box ${position}" title="${safeName}">
        <div class="match-team-logo-fallback">${safeAbbr}</div>
      </div>
    `;
  }

  function renderMatchCard(match) {
    const isClosed = match.status === 'completed' || match.status === 'abandoned';
    const rateVal = parseFloat(match.teamOneRate || 1.90).toFixed(2);
    const rawEndTime = match.matchEndTime || match.match_end_time;
    const displayEndTime = formatExpiryDisplay(rawEndTime, match.scheduledTime);

    return `
      <article class="match-card modern-match-card" data-match-id="${escapeHtml(match.id)}" data-end-time="${escapeHtml(rawEndTime || '')}" aria-label="Match: ${escapeHtml(match.matchTitle || (match.teamOne + ' vs ' + match.teamTwo))}, ${escapeHtml(match.competition)}">
        <!-- Top: Countdown / Live Status & Sport Badge -->
        <header class="match-card-top-bar">
          <div class="match-time-indicator" data-match-id="${escapeHtml(match.id)}" data-scheduled="${escapeHtml(match.scheduledTime || '')}" data-end-time="${escapeHtml(rawEndTime || '')}" data-status="${escapeHtml(match.status)}">
            ${getCountdownDisplay(match.scheduledTime, match.status, rawEndTime)}
          </div>
          <span class="match-sport-badge">CRICKET</span>
        </header>

        <!-- Tournament / Competition Heading -->
        <div class="match-competition-bar">
          <span class="match-competition-title">${escapeHtml(match.competition || 'CRICKET TOURNAMENT')}</span>
          ${match.stage ? `<span class="match-stage-title">&bull; ${escapeHtml(match.stage)}</span>` : ''}
        </div>

        <!-- First Team Panel: [Team 1 Logo] Team 1 Name -->
        <div class="match-team-panel">
          ${renderTeamLogo(match.teamOneLogo || match.team_one_logo, match.teamOne, match.teamOneAbbr, 'left')}
          <span class="match-team-panel-name">${escapeHtml(match.teamOne)}</span>
        </div>

        <!-- Centered VS Divider with extending line -->
        <div class="match-vs-divider-row" aria-hidden="true">
          <div class="match-vs-line"></div>
          <div class="match-vs-circle">VS</div>
          <div class="match-vs-line"></div>
        </div>

        <!-- Second Team Panel: Team 2 Name [Team 2 Logo] -->
        <div class="match-team-panel">
          <span class="match-team-panel-name">${escapeHtml(match.teamTwo)}</span>
          ${renderTeamLogo(match.teamTwoLogo || match.team_two_logo, match.teamTwo, match.teamTwoAbbr, 'right')}
        </div>

        <!-- Two Equal-Width Info Boxes: ENDTIME & TOSS RATE -->
        <div class="match-info-boxes-grid">
          <div class="match-info-box">
            <span class="info-box-label">ENDTIME</span>
            <span class="info-box-value" title="${escapeHtml(displayEndTime)}">${escapeHtml(displayEndTime)}</span>
          </div>
          <div class="match-info-box">
            <span class="info-box-label">TOSS RATE</span>
            <span class="info-box-value">${rateVal}</span>
          </div>
        </div>

        <!-- Prominent Button: BET ON TOSS -->
        <div class="match-action-row">
          ${isClosed ? `
            <button type="button" class="btn-bet-on-toss btn-disabled" disabled aria-disabled="true">
              ${match.status === 'completed' ? 'MATCH COMPLETED' : 'TOSS CLOSED'}
            </button>
          ` : `
            <button type="button" class="btn-bet-on-toss" data-action="bet" data-match-id="${escapeHtml(match.id)}" aria-label="Bet on toss: ${escapeHtml(match.teamOne)} vs ${escapeHtml(match.teamTwo)}">
              BET ON TOSS
            </button>
          `}
        </div>
      </article>
    `;
  }

  /**
   * Render Empty State
   */
  function renderEmptyState(category) {
    return `
      <section class="match-empty-state empty-state" aria-live="polite">
        <div class="empty-state-icon" aria-hidden="true">
          ${ICONS.empty}
        </div>
        <h3 class="empty-state-title">No matches available right now.</h3>
        <p class="empty-state-desc">
          There are currently no active toss matches listed in this category from the database.
        </p>
        ${category !== 'all' ? `
          <button type="button" class="btn btn-outline btn-sm" id="reset-category-btn">
            View All Matches
          </button>
        ` : ''}
      </section>
    `;
  }

  /**
   * Render Error State
   */
  function renderErrorState(message) {
    return `
      <section class="match-empty-state empty-state" aria-live="assertive">
        <div class="empty-state-icon text-danger" aria-hidden="true">⚠️</div>
        <h3 class="empty-state-title">Unable to Load Matches</h3>
        <p class="empty-state-desc">${escapeHtml(message || 'An error occurred while connecting to the database.')}</p>
        <button type="button" class="btn btn-outline btn-sm" id="retry-matches-btn">
          Retry
        </button>
      </section>
    `;
  }

  /**
   * Update Featured Match Card Dynamically (Featured card removed from Home page)
   */
  function updateFeaturedMatch(matches) {
    const featuredCard = document.getElementById('featured-match');
    if (featuredCard) {
      featuredCard.style.display = 'none';
    }
  }

  /**
   * Setup Collapsible Diagnostics
   */
  function setupDiagnostics() {
    const toggleBtn = document.getElementById('diagnostics-toggle-btn');
    const content = document.getElementById('diagnostics-content');

    if (toggleBtn && content) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = content.classList.contains('open');
        content.classList.toggle('open', !isOpen);
        toggleBtn.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
        toggleBtn.querySelector('.diagnostics-arrow').textContent = !isOpen ? '▲ Hide Diagnostics' : '▼ Show Diagnostics & Roadmap';
      });
    }
  }

  /**
   * Main Initialization
   */
  async function initHomePage() {
    const feedContainer = document.getElementById('match-feed-container');
    const filterButtons = document.querySelectorAll('.match-filter-btn');

    if (!feedContainer) return;

    // Track active client-side expiry timeouts to remove cards the second they expire
    const expiryTimersMap = new Map();

    /**
     * Remove an expired match from the user Home page in real-time
     */
    function removeMatchFromHome(matchId) {
      if (!matchId) return;
      const sId = String(matchId);

      // Clear timer for this match
      if (expiryTimersMap.has(sId)) {
        clearTimeout(expiryTimersMap.get(sId));
        expiryTimersMap.delete(sId);
      }

      // Drop from local state
      const beforeLen = matchesState.length;
      matchesState = matchesState.filter(m => String(m.id) !== sId);

      // Animate card removal smoothly
      const card = feedContainer.querySelector(`.match-card[data-match-id="${sId}"]`);
      if (card) {
        card.style.transition = 'opacity 0.25s ease, transform 0.25s ease, margin 0.25s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.97)';
        setTimeout(() => {
          card.remove();
          if (matchesState.length === 0) {
            feedContainer.innerHTML = renderEmptyState(currentCategory);
            const resetBtn = document.getElementById('reset-category-btn');
            if (resetBtn) resetBtn.addEventListener('click', () => setCategory('all'));
          }
        }, 260);
      } else if (matchesState.length === 0) {
        feedContainer.innerHTML = renderEmptyState(currentCategory);
      }

      // Re-calculate category counts
      if (beforeLen !== matchesState.length) {
        categoryCounts[currentCategory] = matchesState.length;
        if (categoryCounts.all > 0) categoryCounts.all--;
        updateCounts();
      }

      // Reconcile featured match
      updateFeaturedMatch(matchesState);

      // If betting modal is open for this match, close it and alert user
      if (typeof checkActiveMatchEligibility === 'function') {
        checkActiveMatchEligibility(matchesState);
      }
    }

    /**
     * Schedule exact-second browser timers for each visible match's expiry
     */
    function scheduleMatchExpiryTimers(matches) {
      // Clear previously registered timeouts
      expiryTimersMap.forEach(timerId => clearTimeout(timerId));
      expiryTimersMap.clear();

      const now = Date.now();
      (matches || []).forEach(m => {
        const rawEnd = m.matchEndTime || m.match_end_time;
        if (!rawEnd) return;
        const expiryMs = new Date(rawEnd).getTime();
        if (isNaN(expiryMs)) return;

        const msRemaining = expiryMs - now;
        if (msRemaining <= 0) {
          // Already passed expiry threshold - remove immediately
          removeMatchFromHome(m.id);
        } else {
          // Schedule removal exactly when expiry is reached
          const timerId = setTimeout(() => {
            removeMatchFromHome(m.id);
          }, msRemaining);
          expiryTimersMap.set(String(m.id), timerId);
        }
      });
    }

    /**
     * Check all current matches against actual clock (for background tabs and wakeups)
     */
    function checkAndPurgeExpiredMatches() {
      const now = Date.now();
      const expiredIds = [];
      matchesState.forEach(m => {
        const rawEnd = m.matchEndTime || m.match_end_time;
        if (!rawEnd) {
          expiredIds.push(m.id);
          return;
        }
        const expMs = new Date(rawEnd).getTime();
        if (isNaN(expMs) || expMs <= now) {
          expiredIds.push(m.id);
        }
      });

      if (expiredIds.length > 0) {
        expiredIds.forEach(id => removeMatchFromHome(id));
      }
    }

    // Load authentic matches from MySQL API
    async function loadMatchesData(silent = false) {
      if (isLoading) return;
      isLoading = true;

      if (!silent && (!matchesState || matchesState.length === 0)) {
        feedContainer.innerHTML = `
          <div class="text-center text-muted" style="padding: 40px 20px;">
            <span class="btn-spinner" style="margin-right: 8px;"></span> Loading authentic match fixtures from database...
          </div>
        `;
      }

      try {
        const result = await window.TossBookMatches.getAll(currentCategory);
        const nowMs = Date.now();

        // Exclude completed, settled, or expired matches
        const eligibleMatches = (result.matches || []).filter(m => {
          if (m.status === 'completed' || m.status === 'abandoned' || m.settled) return false;
          const rawEnd = m.matchEndTime || m.match_end_time;
          if (rawEnd) {
            const expiryMs = new Date(rawEnd).getTime();
            if (!isNaN(expiryMs) && expiryMs <= nowMs) return false;
          }
          return true;
        });

        matchesState = eligibleMatches;
        categoryCounts = result.counts || { all: 0, live: 0, upcoming: 0, completed: 0 };
        categoryCounts.all = eligibleMatches.length;
        categoryCounts.completed = 0;

        updateCounts();
        updateFeaturedMatch(eligibleMatches);
        renderFeed();
        scheduleMatchExpiryTimers(eligibleMatches);

        if (typeof checkActiveMatchEligibility === 'function') {
          checkActiveMatchEligibility(eligibleMatches);
        }
      } catch (err) {
        console.error('[HOME MATCHES ERROR]', err);
        if (!silent || matchesState.length === 0) {
          feedContainer.innerHTML = renderErrorState(err.message);
          const retryBtn = document.getElementById('retry-matches-btn');
          if (retryBtn) retryBtn.addEventListener('click', () => loadMatchesData(false));
        }
      } finally {
        isLoading = false;
      }
    }

    // Update Category Counts dynamically
    function updateCounts() {
      filterButtons.forEach(btn => {
        const key = btn.dataset.category;
        const countSpan = btn.querySelector('.match-filter-count');
        if (countSpan && categoryCounts[key] !== undefined) {
          countSpan.textContent = categoryCounts[key];
        }
      });
    }

    // Render Match List
    function renderFeed() {
      if (matchesState.length === 0) {
        feedContainer.innerHTML = renderEmptyState(currentCategory);
        const resetBtn = document.getElementById('reset-category-btn');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => setCategory('all'));
        }
        return;
      }

      // Reconcile DOM cards: remove any completed / expired / ineligible match cards
      const activeIds = new Set(matchesState.map(m => String(m.id)));
      const existingCards = feedContainer.querySelectorAll('.match-card[data-match-id]');
      existingCards.forEach(card => {
        const id = card.getAttribute('data-match-id');
        if (!activeIds.has(String(id))) {
          card.remove();
        }
      });

      feedContainer.innerHTML = matchesState.map(renderMatchCard).join('');
    }

    // Set and apply category
    function setCategory(category) {
      currentCategory = category;

      filterButtons.forEach(btn => {
        const isMatch = btn.dataset.category === category;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      });

      loadMatchesData(false);
    }

    // Bind filter clicks
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        setCategory(category);
      });
    });

    // Real-time countdown timer ticker every 1 second
    setInterval(() => {
      const now = Date.now();
      document.querySelectorAll('.match-time-indicator').forEach(el => {
        const scheduled = el.dataset.scheduled;
        const status = el.dataset.status;
        const endTime = el.dataset.endTime;

        if (endTime) {
          const expMs = new Date(endTime).getTime();
          if (!isNaN(expMs) && expMs <= now) {
            const mId = el.dataset.matchId;
            removeMatchFromHome(mId);
            return;
          }
        }

        if (status === 'upcoming') {
          el.innerHTML = getCountdownDisplay(scheduled, status, endTime);
        }
      });
    }, 1000);

    // Periodic match background refresh (every 5s) and window focus revalidation
    setInterval(() => {
      if (!document.hidden) {
        checkAndPurgeExpiredMatches();
        loadMatchesData(true);
      }
    }, 5000);

    window.addEventListener('focus', () => {
      checkAndPurgeExpiredMatches();
      loadMatchesData(true);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkAndPurgeExpiredMatches();
        loadMatchesData(true);
      }
    });

    // Real-time synchronization via BroadcastChannel & LocalStorage
    if (typeof window.BroadcastChannel === 'function') {
      try {
        const matchesChannel = new BroadcastChannel('itb_matches');
        matchesChannel.onmessage = (event) => {
          if (event && event.data && (event.data.type === 'MATCH_SETTLED' || event.data.type === 'MATCHES_UPDATED' || event.data.type === 'MATCH_CREATED' || event.data.type === 'MATCH_DELETED')) {
            loadMatchesData(true);
          }
        };
      } catch (e) {}
    }

    window.addEventListener('storage', (event) => {
      if (event.key === 'itb_matches_updated_at') {
        loadMatchesData(true);
      }
    });

    // Setup Diagnostics
    setupDiagnostics();

    // Setup Home Wallet Actions (Deposit & Withdrawal)
    setupWalletActions();

    // Setup Bet On Toss Modal Popup
    setupBetModal();

    // Setup Active Toss Bets Feed & Cancellation System
    setupActiveBetsSystem();

    // Initial load
    loadMatchesData(false);
  }

  /**
   * Setup Home Quick Wallet Actions (Deposit & Withdrawal Modals & Authoritative Balance Sync)
   */
  function setupWalletActions() {
    const depositBtn = document.getElementById('home-deposit-btn');
    const withdrawBtn = document.getElementById('home-withdraw-btn');
    const homeBalEl = document.getElementById('home-wallet-balance');
    const homeExpEl = document.getElementById('home-wallet-exposure');
    const modalDepBal = document.getElementById('modal-deposit-current-bal');
    const modalWithBal = document.getElementById('modal-withdraw-current-bal');

    function getAuthoritativeBalances() {
      const symbol = '₹';
      let availStr = '0.00';
      let expStr = '0.00';

      if (window.ApiClient && typeof window.ApiClient.getBalance === 'function' && window.ApiClient.isAuthenticated()) {
        const b = window.ApiClient.getBalance();
        availStr = b.formattedAvailable;
        expStr = b.formattedExposure;
      } else {
        const headerAvail = document.getElementById('header-available-balance');
        const headerExp = document.getElementById('header-exposure-balance');
        if (headerAvail && headerAvail.textContent) {
          availStr = headerAvail.textContent.replace(symbol, '').trim();
        }
        if (headerExp && headerExp.textContent) {
          expStr = headerExp.textContent.replace(symbol, '').trim();
        }
      }

      return {
        formattedAvailable: `${symbol}${availStr}`,
        formattedExposure: `${symbol}${expStr}`,
        rawAvailable: availStr,
        rawExposure: expStr
      };
    }

    function syncDisplayBalances(balances) {
      const b = balances || getAuthoritativeBalances();
      if (homeBalEl) homeBalEl.textContent = b.formattedAvailable;
      if (homeExpEl) homeExpEl.textContent = b.formattedExposure;
      if (modalDepBal) modalDepBal.textContent = b.formattedAvailable;
      if (modalWithBal) modalWithBal.textContent = b.formattedAvailable;
    }

    const TELEGRAM_PROFILE_URL = 'https://t.me/narendra_1306';

    if (depositBtn) {
      depositBtn.addEventListener('click', (e) => {
        if (!depositBtn.href || depositBtn.tagName.toLowerCase() !== 'a') {
          e.preventDefault();
          window.open(TELEGRAM_PROFILE_URL, '_blank', 'noopener,noreferrer');
        }
      });
    }

    if (withdrawBtn) {
      withdrawBtn.addEventListener('click', (e) => {
        if (!withdrawBtn.href || withdrawBtn.tagName.toLowerCase() !== 'a') {
          e.preventDefault();
          window.open(TELEGRAM_PROFILE_URL, '_blank', 'noopener,noreferrer');
        }
      });
    }

    // Initial sync and listener for balance updates
    syncDisplayBalances();
    window.addEventListener('itb:balance-updated', (e) => {
      syncDisplayBalances(e.detail);
    });

    window.addEventListener('itb:balance-error', () => {
      if (homeBalEl && (!window.ApiClient || !window.ApiClient.getLastVerifiedBalance || !window.ApiClient.getLastVerifiedBalance())) {
        homeBalEl.textContent = '₹—';
      }
    });

    // Refresh authoritative balance from MySQL server
    if (window.ApiClient && typeof window.ApiClient.refreshBalance === 'function' && window.ApiClient.isAuthenticated()) {
      window.ApiClient.refreshBalance().then(syncDisplayBalances).catch(() => {});
    }
  }

  /**
   * Helper: Format team logo URL
   */
  function formatLogoUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    if (url.startsWith('/uploads')) {
      if (typeof window !== 'undefined' && window.location.port !== '5000' && window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) {
        try {
          const origin = new URL(window.APP_CONFIG.apiBaseUrl).origin;
          return `${origin}${url}`;
        } catch (e) {}
      }
    }
    return url;
  }

  /**
   * Setup Active Toss Bets Feed & Cancellation System
   * Renders the user's active wagers directly on the Home page conforming strictly to the reference screenshot.
   */
  let loadActiveBets = null;

  function setupActiveBetsSystem() {
    const sectionEl = document.getElementById('home-active-bets-section');
    const containerEl = document.getElementById('home-active-bets-container');
    const countBadge = document.getElementById('active-bets-count-badge');

    // Cancel modal elements
    const cancelModal = document.getElementById('cancel-bet-modal');
    const cancelCloseX = document.getElementById('cancel-modal-close-x');
    const cancelKeepBtn = document.getElementById('cancel-modal-keep-btn');
    const cancelConfirmBtn = document.getElementById('cancel-modal-confirm-btn');
    const cancelSelectionEl = document.getElementById('cancel-modal-selection');
    const cancelStakeEl = document.getElementById('cancel-modal-stake');
    const cancelErrorEl = document.getElementById('cancel-modal-error');
    const cancelSpinner = document.getElementById('cancel-modal-spinner');

    if (!sectionEl || !containerEl) return;

    let pendingCancelBet = null;
    let isCancelling = false;
    let activeBetsState = [];

    function formatCurrency(val) {
      const num = Number(val) || 0;
      return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatEndTimeDisplay(dateInput, scheduledTime) {
      if (!dateInput && scheduledTime) return scheduledTime;
      if (!dateInput) return 'TBA';
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return scheduledTime || 'TBA';

      const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      const now = new Date();
      const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (isToday) return timeStr;

      const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      return `${dateStr}, ${timeStr}`;
    }

    function renderTeamLogoOrCrest(name, logoUrl) {
      const formatted = logoUrl ? formatLogoUrl(logoUrl) : null;
      if (formatted) {
        return `<img src="${escapeHtml(formatted)}" alt="${escapeHtml(name)}" onerror="this.onerror=null; this.parentElement.innerHTML='${escapeHtml((name || 'T').substring(0, 3).toUpperCase())}';">`;
      }
      const abbr = (name || 'TM').substring(0, 3).toUpperCase();
      return `<span>${escapeHtml(abbr)}</span>`;
    }

    function closeCancelModal() {
      if (isCancelling) return;
      if (cancelModal) {
        cancelModal.style.display = 'none';
        cancelModal.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('no-scroll');
      if (cancelErrorEl) {
        cancelErrorEl.style.display = 'none';
        cancelErrorEl.textContent = '';
      }
      pendingCancelBet = null;
    }

    function openCancelModal(bet) {
      if (!bet || !cancelModal) return;
      pendingCancelBet = bet;

      if (cancelSelectionEl) cancelSelectionEl.textContent = bet.selectedTeam || bet.selection || 'Your Selection';
      if (cancelStakeEl) cancelStakeEl.textContent = `₹${formatCurrency(bet.stake)}`;
      if (cancelErrorEl) {
        cancelErrorEl.style.display = 'none';
        cancelErrorEl.textContent = '';
      }

      if (cancelConfirmBtn) {
        cancelConfirmBtn.disabled = false;
        const btnText = cancelConfirmBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'CONFIRM CANCELLATION';
        if (cancelSpinner) cancelSpinner.style.display = 'none';
      }
      if (cancelKeepBtn) cancelKeepBtn.disabled = false;

      cancelModal.style.display = 'flex';
      cancelModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
    }

    async function executeBetCancellation() {
      if (!pendingCancelBet || isCancelling) return;
      isCancelling = true;

      if (cancelErrorEl) {
        cancelErrorEl.style.display = 'none';
        cancelErrorEl.textContent = '';
      }

      if (cancelConfirmBtn) {
        cancelConfirmBtn.disabled = true;
        const btnText = cancelConfirmBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Cancelling...';
        if (cancelSpinner) cancelSpinner.style.display = 'inline-block';
      }
      if (cancelKeepBtn) cancelKeepBtn.disabled = true;

      const betId = pendingCancelBet.id;
      const stakeAmount = pendingCancelBet.stake;

      try {
        const idempotencyKey = 'CANCEL-HOME-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        const res = await window.ApiClient.post(`/bets/${encodeURIComponent(betId)}/cancel`, { idempotencyKey });

        isCancelling = false;
        closeCancelModal();

        const refundMsg = (res && res.message) 
          ? res.message 
          : `Bet cancelled successfully. ₹${formatCurrency(stakeAmount)} refunded to your balance.`;

        if (window.SharedLayout && typeof window.SharedLayout.showToast === 'function') {
          window.SharedLayout.showToast(refundMsg, 'success');
        } else if (window.showAppToast) {
          window.showAppToast(refundMsg, 'success');
        } else {
          alert(refundMsg);
        }

        // Authoritatively sync wallet balance everywhere
        if (window.ApiClient && typeof window.ApiClient.refreshBalance === 'function') {
          await window.ApiClient.refreshBalance().catch(() => {});
        }

        // Re-render active bets immediately
        await loadActiveBets();

      } catch (err) {
        isCancelling = false;
        if (cancelConfirmBtn) {
          cancelConfirmBtn.disabled = false;
          const btnText = cancelConfirmBtn.querySelector('.btn-text');
          if (btnText) btnText.textContent = 'CONFIRM CANCELLATION';
          if (cancelSpinner) cancelSpinner.style.display = 'none';
        }
        if (cancelKeepBtn) cancelKeepBtn.disabled = false;

        const errObj = (err && (err.error || err)) || {};
        const errMsg = errObj.message || err.message || 'Unable to cancel this bet. The match may have already started or ended.';
        
        if (cancelErrorEl) {
          cancelErrorEl.textContent = errMsg;
          cancelErrorEl.style.display = 'block';
        }
      }
    }

    // Modal event bindings
    if (cancelCloseX) cancelCloseX.addEventListener('click', closeCancelModal);
    if (cancelKeepBtn) cancelKeepBtn.addEventListener('click', closeCancelModal);
    if (cancelConfirmBtn) cancelConfirmBtn.addEventListener('click', executeBetCancellation);
    if (cancelModal) {
      cancelModal.addEventListener('click', (e) => {
        if (e.target === cancelModal) closeCancelModal();
      });
    }

    // Render an individual active bet card conforming to reference screenshot
    function renderActiveBetCard(bet) {
      const isTeamOneChoice = (bet.selectedTeam === bet.teamOne);
      const isTeamTwoChoice = (bet.selectedTeam === bet.teamTwo);

      const rawRate = Number(bet.rate || bet.odds || 1.90);
      const displayRate = rawRate.toFixed(2);

      const endTimeText = formatEndTimeDisplay(bet.matchEndTime, bet.scheduledTime);

      return `
        <article class="active-bet-card" data-bet-id="${escapeHtml(bet.id)}" data-match-id="${escapeHtml(bet.matchId)}" aria-label="Active Bet: ${escapeHtml(bet.selectedTeam)} in ${escapeHtml(bet.matchTitle)}">
          <!-- Section A: Match Information Header -->
          <header class="active-bet-header">
            <div class="active-bet-header-meta">
              <div class="active-bet-competition-badge-row">
                <span class="active-bet-sport-pill">
                  🏏 ${escapeHtml(bet.sport || 'CRICKET')}
                </span>
                <span class="match-status-badge status-${bet.matchStatus === 'live' ? 'live' : 'upcoming'}">
                  ${bet.matchStatus === 'live' ? '<span class="live-pulse-dot" aria-hidden="true"></span> Live Toss' : 'Upcoming'}
                </span>
              </div>
              <h3 class="active-bet-match-title" title="${escapeHtml(bet.competition || bet.matchTitle)}">
                ${escapeHtml(bet.competition || bet.matchTitle)}
              </h3>
            </div>
            <div class="active-bet-header-badges">
              ${bet.scheduledTime ? `
                <span class="active-bet-countdown-pill" title="Scheduled Match Time">
                  ${ICONS.clock}
                  <span>${escapeHtml(bet.scheduledTime)}</span>
                </span>
              ` : ''}
            </div>
          </header>

          <!-- Section B: Competing Teams Panels -->
          <div class="active-bet-teams-row">
            <div class="active-bet-team-panel ${isTeamOneChoice ? 'is-user-choice' : ''}">
              <div class="active-bet-team-crest">
                ${renderTeamLogoOrCrest(bet.teamOne, bet.teamOneLogo)}
              </div>
              <div class="active-bet-team-info">
                <span class="active-bet-team-name">${escapeHtml(bet.teamOne)}</span>
                <span class="active-bet-team-rate">Rate ${bet.teamOneRate ? bet.teamOneRate.toFixed(2) : '1.90'}</span>
              </div>
            </div>

            <div class="active-bet-vs-badge" aria-hidden="true">VS</div>

            <div class="active-bet-team-panel ${isTeamTwoChoice ? 'is-user-choice' : ''}">
              <div class="active-bet-team-crest">
                ${renderTeamLogoOrCrest(bet.teamTwo, bet.teamTwoLogo)}
              </div>
              <div class="active-bet-team-info">
                <span class="active-bet-team-name">${escapeHtml(bet.teamTwo)}</span>
                <span class="active-bet-team-rate">Rate ${bet.teamTwoRate ? bet.teamTwoRate.toFixed(2) : '1.90'}</span>
              </div>
            </div>
          </div>

          <!-- Section C: User's Actual Selection & Stake Banner -->
          <div class="active-bet-selection-banner">
            <strong>
              YOUR BET: <span style="text-decoration: underline;">${escapeHtml(bet.selectedTeam)}</span> (<span class="stake-val">₹${formatCurrency(bet.stake)}</span>)
            </strong>
          </div>

          <!-- Section D: Timing and Toss Rate Panels -->
          <div class="active-bet-info-grid">
            <div class="active-bet-info-box">
              <span class="active-bet-info-label">ENDTIME</span>
              <span class="active-bet-info-val">${escapeHtml(endTimeText)}</span>
            </div>
            <div class="active-bet-info-box">
              <span class="active-bet-info-label">TOSS RATE</span>
              <span class="active-bet-info-val">${escapeHtml(displayRate)}</span>
            </div>
          </div>

          <!-- Section E: Action Buttons -->
          <div class="active-bet-actions-row">
            <button type="button" class="btn-active-bet-more" data-action="bet-more" data-match-id="${escapeHtml(bet.matchId)}" aria-label="Bet more on ${escapeHtml(bet.matchTitle)}">
              BET MORE
            </button>
            <button type="button" class="btn-active-bet-cancel" data-action="cancel-bet" data-bet-id="${escapeHtml(bet.id)}" ${bet.canCancel ? '' : 'disabled title="Bet cancellation cutoff has passed or match has started"'} aria-label="Cancel bet on ${escapeHtml(bet.selectedTeam)}">
              ${bet.canCancel ? 'CANCEL BET' : 'CANCEL CLOSED'}
            </button>
          </div>
        </article>
      `;
    }

    loadActiveBets = async function () {
      if (!window.ApiClient || !window.ApiClient.isAuthenticated()) {
        sectionEl.style.display = 'none';
        containerEl.innerHTML = '';
        activeBetsState = [];
        return;
      }

      try {
        const res = await window.ApiClient.get('/bets/my-active-bets');
        const activeBets = (res && res.data && Array.isArray(res.data.activeBets)) 
          ? res.data.activeBets 
          : [];
        
        activeBetsState = activeBets;

        if (countBadge) {
          countBadge.textContent = String(activeBets.length);
        }

        if (activeBets.length === 0) {
          sectionEl.style.display = 'none';
          containerEl.innerHTML = '';
          return;
        }

        // Render Active Bet Cards
        sectionEl.style.display = 'block';
        containerEl.innerHTML = activeBets.map(renderActiveBetCard).join('');

      } catch (err) {
        console.warn('[ACTIVE BETS] Failed to load active bets:', err.message);
        sectionEl.style.display = 'none';
        containerEl.innerHTML = '';
      }
    };

    // Container click delegation for BET MORE and CANCEL BET
    containerEl.addEventListener('click', (e) => {
      const moreBtn = e.target.closest('[data-action="bet-more"]');
      if (moreBtn) {
        e.preventDefault();
        const matchId = moreBtn.getAttribute('data-match-id');
        if (matchId && typeof window.openBetModal === 'function') {
          window.openBetModal(matchId);
        }
        return;
      }

      const cancelBtn = e.target.closest('[data-action="cancel-bet"]');
      if (cancelBtn) {
        e.preventDefault();
        if (cancelBtn.disabled) return;
        const betId = cancelBtn.getAttribute('data-bet-id');
        const bet = activeBetsState.find(b => String(b.id) === String(betId));
        if (bet) {
          openCancelModal(bet);
        }
        return;
      }
    });

    // Event listeners for seamless real-time sync
    window.addEventListener('itb:auth-changed', loadActiveBets);
    window.addEventListener('itb:balance-updated', () => {
      loadActiveBets();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && window.ApiClient && window.ApiClient.isAuthenticated()) {
        loadActiveBets();
      }
    });

    // Expose globally
    window.loadActiveBets = loadActiveBets;

    // Initial load
    loadActiveBets();
  }

  /**
   * Setup Bet On Toss Modal Popup
   * Strictly matches the provided reference screenshot with full transactional betting integration.
   */
  function setupBetModal() {
    const modal = document.getElementById('bet-modal-popup');
    const card = document.getElementById('bet-modal-card');
    const closeBtn = document.getElementById('bet-modal-close-btn');
    const titleEl = document.getElementById('bet-popup-title');
    const subtitleEl = document.getElementById('bet-popup-match-subtitle');
    const errorBox = document.getElementById('bet-popup-error-box');
    const errorMsg = document.getElementById('bet-popup-error-msg');
    const successBox = document.getElementById('bet-popup-success-box');
    const successMsg = document.getElementById('bet-popup-success-msg');
    const teamOneBtn = document.getElementById('bet-team-one-btn');
    const teamOneName = document.getElementById('bet-team-one-name');
    const teamOneRate = document.getElementById('bet-team-one-rate');
    const teamTwoBtn = document.getElementById('bet-team-two-btn');
    const teamTwoName = document.getElementById('bet-team-two-name');
    const teamTwoRate = document.getElementById('bet-team-two-rate');
    const balanceDisplay = document.getElementById('bet-popup-balance-display');
    const stakeInput = document.getElementById('bet-stake-input');
    const maxBtn = document.getElementById('bet-max-btn');
    const presetBtns = document.querySelectorAll('.bet-preset-btn');
    const summaryChoice = document.getElementById('bet-summary-choice');
    const summaryReturn = document.getElementById('bet-summary-return');
    const summaryProfit = document.getElementById('bet-summary-profit');
    const confirmBtn = document.getElementById('bet-confirm-btn');
    const confirmText = document.getElementById('bet-confirm-text');
    const confirmSpinner = document.getElementById('bet-confirm-spinner');

    if (!modal || !confirmBtn) return;

    let activeMatch = null;
    let selectedTeamKey = 'teamOne'; // 'teamOne' or 'teamTwo'
    let isSubmitting = false;

    function formatCurrency(val) {
      const num = Number(val) || 0;
      return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function clearAlerts() {
      if (errorBox) errorBox.style.display = 'none';
      if (errorMsg) errorMsg.textContent = '';
      if (successBox) successBox.style.display = 'none';
      if (successMsg) successMsg.textContent = '';
    }

    function showError(msg) {
      if (!errorBox || !errorMsg) return;
      errorMsg.innerHTML = msg;
      errorBox.style.display = 'flex';
      if (successBox) successBox.style.display = 'none';
    }

    function showSuccess(msg) {
      if (!successBox || !successMsg) return;
      successMsg.innerHTML = msg;
      successBox.style.display = 'flex';
      if (errorBox) errorBox.style.display = 'none';
    }

    function getAuthoritativeAvailableBalance() {
      if (window.ApiClient && typeof window.ApiClient.getBalance === 'function') {
        const b = window.ApiClient.getBalance();
        return typeof b.available === 'number' ? b.available : 0;
      }
      return 0;
    }

    function updateBalanceDisplay() {
      if (!balanceDisplay) return;
      const avail = getAuthoritativeAvailableBalance();
      balanceDisplay.textContent = `₹${formatCurrency(avail)}`;
    }

    function recalculateSummary() {
      if (!activeMatch) return;
      const teamName = activeMatch[selectedTeamKey] || (selectedTeamKey === 'teamOne' ? activeMatch.teamOne : activeMatch.teamTwo);
      const rawRate = selectedTeamKey === 'teamOne' ? activeMatch.teamOneRate : activeMatch.teamTwoRate;
      const rate = parseFloat(rawRate || 1.90);

      if (summaryChoice) {
        summaryChoice.textContent = teamName || '—';
      }

      const stake = parseFloat(stakeInput.value) || 0;
      if (stake > 0) {
        const potReturn = stake * rate;
        const potProfit = Math.max(0, potReturn - stake);
        if (summaryReturn) summaryReturn.textContent = `₹${formatCurrency(potReturn)}`;
        if (summaryProfit) summaryProfit.textContent = `₹${formatCurrency(potProfit)}`;
      } else {
        if (summaryReturn) summaryReturn.textContent = '₹0.00';
        if (summaryProfit) summaryProfit.textContent = '₹0.00';
      }
    }

    function setSelectedTeam(teamKey) {
      selectedTeamKey = teamKey;
      if (teamKey === 'teamOne') {
        if (teamOneBtn) {
          teamOneBtn.classList.add('selected');
          teamOneBtn.setAttribute('aria-checked', 'true');
        }
        if (teamTwoBtn) {
          teamTwoBtn.classList.remove('selected');
          teamTwoBtn.setAttribute('aria-checked', 'false');
        }
      } else {
        if (teamTwoBtn) {
          teamTwoBtn.classList.add('selected');
          teamTwoBtn.setAttribute('aria-checked', 'true');
        }
        if (teamOneBtn) {
          teamOneBtn.classList.remove('selected');
          teamOneBtn.setAttribute('aria-checked', 'false');
        }
      }
      clearAlerts();
      recalculateSummary();
    }

    async function openBetModal(matchId) {
      if (!matchId) return;

      // 1. Locate match from cache or API
      let match = matchesState.find(m => String(m.id) === String(matchId));
      if (!match && window.TossBookMatches && typeof window.TossBookMatches.getCached === 'function') {
        const cached = window.TossBookMatches.getCached();
        match = cached.find(m => String(m.id) === String(matchId));
      }

      if (!match) {
        try {
          const res = await window.ApiClient.get(`/matches/${encodeURIComponent(matchId)}`);
          match = res.match || res.data || res;
        } catch (err) {
          console.error('[BET POPUP] Failed to load match fixture:', err);
        }
      }

      if (!match) {
        alert('Unable to load match information for betting.');
        return;
      }

      if (match.settled || match.status === 'completed' || match.status === 'abandoned') {
        alert('Betting is closed for this match as it has already concluded.');
        loadMatchesData(true);
        return;
      }

      activeMatch = match;
      clearAlerts();
      isSubmitting = false;

      // 2. Populate UI fields
      if (titleEl) titleEl.textContent = 'PLACE YOUR BET';
      if (subtitleEl) {
        subtitleEl.textContent = `${match.teamOne} vs ${match.teamTwo}${match.competition ? ` • ${match.competition}` : ''}`;
      }

      const rateOne = parseFloat(match.teamOneRate || 1.90).toFixed(2);
      const rateTwo = parseFloat(match.teamTwoRate || 1.90).toFixed(2);

      if (teamOneName) teamOneName.textContent = match.teamOne;
      if (teamOneRate) teamOneRate.textContent = `Rate ${rateOne}`;
      if (teamOneBtn) teamOneBtn.setAttribute('data-team', match.teamOne);

      if (teamTwoName) teamTwoName.textContent = match.teamTwo;
      if (teamTwoRate) teamTwoRate.textContent = `Rate ${rateTwo}`;
      if (teamTwoBtn) teamTwoBtn.setAttribute('data-team', match.teamTwo);

      // Default to teamOne
      setSelectedTeam('teamOne');

      // Reset stake input
      if (stakeInput) {
        stakeInput.value = '';
      }

      // Authoritative Balance display
      updateBalanceDisplay();
      if (window.ApiClient && typeof window.ApiClient.refreshBalance === 'function' && window.ApiClient.isAuthenticated()) {
        window.ApiClient.refreshBalance().then(() => updateBalanceDisplay()).catch(() => {});
      }

      // Reset confirm button state
      if (confirmBtn) confirmBtn.disabled = false;
      if (confirmText) confirmText.style.display = 'inline-block';
      if (confirmSpinner) confirmSpinner.style.display = 'none';

      recalculateSummary();

      // Show modal & prevent background scrolling
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');

      // Focus input on open for quick interaction
      setTimeout(() => {
        if (stakeInput) stakeInput.focus();
      }, 100);
    }

    function closeBetModal() {
      if (isSubmitting) return; // Prevent closing while in flight
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
      clearAlerts();
      activeMatch = null;
    }

    // Modal Event Bindings
    if (closeBtn) {
      closeBtn.addEventListener('click', closeBetModal);
    }

    modal.addEventListener('click', (e) => {
      // If clicking the backdrop overlay (outside card), close
      if (e.target === modal) {
        closeBetModal();
      }
    });

    if (card) {
      card.addEventListener('click', (e) => {
        // Prevent accidental closing when clicking within card
        e.stopPropagation();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        closeBetModal();
      }
    });

    // Team selection buttons
    if (teamOneBtn) {
      teamOneBtn.addEventListener('click', () => setSelectedTeam('teamOne'));
    }
    if (teamTwoBtn) {
      teamTwoBtn.addEventListener('click', () => setSelectedTeam('teamTwo'));
    }

    // Stake input live calculation & validation clearing
    if (stakeInput) {
      stakeInput.addEventListener('input', () => {
        clearAlerts();
        recalculateSummary();
      });
    }

    // Quick Presets (Min ₹50, Max ₹100,000)
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = parseFloat(btn.dataset.preset) || 0;
        const current = parseFloat(stakeInput.value) || 0;
        let nextVal = current === 0 ? preset : current + preset;
        if (nextVal > 100000) nextVal = 100000;
        stakeInput.value = nextVal.toFixed(0);
        clearAlerts();
        recalculateSummary();
      });
    });

    // MAX Button (Capped at ₹100,000)
    if (maxBtn) {
      maxBtn.addEventListener('click', () => {
        const avail = getAuthoritativeAvailableBalance();
        const maxAllowed = Math.min(avail, 100000);
        if (maxAllowed < 50) {
          showError('Your available balance is below the minimum stake of ₹50.');
          stakeInput.value = '';
        } else {
          stakeInput.value = Math.floor(maxAllowed).toString();
          clearAlerts();
        }
        recalculateSummary();
      });
    }

    // Confirm Bet Submission
    confirmBtn.addEventListener('click', async () => {
      if (isSubmitting) return;
      clearAlerts();

      // 1. Authentication Check
      if (!window.ApiClient || !window.ApiClient.isAuthenticated()) {
        showError('Please <a href="pages/login.html" style="text-decoration: underline; font-weight: 700; color: #B91C1C;">sign in</a> to place your bet.');
        return;
      }

      // 2. Active Match Check
      if (!activeMatch) {
        showError('No active match fixture selected. Please refresh.');
        return;
      }

      if (activeMatch.settled || activeMatch.status === 'completed' || activeMatch.status === 'abandoned') {
        showError('Betting is closed for this match.');
        return;
      }

      // 3. Selection Check
      const teamName = activeMatch[selectedTeamKey] || (selectedTeamKey === 'teamOne' ? activeMatch.teamOne : activeMatch.teamTwo);
      if (!teamName) {
        showError('Please select a valid team to win the toss.');
        return;
      }

      // 4. Strict Stake Checks (Min ₹50, Max ₹100,000)
      const rawVal = stakeInput ? stakeInput.value.trim() : '';
      if (!rawVal) {
        showError('Please enter a valid stake amount.');
        if (stakeInput) stakeInput.focus();
        return;
      }

      // Disallow non-numeric strings
      if (!/^-?\d+(\.\d+)?$/.test(rawVal)) {
        showError('Please enter a valid stake amount.');
        if (stakeInput) stakeInput.focus();
        return;
      }

      const stake = Number(rawVal);
      if (isNaN(stake) || !Number.isFinite(stake) || stake <= 0) {
        showError('Please enter a valid stake amount.');
        if (stakeInput) stakeInput.focus();
        return;
      }

      // Check decimal precision (at most 2 decimals)
      const decParts = rawVal.split('.');
      if (decParts.length === 2 && decParts[1].length > 2) {
        showError('Stake amount cannot have more than 2 decimal places.');
        if (stakeInput) stakeInput.focus();
        return;
      }

      if (stake < 50) {
        showError('Minimum stake amount is ₹50.');
        if (stakeInput) stakeInput.focus();
        return;
      }

      if (stake > 100000) {
        showError('Maximum stake amount is ₹100,000.');
        if (stakeInput) stakeInput.focus();
        return;
      }

      // 5. Available Balance Check
      const avail = getAuthoritativeAvailableBalance();
      if (stake > avail) {
        showError(`Insufficient balance. Your available balance is ₹${formatCurrency(avail)}.`);
        return;
      }

      // 6. Submit via Transactional Backend API
      isSubmitting = true;
      confirmBtn.disabled = true;
      if (confirmText) confirmText.style.display = 'none';
      if (confirmSpinner) confirmSpinner.style.display = 'inline-block';

      try {
        const idempotencyKey = 'BET-UI-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        const payload = {
          matchId: activeMatch.id,
          selection: teamName,
          stake: stake,
          idempotencyKey: idempotencyKey
        };

        const res = await window.ApiClient.post('/bets/place', payload);

        // 7. Success handling
        const betData = res.data && res.data.bet;
        const walletData = res.data && res.data.wallet;

        showSuccess(`✅ Bet of ₹${formatCurrency(stake)} placed successfully on ${escapeHtml(teamName)}!`);

        // Authoritative balance sync across all pages and headers
        if (walletData && typeof walletData.availableBalance === 'number') {
          window.ApiClient.updateAllBalanceDisplays(walletData.availableBalance, walletData.exposureBalance, 'loaded');
          updateBalanceDisplay();

          // Also update cached user wallet object
          const user = window.ApiClient.getUser();
          if (user && user.wallet) {
            user.wallet.available_balance = walletData.availableBalance;
            user.wallet.exposure_balance = walletData.exposureBalance;
            window.ApiClient.setUser(user);
          }

          try {
            window.dispatchEvent(new CustomEvent('itb:balance-updated', {
              detail: {
                available: walletData.availableBalance,
                exposure: walletData.exposureBalance,
                formattedAvailable: `₹${formatCurrency(walletData.availableBalance)}`,
                formattedExposure: `₹${formatCurrency(walletData.exposureBalance)}`
              }
            }));
          } catch (evtErr) {}
        }

        // Immediately update active bets list on Home page
        if (typeof loadActiveBets === 'function') {
          loadActiveBets();
        }

        // Reset input
        stakeInput.value = '';
        recalculateSummary();

        // Gracefully close after showing confirmation
        setTimeout(() => {
          isSubmitting = false;
          closeBetModal();
        }, 1800);

      } catch (err) {
        console.error('[BET PLACEMENT ERROR]', err);
        const errObj = err.error || err;
        const errCode = errObj.code || err.code || '';
        const errMsg = err.message || errObj.message || 'Unable to place bet. Please try again.';

        if (errCode === 'BETTING_CLOSED' || errMsg.toLowerCase().includes('closed') || errMsg.toLowerCase().includes('settled')) {
          showError('⚠️ Betting is closed. This match has concluded and settled.');
          if (confirmBtn) confirmBtn.disabled = true;
          loadMatchesData(true);
          setTimeout(() => {
            closeBetModal();
          }, 3000);
        } else {
          showError(escapeHtml(errMsg));
          confirmBtn.disabled = false;
        }
        isSubmitting = false;
        if (confirmText) confirmText.style.display = 'inline-block';
        if (confirmSpinner) confirmSpinner.style.display = 'none';
      }
    });

    // Check active match eligibility while popup is open
    checkActiveMatchEligibility = function (activeMatchesList) {
      if (!activeMatch || modal.style.display !== 'flex') return;
      const matchId = String(activeMatch.id);
      const isStillEligible = (activeMatchesList || []).some(m => String(m.id) === matchId);
      if (!isStillEligible) {
        showError('⚠️ Betting is closed. This match has been concluded/settled by the administrator.');
        if (confirmBtn) confirmBtn.disabled = true;
        if (stakeInput) stakeInput.disabled = true;
      }
    };

    // Click & Keyboard handlers on Featured Match Card to directly open bet slip
    const featuredCardEl = document.getElementById('featured-match');
    if (featuredCardEl) {
      featuredCardEl.addEventListener('click', (e) => {
        e.preventDefault();
        const matchId = featuredCardEl.getAttribute('data-match-id');
        if (matchId) {
          openBetModal(matchId);
        }
      });
      featuredCardEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const matchId = featuredCardEl.getAttribute('data-match-id');
          if (matchId) {
            openBetModal(matchId);
          }
        }
      });
    }

    // Delegate "BET ON TOSS" and card click on match feed cards
    const feedContainer = document.getElementById('match-feed-container');
    if (feedContainer) {
      feedContainer.addEventListener('click', (e) => {
        const betBtn = e.target.closest('.btn-bet-on-toss[data-action="bet"]');
        if (betBtn) {
          e.preventDefault();
          const matchId = betBtn.getAttribute('data-match-id');
          if (matchId) {
            openBetModal(matchId);
          }
          return;
        }

        const matchCard = e.target.closest('.match-card[data-match-id]');
        if (matchCard && !e.target.closest('.btn-disabled')) {
          const matchId = matchCard.getAttribute('data-match-id');
          if (matchId) {
            openBetModal(matchId);
          }
        }
      });
    }

    // Expose openBetModal globally if needed
    window.openBetModal = openBetModal;
  }

  // Lifecycle
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomePage);
  } else {
    initHomePage();
  }
})();
