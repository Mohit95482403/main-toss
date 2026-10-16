/**
 * IRONMAN TOSS BOOK - Home Dashboard & Match Feed Controller
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
   * Render Match Card
   */
  function renderMatchCard(match) {
    const detailsUrl = `pages/match-details.html?id=${encodeURIComponent(match.id)}`;

    return `
      <a href="${detailsUrl}" class="match-card" data-match-id="${escapeHtml(match.id)}" aria-label="${escapeHtml(match.matchTitle)}, ${escapeHtml(match.competition)}, Status: ${escapeHtml(match.status)}">
        <!-- Card Header: Tournament & Status -->
        <header class="match-card-header">
          <span class="match-tournament" title="${escapeHtml(match.competition)}">
            ${escapeHtml(match.competition)}
          </span>
          ${renderStatusBadge(match.status)}
        </header>

        <!-- Card Body: Teams, Crests & Rate Preview -->
        <div class="match-card-body">
          <div class="match-team team-left">
            <div class="team-crest" aria-hidden="true">${escapeHtml(match.teamOneAbbr || match.teamOne.substring(0, 3).toUpperCase())}</div>
            <div class="team-meta">
              <span class="team-name" title="${escapeHtml(match.teamOne)}">${escapeHtml(match.teamOne)}</span>
              <span class="team-rate-preview">Rate ${parseFloat(match.teamOneRate || 1.90).toFixed(2)}</span>
            </div>
          </div>

          <div class="match-vs-divider" aria-hidden="true">
            <span class="vs-circle">VS</span>
          </div>

          <div class="match-team team-right">
            <div class="team-crest" aria-hidden="true">${escapeHtml(match.teamTwoAbbr || match.teamTwo.substring(0, 3).toUpperCase())}</div>
            <div class="team-meta">
              <span class="team-name" title="${escapeHtml(match.teamTwo)}">${escapeHtml(match.teamTwo)}</span>
              <span class="team-rate-preview">Rate ${parseFloat(match.teamTwoRate || 1.90).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Card Footer: Schedule & View Action -->
        <footer class="match-card-footer">
          <div class="match-schedule-info">
            ${ICONS.clock}
            <span>${escapeHtml(match.scheduledTime || 'Schedule TBA')}</span>
          </div>
          <span class="match-view-action">
            <span>Details</span>
            ${ICONS.chevronRight}
          </span>
        </footer>
      </a>
    `;
  }

  /**
   * Render Empty State
   */
  function renderEmptyState(category) {
    let categoryName = category === 'all' ? 'Matches' : `${category.toUpperCase()} Matches`;
    return `
      <section class="match-empty-state empty-state" aria-live="polite">
        <div class="empty-state-icon" aria-hidden="true">
          ${ICONS.empty}
        </div>
        <h3 class="empty-state-title">No ${escapeHtml(categoryName)} Available</h3>
        <p class="empty-state-desc">
          There are currently no active matches listed in this category from the database.
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
   * Update Featured Match Card Dynamically
   */
  function updateFeaturedMatch(matches) {
    const featuredCard = document.getElementById('featured-match');
    if (!featuredCard) return;

    // Pick top live match, or top upcoming match
    const featured = matches.find(m => m.status === 'live') || matches.find(m => m.status === 'upcoming') || matches[0];

    if (!featured) {
      featuredCard.style.display = 'none';
      return;
    }

    featuredCard.style.display = 'flex';
    featuredCard.href = `pages/match-details.html?id=${encodeURIComponent(featured.id)}`;
    featuredCard.setAttribute('data-match-id', featured.id);
    featuredCard.setAttribute('aria-label', `Featured Match: ${featured.matchTitle}, Status: ${featured.status}`);

    const tourneyEl = featuredCard.querySelector('.featured-tournament');
    const livePill = featuredCard.querySelector('.featured-live-pill');
    const teamOneCrest = featuredCard.querySelectorAll('.featured-crest')[0];
    const teamOneName = featuredCard.querySelectorAll('.featured-team-name')[0];
    const teamOneRate = featuredCard.querySelectorAll('.featured-team-rate')[0];
    const teamTwoCrest = featuredCard.querySelectorAll('.featured-crest')[1];
    const teamTwoName = featuredCard.querySelectorAll('.featured-team-name')[1];
    const teamTwoRate = featuredCard.querySelectorAll('.featured-team-rate')[1];
    const lockNotice = featuredCard.querySelector('.featured-lock-notice span');
    const venueEl = featuredCard.querySelector('.featured-footer > span:last-child');

    if (tourneyEl) tourneyEl.textContent = `🏆 ${featured.competition}`;
    if (livePill) {
      livePill.innerHTML = featured.status === 'live'
        ? `<span class="live-pulse-dot" aria-hidden="true"></span> Live Toss`
        : escapeHtml(featured.status.toUpperCase());
      livePill.className = `featured-live-pill ${featured.status === 'live' ? '' : 'status-upcoming'}`;
    }

    if (teamOneCrest) teamOneCrest.textContent = featured.teamOneAbbr || featured.teamOne.substring(0, 3).toUpperCase();
    if (teamOneName) teamOneName.textContent = featured.teamOne;
    if (teamOneRate) teamOneRate.textContent = `Rate ${parseFloat(featured.teamOneRate || 1.90).toFixed(2)}`;

    if (teamTwoCrest) teamTwoCrest.textContent = featured.teamTwoAbbr || featured.teamTwo.substring(0, 3).toUpperCase();
    if (teamTwoName) teamTwoName.textContent = featured.teamTwo;
    if (teamTwoRate) teamTwoRate.textContent = `Rate ${parseFloat(featured.teamTwoRate || 1.90).toFixed(2)}`;

    if (lockNotice) lockNotice.textContent = `${featured.scheduledTime || 'Scheduled'} • ${featured.stage || 'Toss'}`;
    if (venueEl) venueEl.textContent = featured.venue || 'Cricket Stadium';
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

    // Load authentic matches from MySQL API
    async function loadMatchesData() {
      isLoading = true;
      feedContainer.innerHTML = `
        <div class="text-center text-muted" style="padding: 40px 20px;">
          <span class="btn-spinner" style="margin-right: 8px;"></span> Loading authentic match fixtures from database...
        </div>
      `;

      try {
        const result = await window.TossBookMatches.getAll(currentCategory);
        matchesState = result.matches || [];
        categoryCounts = result.counts || { all: 0, live: 0, upcoming: 0, completed: 0 };

        updateCounts();
        updateFeaturedMatch(window.TossBookMatches.getCached());
        renderFeed();
      } catch (err) {
        console.error('[HOME MATCHES ERROR]', err);
        feedContainer.innerHTML = renderErrorState(err.message);
        const retryBtn = document.getElementById('retry-matches-btn');
        if (retryBtn) retryBtn.addEventListener('click', loadMatchesData);
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

      loadMatchesData();
    }

    // Bind filter clicks
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        setCategory(category);
      });
    });

    // Setup Diagnostics
    setupDiagnostics();

    // Setup Home Wallet Actions (Deposit & Withdrawal)
    setupWalletActions();

    // Initial load
    loadMatchesData();
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

  // Lifecycle
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomePage);
  } else {
    initHomePage();
  }
})();
