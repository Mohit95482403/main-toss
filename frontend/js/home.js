/**
 * IRONMAN TOSS BOOK - Home Dashboard & Match Feed Controller (Day 7)
 * Handles demonstration fixtures dataset, category filtering, dynamic counters,
 * featured match interaction, and fixture overview modal.
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

  /**
   * Demonstration Cricket Match Fixtures
   * Strictly identified demonstration data matching reference competitions.
   */
  const DEMO_MATCHES = [
    {
      id: 'MATCH-2026-001',
      featured: true,
      competition: "ICC MEN'S T20 WORLD CUP",
      matchTitle: 'India vs Australia',
      teamOne: 'India',
      teamOneAbbr: 'IND',
      teamOneRate: 1.95,
      teamTwo: 'Australia',
      teamTwoAbbr: 'AUS',
      teamTwoRate: 1.90,
      scheduledTime: 'Today, 03:00 PM',
      lockCountdown: 'Locks in 12m',
      venue: 'Melbourne Cricket Ground, Melbourne',
      captains: 'Rohit Sharma vs Pat Cummins',
      status: 'live', // 'live' | 'upcoming' | 'completed'
      resultSummary: 'Match in progress • Toss locked • Awaiting live declaration'
    },
    {
      id: 'MATCH-2026-002',
      featured: false,
      competition: 'IPL 2026 - T20 LEAGUE',
      matchTitle: 'Mumbai Indians vs Chennai Super Kings',
      teamOne: 'Mumbai Indians',
      teamOneAbbr: 'MI',
      teamOneRate: 1.90,
      teamTwo: 'Chennai Super Kings',
      teamTwoAbbr: 'CSK',
      teamTwoRate: 1.92,
      scheduledTime: 'Today, 07:30 PM',
      venue: 'Wankhede Stadium, Mumbai',
      captains: 'Hardik Pandya vs Ruturaj Gaikwad',
      status: 'upcoming',
      resultSummary: 'Toss market opens 30 minutes before match time'
    },
    {
      id: 'MATCH-2026-003',
      featured: false,
      competition: "ICC MEN'S T20 WORLD CUP",
      matchTitle: 'England vs South Africa',
      teamOne: 'England',
      teamOneAbbr: 'ENG',
      teamOneRate: 1.88,
      teamTwo: 'South Africa',
      teamTwoAbbr: 'SA',
      teamTwoRate: 1.94,
      scheduledTime: 'Tomorrow, 02:30 PM',
      venue: 'Kensington Oval, Barbados',
      captains: 'Jos Buttler vs Aiden Markram',
      status: 'upcoming',
      resultSummary: 'Scheduled Group Stage Clash'
    },
    {
      id: 'MATCH-2026-004',
      featured: false,
      competition: 'BIG BASH LEAGUE 2026',
      matchTitle: 'Sydney Sixers vs Perth Scorchers',
      teamOne: 'Sydney Sixers',
      teamOneAbbr: 'SYS',
      teamOneRate: 1.91,
      teamTwo: 'Perth Scorchers',
      teamTwoAbbr: 'PRS',
      teamTwoRate: 1.91,
      scheduledTime: '16 Oct 2026, 01:45 PM',
      venue: 'Sydney Cricket Ground, Sydney',
      captains: 'Moises Henriques vs Ashton Turner',
      status: 'upcoming',
      resultSummary: 'BBL Season Opener Match'
    },
    {
      id: 'MATCH-2026-005',
      featured: false,
      competition: 'ASIA CUP T20 2026',
      matchTitle: 'Pakistan vs Sri Lanka',
      teamOne: 'Pakistan',
      teamOneAbbr: 'PAK',
      teamOneRate: 1.88,
      teamTwo: 'Sri Lanka',
      teamTwoAbbr: 'SL',
      teamTwoRate: 1.92,
      scheduledTime: '14 Oct 2026, 07:00 PM',
      venue: 'R. Premadasa Stadium, Colombo',
      captains: 'Babar Azam vs Wanindu Hasaranga',
      status: 'completed',
      resultSummary: 'Sri Lanka won the toss and elected to bat first'
    },
    {
      id: 'MATCH-2026-006',
      featured: false,
      competition: 'INTERNATIONAL T20 SERIES',
      matchTitle: 'New Zealand vs West Indies',
      teamOne: 'New Zealand',
      teamOneAbbr: 'NZ',
      teamOneRate: 1.90,
      teamTwo: 'West Indies',
      teamTwoAbbr: 'WI',
      teamTwoRate: 1.90,
      scheduledTime: '13 Oct 2026, 11:30 AM',
      venue: 'Eden Park, Auckland',
      captains: 'Mitchell Santner vs Rovman Powell',
      status: 'completed',
      resultSummary: 'New Zealand won the toss and elected to bowl'
    }
  ];

  let currentCategory = 'all';
  let lastFocusedElement = null;

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
    return `
      <article class="match-card" data-match-id="${escapeHtml(match.id)}" role="button" tabindex="0" aria-label="${escapeHtml(match.matchTitle)}, ${escapeHtml(match.competition)}, Status: ${escapeHtml(match.status)}">
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
            <div class="team-crest" aria-hidden="true">${escapeHtml(match.teamOneAbbr)}</div>
            <div class="team-meta">
              <span class="team-name" title="${escapeHtml(match.teamOne)}">${escapeHtml(match.teamOne)}</span>
              <span class="team-rate-preview">Rate ${match.teamOneRate.toFixed(2)}</span>
            </div>
          </div>

          <div class="match-vs-divider" aria-hidden="true">
            <span class="vs-circle">VS</span>
          </div>

          <div class="match-team team-right">
            <div class="team-crest" aria-hidden="true">${escapeHtml(match.teamTwoAbbr)}</div>
            <div class="team-meta">
              <span class="team-name" title="${escapeHtml(match.teamTwo)}">${escapeHtml(match.teamTwo)}</span>
              <span class="team-rate-preview">Rate ${match.teamTwoRate.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Card Footer: Schedule & View Action -->
        <footer class="match-card-footer">
          <div class="match-schedule-info">
            ${ICONS.clock}
            <span>${escapeHtml(match.scheduledTime)}</span>
          </div>
          <span class="match-view-action">
            <span>Details</span>
            ${ICONS.chevronRight}
          </span>
        </footer>
      </article>
    `;
  }

  /**
   * Render Empty State
   */
  function renderEmptyState(category) {
    let categoryName = category.toUpperCase();
    return `
      <section class="match-empty-state" aria-live="polite">
        <div class="empty-state-icon" aria-hidden="true">
          ${ICONS.empty}
        </div>
        <h3 class="empty-state-title">No ${escapeHtml(categoryName)} Matches Available</h3>
        <p class="empty-state-desc">
          There are currently no demo cricket fixtures listed in the "${escapeHtml(categoryName)}" category.
        </p>
        <button type="button" class="btn btn-outline btn-sm" id="reset-category-btn">
          View All Matches
        </button>
      </section>
    `;
  }

  /**
   * Match Detail Modal Handling
   */
  function setupMatchModal() {
    const modal = document.getElementById('match-detail-modal');
    if (!modal) return;

    function openModalWithMatch(match) {
      lastFocusedElement = document.activeElement;

      const titleEl = document.getElementById('modal-match-title');
      const compEl = document.getElementById('modal-match-comp');
      const statusEl = document.getElementById('modal-match-status');
      const timeEl = document.getElementById('modal-match-time');
      const venueEl = document.getElementById('modal-match-venue');
      const captainsEl = document.getElementById('modal-match-captains');
      const rateOneEl = document.getElementById('modal-rate-team-one');
      const rateTwoEl = document.getElementById('modal-rate-team-two');
      const summaryEl = document.getElementById('modal-match-summary');

      if (titleEl) titleEl.textContent = match.matchTitle;
      if (compEl) compEl.textContent = match.competition;
      if (statusEl) statusEl.textContent = match.status.toUpperCase();
      if (timeEl) timeEl.textContent = match.scheduledTime;
      if (venueEl) venueEl.textContent = match.venue || 'Stadium Venue';
      if (captainsEl) captainsEl.textContent = match.captains || 'Team Captains';
      if (rateOneEl) rateOneEl.textContent = `${match.teamOne}: ${match.teamOneRate.toFixed(2)}`;
      if (rateTwoEl) rateTwoEl.textContent = `${match.teamTwo}: ${match.teamTwoRate.toFixed(2)}`;
      if (summaryEl) summaryEl.textContent = match.resultSummary;

      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      const closeBtn = modal.querySelector('.modal-close-btn') || modal.querySelector('.btn');
      if (closeBtn) closeBtn.focus();
    }

    function closeModal() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
    }

    // Modal close listeners
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-modal-close]')) {
        closeModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        closeModal();
      }
    });

    // Delegate clicks from match feed and featured card
    document.addEventListener('click', (e) => {
      const card = e.target.closest('[data-match-id]');
      if (!card) return;

      const matchId = card.dataset.matchId;
      const match = DEMO_MATCHES.find(m => m.id === matchId);
      if (match) {
        openModalWithMatch(match);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('[data-match-id]');
        if (card && card === document.activeElement) {
          e.preventDefault();
          const matchId = card.dataset.matchId;
          const match = DEMO_MATCHES.find(m => m.id === matchId);
          if (match) {
            openModalWithMatch(match);
          }
        }
      }
    });
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
  function initHomePage() {
    const feedContainer = document.getElementById('match-feed-container');
    const filterButtons = document.querySelectorAll('.match-filter-btn');

    if (!feedContainer) return;

    // Update Category Counts dynamically
    function updateCounts() {
      const counts = {
        all: DEMO_MATCHES.length,
        live: DEMO_MATCHES.filter(m => m.status === 'live').length,
        upcoming: DEMO_MATCHES.filter(m => m.status === 'upcoming').length,
        completed: DEMO_MATCHES.filter(m => m.status === 'completed').length
      };

      filterButtons.forEach(btn => {
        const key = btn.dataset.category;
        const countSpan = btn.querySelector('.match-filter-count');
        if (countSpan && counts[key] !== undefined) {
          countSpan.textContent = counts[key];
        }
      });
    }

    // Render Match List
    function renderFeed() {
      let filtered = DEMO_MATCHES;
      if (currentCategory !== 'all') {
        filtered = DEMO_MATCHES.filter(m => m.status === currentCategory);
      }

      if (filtered.length === 0) {
        feedContainer.innerHTML = renderEmptyState(currentCategory);
        const resetBtn = document.getElementById('reset-category-btn');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => setCategory('all'));
        }
        return;
      }

      const html = filtered.map(renderMatchCard).join('');
      feedContainer.innerHTML = html;
    }

    // Set and apply category
    function setCategory(category) {
      currentCategory = category;

      filterButtons.forEach(btn => {
        const isMatch = btn.dataset.category === category;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      });

      renderFeed();
    }

    // Bind filter clicks
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        setCategory(category);
      });
    });

    // Setup Modals & Diagnostics
    setupMatchModal();
    setupDiagnostics();

    // Initial render
    updateCounts();
    setCategory('all');
  }

  // Bind to DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomePage);
  } else {
    initHomePage();
  }

  // Export controller for automated testing
  window.HomeController = {
    init: initHomePage,
    getDemoMatches: () => DEMO_MATCHES
  };
})();
