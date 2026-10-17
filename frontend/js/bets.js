/**
 * DADDY TOSS BOOK - Bets History & Filter Controller (Day 9 Enhanced)
 * Handles client-side demonstration betting data, date grouping, status filtering,
 * real-time search, dynamic summary metrics, and accessible bet details modal.
 */

(function () {
  'use strict';

  // SVGs for Status Badges, Icons & Empty State
  const ICONS = {
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    cross: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 6v12M9 9h6M9 15h6"></path></svg>`,
    empty: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M7 10h10M7 14h6"></path></svg>`,
    arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`
  };

  /**
   * User Betting History Records (Loaded from MySQL /api/bets/my-bets)
   */
  let userBets = [];
  let betsLoaded = false;
  let betsError = null;

  /**
   * Currency and Rate formatting helpers
   */
  const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function formatCurrency(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return '₹0.00';
    return currencyFormatter.format(amount);
  }

  function formatRate(rate) {
    if (typeof rate !== 'number' || isNaN(rate)) return '0.00';
    return rate.toFixed(2);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

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
   * Status Pill Builder
   */
  function renderStatusPill(status) {
    switch (status) {
      case 'won':
        return `<span class="bet-status-pill status-won">${ICONS.check} Won</span>`;
      case 'lost':
        return `<span class="bet-status-pill status-lost">${ICONS.cross} Lost</span>`;
      case 'live':
        return `<span class="bet-status-pill status-live"><span class="live-pulse-dot" aria-hidden="true"></span> Live</span>`;
      case 'no_result':
        return `<span class="bet-status-pill status-no-result">No Result</span>`;
      default:
        return `<span class="bet-status-pill">${escapeHtml(status)}</span>`;
    }
  }

  /**
   * Calculate summary metrics from a given list of bet records
   */
  function calculateMetrics(bets) {
    if (!Array.isArray(bets)) {
      return {
        totalCount: 0,
        totalStake: 0,
        liveCount: 0,
        liveStake: 0,
        wonCount: 0,
        wonReturn: 0,
        lostCount: 0,
        lostStake: 0
      };
    }

    let totalStake = 0;
    let liveCount = 0;
    let liveStake = 0;
    let wonCount = 0;
    let wonReturn = 0;
    let lostCount = 0;
    let lostStake = 0;

    bets.forEach(bet => {
      const stake = typeof bet.stake === 'number' && !isNaN(bet.stake) ? bet.stake : 0;
      totalStake += stake;

      if (bet.status === 'live') {
        liveCount++;
        liveStake += stake;
      } else if (bet.status === 'won') {
        wonCount++;
        const payout = typeof bet.payout === 'number' && !isNaN(bet.payout) 
          ? bet.payout 
          : stake * (bet.rate || 1);
        wonReturn += payout;
      } else if (bet.status === 'lost') {
        lostCount++;
        lostStake += stake;
      } else if (bet.status === 'no_result') {
        lostCount++; // counted under lost/other/settled
        lostStake += stake;
      }
    });

    return {
      totalCount: bets.length,
      totalStake,
      liveCount,
      liveStake,
      wonCount,
      wonReturn,
      lostCount,
      lostStake
    };
  }

  /**
   * Render Individual Bet Card
   */
  function renderBetCard(bet) {
    const isWon = bet.status === 'won';
    const isLost = bet.status === 'lost';
    const isLive = bet.status === 'live';
    const isNoResult = bet.status === 'no_result';

    let returnLabel = 'Potential';
    let returnValClass = '';
    let returnAmount = bet.stake * bet.rate;

    if (isWon) {
      returnLabel = 'Returned';
      returnValClass = 'payout-won';
      returnAmount = bet.payout !== undefined ? bet.payout : bet.stake * bet.rate;
    } else if (isLost) {
      returnLabel = 'Returned';
      returnValClass = 'payout-lost';
      returnAmount = 0.00;
    } else if (isNoResult) {
      returnLabel = 'Refunded';
      returnAmount = bet.stake;
    }

    return `
      <article class="bet-card" aria-label="Bet ticket ${escapeHtml(bet.id)} on ${escapeHtml(bet.matchTitle)}, Status: ${bet.status}">
        <!-- Header: Tournament, Bet ID & Status -->
        <header class="bet-card-header">
          <div class="bet-header-left">
            <span class="tournament-badge" title="${escapeHtml(bet.competition)}">
              ${escapeHtml(bet.competition)}
            </span>
            <span class="bet-id-badge">${escapeHtml(bet.id)}</span>
          </div>
          ${renderStatusPill(bet.status)}
        </header>

        <!-- Body: Teams, Chosen Side & Metrics -->
        <div class="bet-card-body">
          <h3 class="match-title">${escapeHtml(bet.matchTitle)}</h3>
          
          <div class="selection-row">
            <span>Market: <strong>${escapeHtml(bet.marketName)}</strong></span>
            <span style="display: inline-flex; align-items: center; gap: 6px;">
              ${bet.selectedTeamLogo ? `<img src="${escapeHtml(formatLogoUrl(bet.selectedTeamLogo))}" alt="${escapeHtml(bet.selectedTeam)}" style="width: 18px; height: 18px; object-fit: contain; border-radius: 4px; background: #fff; border: 1px solid #F3D5E0; vertical-align: middle;" onerror="this.style.display='none';" />` : ''}
              <span>Selection: <strong class="selection-choice">${escapeHtml(bet.selectedTeam)}</strong></span>
            </span>
          </div>

          <!-- Financial Metrics -->
          <div class="metrics-row" role="group" aria-label="Bet financial metrics">
            <div class="metric-cell">
              <span class="metric-label">Rate / Odds</span>
              <span class="metric-val">${formatRate(bet.rate)}</span>
            </div>
            <div class="metric-cell">
              <span class="metric-label">Stake Amount</span>
              <span class="metric-val">${formatCurrency(bet.stake)}</span>
            </div>
            <div class="metric-cell">
              <span class="metric-label">${returnLabel}</span>
              <span class="metric-val ${returnValClass}">${formatCurrency(returnAmount)}</span>
            </div>
          </div>
        </div>

        <!-- Footer: Result Note, Time & View Details CTA -->
        <footer class="bet-card-footer">
          <span class="result-text" title="${escapeHtml(bet.resultText)}">
            ${escapeHtml(bet.resultText)}
          </span>
          <div class="bet-footer-right">
            <time class="placed-time text-muted" datetime="${escapeHtml(bet.placedAt)}">
              ${escapeHtml(bet.placedAt)}
            </time>
            <button 
              type="button" 
              class="btn-bet-details" 
              data-bet-id="${escapeHtml(bet.id)}"
              aria-label="View details for bet ${escapeHtml(bet.id)}"
            >
              Details ${ICONS.arrowRight}
            </button>
          </div>
        </footer>
      </article>
    `;
  }

  /**
   * Group bets array by dateGroup preserving chronological order
   */
  function groupBetsByDate(betsList) {
    const groups = {};
    betsList.forEach(bet => {
      const key = bet.dateGroup;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(bet);
    });
    return groups;
  }

  /**
   * Render Empty State
   */
  function renderEmptyState(activeFilter, searchQuery) {
    if (!searchQuery && activeFilter === 'all' && userBets.length === 0) {
      return `
        <section class="bets-empty-state empty-state" aria-live="polite">
          <div class="empty-state-icon" aria-hidden="true">
            ${ICONS.empty}
          </div>
          <h3 class="empty-state-title">No Bets Placed</h3>
          <p class="empty-state-desc">You haven't placed any bets yet.</p>
          <a href="../index.html" class="btn btn-primary btn-sm" style="margin-top: 12px; display: inline-block;">
            Browse Match Fixtures
          </a>
        </section>
      `;
    }

    let filterName = activeFilter.toUpperCase();
    if (filterName === 'NO_RESULT') filterName = 'NO RESULT';

    let desc = `There are currently no toss wagers matching the "${escapeHtml(filterName)}" category.`;
    if (searchQuery) {
      desc = `No toss wagers found matching "${escapeHtml(searchQuery)}" in category "${escapeHtml(filterName)}".`;
    }

    return `
      <section class="bets-empty-state empty-state" aria-live="polite">
        <div class="empty-state-icon" aria-hidden="true">
          ${ICONS.empty}
        </div>
        <h3 class="empty-state-title">No Matching Bets Found</h3>
        <p class="empty-state-desc">${desc}</p>
        <button type="button" class="btn btn-outline btn-sm" id="reset-filter-btn" style="margin-top: 12px;">
          Reset Filter & Search
        </button>
      </section>
    `;
  }

  /**
   * Main Controller Initialization
   */
  function initBetsPage() {
    const container = document.getElementById('bets-feed-container');
    const totalCountBadge = document.getElementById('total-bets-count');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const searchInput = document.getElementById('bets-search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const demoModeBadge = document.getElementById('demo-mode-badge');
    if (demoModeBadge) {
      demoModeBadge.remove();
    }

    // Summary Metric Elements
    const summaryTotalCount = document.getElementById('summary-total-count');
    const summaryTotalStake = document.getElementById('summary-total-stake');
    const summaryLiveCount = document.getElementById('summary-live-count');
    const summaryLiveStake = document.getElementById('summary-live-stake');
    const summaryWonCount = document.getElementById('summary-won-count');
    const summaryWonReturn = document.getElementById('summary-won-return');
    const summaryLostCount = document.getElementById('summary-lost-count');
    const summaryLostStake = document.getElementById('summary-lost-stake');

    // Modal Elements
    const modalBackdrop = document.getElementById('bet-detail-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalFooterCloseBtn = document.getElementById('modal-footer-close-btn');
    const modalTitle = document.getElementById('modal-bet-title');
    const modalStatusPill = document.getElementById('modal-status-pill');
    const modalCompetition = document.getElementById('modal-competition');
    const modalMatchTitle = document.getElementById('modal-match-title');
    const modalTicketId = document.getElementById('modal-ticket-id');
    const modalMarketName = document.getElementById('modal-market-name');
    const modalSelectedTeam = document.getElementById('modal-selected-team');
    const modalPlacedAt = document.getElementById('modal-placed-at');
    const modalRate = document.getElementById('modal-rate');
    const modalStake = document.getElementById('modal-stake');
    const modalPayoutLabel = document.getElementById('modal-payout-label');
    const modalPayout = document.getElementById('modal-payout');
    const modalResultText = document.getElementById('modal-result-text');

    if (!container) return;

    let currentFilter = 'all';
    let searchQuery = '';
    let lastActiveElement = null;

    /**
     * Update Dynamic Summary Cards
     */
    function updateSummaryMetrics() {
      const metrics = calculateMetrics(userBets);

      if (summaryTotalCount) summaryTotalCount.textContent = metrics.totalCount;
      if (summaryTotalStake) summaryTotalStake.textContent = `${formatCurrency(metrics.totalStake)} Staked`;

      if (summaryLiveCount) summaryLiveCount.textContent = metrics.liveCount;
      if (summaryLiveStake) summaryLiveStake.textContent = `${formatCurrency(metrics.liveStake)} In Play`;

      if (summaryWonCount) summaryWonCount.textContent = metrics.wonCount;
      if (summaryWonReturn) summaryWonReturn.textContent = `${formatCurrency(metrics.wonReturn)} Return`;

      if (summaryLostCount) summaryLostCount.textContent = metrics.lostCount;
      if (summaryLostStake) summaryLostStake.textContent = `${formatCurrency(metrics.lostStake)} Settled`;

      if (totalCountBadge) {
        totalCountBadge.textContent = `${metrics.totalCount} Bets`;
      }
    }

    /**
     * Update filter count badges
     */
    function updateFilterCounts() {
      const counts = {
        all: userBets.length,
        live: userBets.filter(b => b.status === 'live').length,
        won: userBets.filter(b => b.status === 'won').length,
        lost: userBets.filter(b => b.status === 'lost').length,
        no_result: userBets.filter(b => b.status === 'no_result').length
      };

      filterButtons.forEach(btn => {
        const filterKey = btn.dataset.filter;
        const countSpan = btn.querySelector('.filter-count');
        if (countSpan && counts[filterKey] !== undefined) {
          countSpan.textContent = counts[filterKey];
        }
      });
    }

    /**
     * Filter bets by status and search query
     */
    function getFilteredBets() {
      let result = userBets;

      // 1. Status Filter
      if (currentFilter !== 'all') {
        result = result.filter(b => b.status === currentFilter);
      }

      // 2. Search Query Filter
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        result = result.filter(b => {
          return (
            (b.matchTitle && b.matchTitle.toLowerCase().includes(q)) ||
            (b.competition && b.competition.toLowerCase().includes(q)) ||
            (b.selectedTeam && b.selectedTeam.toLowerCase().includes(q)) ||
            (b.id && b.id.toLowerCase().includes(q)) ||
            (b.marketName && b.marketName.toLowerCase().includes(q)) ||
            (b.dateGroup && b.dateGroup.toLowerCase().includes(q))
          );
        });
      }

      return result;
    }

    /**
     * Render the bets feed
     */
    function renderFeed() {
      const filteredBets = getFilteredBets();

      if (filteredBets.length === 0) {
        container.innerHTML = renderEmptyState(currentFilter, searchQuery);
        const resetBtn = document.getElementById('reset-filter-btn');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            if (searchInput) {
              searchInput.value = '';
              searchQuery = '';
              if (searchClearBtn) searchClearBtn.style.display = 'none';
            }
            setFilter('all');
          });
        }
        return;
      }

      const grouped = groupBetsByDate(filteredBets);
      let html = '';

      Object.keys(grouped).forEach(dateKey => {
        const cardsHtml = grouped[dateKey].map(renderBetCard).join('');
        html += `
          <section class="date-group" aria-labelledby="heading-${dateKey.replace(/[^a-zA-Z0-9]/g, '-')}">
            <h2 id="heading-${dateKey.replace(/[^a-zA-Z0-9]/g, '-')}" class="date-group-heading">
              ${escapeHtml(dateKey)}
            </h2>
            <div class="flex flex-col gap-sm">
              ${cardsHtml}
            </div>
          </section>
        `;
      });

      container.innerHTML = html;

      // Bind Details buttons
      const detailBtns = container.querySelectorAll('.btn-bet-details');
      detailBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const betId = btn.dataset.betId;
          lastActiveElement = btn;
          openBetModal(betId);
        });
      });
    }

    /**
     * Set and apply status filter
     */
    function setFilter(filterKey) {
      currentFilter = filterKey;

      filterButtons.forEach(btn => {
        const isMatch = btn.dataset.filter === filterKey;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      });

      renderFeed();
    }

    /**
     * Open Bet Details Modal
     */
    function openBetModal(betId) {
      const bet = userBets.find(b => b.id === betId);
      if (!bet || !modalBackdrop) return;

      if (modalTitle) modalTitle.textContent = `Ticket ${bet.id}`;
      if (modalStatusPill) modalStatusPill.innerHTML = renderStatusPill(bet.status);
      if (modalCompetition) modalCompetition.textContent = bet.competition;
      if (modalMatchTitle) modalMatchTitle.textContent = bet.matchTitle;
      if (modalTicketId) modalTicketId.textContent = bet.id;
      if (modalMarketName) modalMarketName.textContent = bet.marketName;
      if (modalSelectedTeam) modalSelectedTeam.textContent = bet.selectedTeam;
      if (modalPlacedAt) modalPlacedAt.textContent = bet.placedAt;
      if (modalRate) modalRate.textContent = formatRate(bet.rate);
      if (modalStake) modalStake.textContent = formatCurrency(bet.stake);

      // Financial return calculation
      let returnLabel = 'Potential Payout';
      let returnAmount = bet.stake * bet.rate;
      if (bet.status === 'won') {
        returnLabel = 'Returned Payout';
        returnAmount = bet.payout !== undefined ? bet.payout : bet.stake * bet.rate;
      } else if (bet.status === 'lost') {
        returnLabel = 'Settled Payout';
        returnAmount = 0.00;
      } else if (bet.status === 'no_result') {
        returnLabel = 'Refund Amount';
        returnAmount = bet.stake;
      }

      if (modalPayoutLabel) modalPayoutLabel.textContent = returnLabel;
      if (modalPayout) modalPayout.textContent = formatCurrency(returnAmount);
      if (modalResultText) modalResultText.textContent = bet.resultText;

      modalBackdrop.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';

      // Focus close button for accessibility
      if (modalCloseBtn) {
        setTimeout(() => modalCloseBtn.focus(), 50);
      }
    }

    /**
     * Close Bet Details Modal
     */
    function closeBetModal() {
      if (!modalBackdrop) return;
      modalBackdrop.setAttribute('hidden', '');
      document.body.style.overflow = '';

      if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
        lastActiveElement.focus();
      }
    }

    // Modal close event listeners
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeBetModal);
    }
    if (modalFooterCloseBtn) {
      modalFooterCloseBtn.addEventListener('click', closeBetModal);
    }
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
          closeBetModal();
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop && !modalBackdrop.hasAttribute('hidden')) {
        closeBetModal();
      }
    });

    // Bind filter button clicks
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const filterKey = btn.dataset.filter;
        setFilter(filterKey);
      });
    });

    // Bind search input
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        if (searchClearBtn) {
          searchClearBtn.style.display = searchQuery.length > 0 ? 'flex' : 'none';
        }
        renderFeed();
      });
    }

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchQuery = '';
          searchClearBtn.style.display = 'none';
          searchInput.focus();
        }
        renderFeed();
      });
    }

    /**
     * Fetch authentic user bets from backend MySQL API
     */
    function loadUserBets() {
      const isAuth = window.ApiClient && typeof window.ApiClient.isAuthenticated === 'function' && window.ApiClient.isAuthenticated();

      if (!isAuth) {
        userBets = [];
        updateSummaryMetrics();
        updateFilterCounts();
        container.innerHTML = `
          <section class="bets-empty-state empty-state" aria-live="polite">
            <div class="empty-state-icon" aria-hidden="true">${ICONS.empty}</div>
            <h3 class="empty-state-title">Sign In Required</h3>
            <p class="empty-state-desc">Please sign in to view your authentic toss bets and wager history.</p>
            <a href="login.html" class="btn btn-primary btn-sm" style="margin-top: 12px; display: inline-block;">
              Sign In to Account
            </a>
          </section>
        `;
        return;
      }

      container.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; color: var(--color-text-muted);">
          <p>Loading your bets...</p>
        </div>
      `;

      window.ApiClient.get('/bets/my-bets')
        .then(res => {
          betsLoaded = true;
          betsError = null;
          if (res && res.success && res.data && Array.isArray(res.data.bets)) {
            userBets = res.data.bets;
          } else {
            userBets = [];
          }
          updateSummaryMetrics();
          updateFilterCounts();
          renderFeed();
        })
        .catch(err => {
          betsLoaded = true;
          betsError = err.message || 'Failed to retrieve bet history';
          userBets = [];
          updateSummaryMetrics();
          updateFilterCounts();
          container.innerHTML = `
            <section class="bets-empty-state empty-state" aria-live="polite">
              <div class="empty-state-icon" aria-hidden="true">${ICONS.empty}</div>
              <h3 class="empty-state-title">Unable to Load Bets</h3>
              <p class="empty-state-desc">${escapeHtml(betsError)}. Please check your connection and try again.</p>
              <button type="button" class="btn btn-outline btn-sm" id="retry-bets-btn" style="margin-top: 12px;">
                Retry
              </button>
            </section>
          `;
          const retryBtn = document.getElementById('retry-bets-btn');
          if (retryBtn) {
            retryBtn.addEventListener('click', loadUserBets);
          }
        });
    }

    // Load bets
    loadUserBets();

    // Refresh authoritative balance on Bets page
    if (window.ApiClient && typeof window.ApiClient.refreshBalance === 'function' && window.ApiClient.isAuthenticated()) {
      window.ApiClient.refreshBalance().catch(() => {});
    }

    // Export controller methods
    window.BetsController = {
      init: initBetsPage,
      getUserBets: () => userBets,
      getDemoBets: () => userBets,
      getFilteredBets: getFilteredBets,
      setFilter: setFilter,
      calculateMetrics: calculateMetrics,
      openBetModal: openBetModal,
      closeBetModal: closeBetModal,
      reload: loadUserBets
    };
  }

  // Bind on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBetsPage);
  } else {
    initBetsPage();
  }
})();

