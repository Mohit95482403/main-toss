/**
 * IRONMAN TOSS BOOK - Bets History & Filter Controller (Day 4)
 * Handles client-side demonstration betting data, date grouping, status filtering, and empty states.
 */

(function () {
  'use strict';

  // SVGs for Status Badges & Empty State
  const ICONS = {
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    cross: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 6v12M9 9h6M9 15h6"></path></svg>`,
    empty: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M7 10h10M7 14h6"></path></svg>`
  };

  /**
   * Demonstration Betting History Records
   * Strictly identified fictional records matching reference screenshot patterns.
   */
  const DEMO_BETS = [
    {
      id: 'BET-2026-1049',
      dateGroup: 'Today - 14 Oct 2026',
      competition: "ICC MEN'S T20 WORLD CUP",
      teamOne: 'India',
      teamTwo: 'Australia',
      matchTitle: 'India vs Australia',
      marketName: 'Toss Winner',
      selectedTeam: 'India',
      rate: 1.95,
      stake: 500.00,
      status: 'live', // live | won | lost | no_result
      resultText: 'Match in progress • Toss locked • Awaiting live declaration',
      placedAt: 'Today, 02:45 PM'
    },
    {
      id: 'BET-2026-1048',
      dateGroup: 'Today - 14 Oct 2026',
      competition: "IPL 2026 - T20 LEAGUE",
      teamOne: 'Mumbai Indians',
      teamTwo: 'Chennai Super Kings',
      matchTitle: 'Mumbai Indians vs Chennai Super Kings',
      marketName: 'Toss Winner',
      selectedTeam: 'Mumbai Indians',
      rate: 1.90,
      stake: 1000.00,
      status: 'won',
      payout: 1900.00,
      resultText: 'Mumbai Indians won the toss and elected to field first',
      placedAt: 'Today, 11:15 AM'
    },
    {
      id: 'BET-2026-1045',
      dateGroup: 'Yesterday - 13 Oct 2026',
      competition: "ICC MEN'S T20 WORLD CUP",
      teamOne: 'England',
      teamTwo: 'South Africa',
      matchTitle: 'England vs South Africa',
      marketName: 'Toss Winner',
      selectedTeam: 'England',
      rate: 1.85,
      stake: 750.00,
      status: 'lost',
      payout: 0.00,
      resultText: 'South Africa won the toss and elected to bat first',
      placedAt: '13 Oct 2026, 06:30 PM'
    },
    {
      id: 'BET-2026-1042',
      dateGroup: 'Yesterday - 13 Oct 2026',
      competition: "BIG BASH LEAGUE 2026",
      teamOne: 'Sydney Sixers',
      teamTwo: 'Perth Scorchers',
      matchTitle: 'Sydney Sixers vs Perth Scorchers',
      marketName: 'Toss Winner',
      selectedTeam: 'Perth Scorchers',
      rate: 1.92,
      stake: 300.00,
      status: 'won',
      payout: 576.00,
      resultText: 'Perth Scorchers won the toss and chose to bowl',
      placedAt: '13 Oct 2026, 01:10 PM'
    },
    {
      id: 'BET-2026-1039',
      dateGroup: '11 Oct 2026',
      competition: "ASIA CUP T20 2026",
      teamOne: 'Pakistan',
      teamTwo: 'Sri Lanka',
      matchTitle: 'Pakistan vs Sri Lanka',
      marketName: 'Toss Winner',
      selectedTeam: 'Pakistan',
      rate: 1.88,
      stake: 400.00,
      status: 'lost',
      payout: 0.00,
      resultText: 'Sri Lanka won the toss and elected to bat',
      placedAt: '11 Oct 2026, 07:00 PM'
    },
    {
      id: 'BET-2026-1035',
      dateGroup: '11 Oct 2026',
      competition: "INTERNATIONAL T20 SERIES",
      teamOne: 'New Zealand',
      teamTwo: 'West Indies',
      matchTitle: 'New Zealand vs West Indies',
      marketName: 'Toss Winner',
      selectedTeam: 'New Zealand',
      rate: 1.90,
      stake: 500.00,
      status: 'no_result',
      payout: 500.00,
      resultText: 'Toss abandoned due to rain/wet outfield • Stake refunded in full',
      placedAt: '11 Oct 2026, 02:20 PM'
    }
  ];

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
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
      <article class="bet-card" aria-label="Bet on ${escapeHtml(bet.matchTitle)}, Status: ${bet.status}">
        <!-- Header: Tournament & Status -->
        <header class="bet-card-header">
          <span class="tournament-badge" title="${escapeHtml(bet.competition)}">
            ${escapeHtml(bet.competition)}
          </span>
          ${renderStatusPill(bet.status)}
        </header>

        <!-- Body: Teams, Chosen Side & Metrics -->
        <div class="bet-card-body">
          <h2 class="match-title">${escapeHtml(bet.matchTitle)}</h2>
          
          <div class="selection-row">
            <span>Market: <strong>${escapeHtml(bet.marketName)}</strong></span>
            <span>Selection: <strong class="selection-choice">${escapeHtml(bet.selectedTeam)}</strong></span>
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

        <!-- Footer: Result Note & Time -->
        <footer class="bet-card-footer">
          <span class="result-text" title="${escapeHtml(bet.resultText)}">
            ${escapeHtml(bet.resultText)}
          </span>
          <time class="placed-time text-muted" datetime="${escapeHtml(bet.placedAt)}">
            ${escapeHtml(bet.placedAt)}
          </time>
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
  function renderEmptyState(activeFilter) {
    let filterName = activeFilter.toUpperCase();
    if (filterName === 'NO_RESULT') filterName = 'NO RESULT';

    return `
      <section class="bets-empty-state" aria-live="polite">
        <div class="empty-state-icon" aria-hidden="true">
          ${ICONS.empty}
        </div>
        <h3 class="empty-state-title">No ${escapeHtml(filterName)} Bets Found</h3>
        <p class="empty-state-desc">
          There are currently no demo toss wagers matching the "${escapeHtml(filterName)}" category.
        </p>
        <button type="button" class="btn btn-outline btn-sm" id="reset-filter-btn">
          View All Bets
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

    if (!container) return;

    let currentFilter = 'all';

    // Update filter counts dynamically
    function updateFilterCounts() {
      const counts = {
        all: DEMO_BETS.length,
        live: DEMO_BETS.filter(b => b.status === 'live').length,
        won: DEMO_BETS.filter(b => b.status === 'won').length,
        lost: DEMO_BETS.filter(b => b.status === 'lost').length,
        no_result: DEMO_BETS.filter(b => b.status === 'no_result').length
      };

      filterButtons.forEach(btn => {
        const filterKey = btn.dataset.filter;
        const countSpan = btn.querySelector('.filter-count');
        if (countSpan && counts[filterKey] !== undefined) {
          countSpan.textContent = counts[filterKey];
        }
      });

      if (totalCountBadge) {
        totalCountBadge.textContent = `${DEMO_BETS.length} Total Bets`;
      }
    }

    // Render feed based on current filter
    function renderFeed() {
      let filteredBets = DEMO_BETS;
      if (currentFilter !== 'all') {
        filteredBets = DEMO_BETS.filter(b => b.status === currentFilter);
      }

      if (filteredBets.length === 0) {
        container.innerHTML = renderEmptyState(currentFilter);
        const resetBtn = document.getElementById('reset-filter-btn');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => setFilter('all'));
        }
        return;
      }

      const grouped = groupBetsByDate(filteredBets);
      let html = '';

      Object.keys(grouped).forEach(dateKey => {
        const cardsHtml = grouped[dateKey].map(renderBetCard).join('');
        html += `
          <section class="date-group" aria-labelledby="heading-${dateKey.replace(/\s+/g, '-')}">
            <h2 id="heading-${dateKey.replace(/\s+/g, '-')}" class="date-group-heading">
              ${escapeHtml(dateKey)}
            </h2>
            <div class="flex flex-col gap-sm">
              ${cardsHtml}
            </div>
          </section>
        `;
      });

      container.innerHTML = html;
    }

    // Set and apply filter
    function setFilter(filterKey) {
      currentFilter = filterKey;

      filterButtons.forEach(btn => {
        const isMatch = btn.dataset.filter === filterKey;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      });

      renderFeed();
    }

    // Bind filter clicks
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const filterKey = btn.dataset.filter;
        setFilter(filterKey);
      });
    });

    // Initial render
    updateFilterCounts();
    setFilter('all');
  }

  // Bind to DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBetsPage);
  } else {
    initBetsPage();
  }

  // Export controller for programmatic testing
  window.BetsController = {
    init: initBetsPage,
    getDemoBets: () => DEMO_BETS
  };
})();
