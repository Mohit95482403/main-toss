/**
 * IRONMAN TOSS BOOK - Match Details Page Controller (Day 8)
 * Resolves match fixture by URL parameter, handles not-found states,
 * and renders detailed toss market and venue information.
 */

(function () {
  'use strict';

  // SVGs for Icons
  const ICONS = {
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    mapPin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
  };

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
   * Main Initialization
   */
  function initMatchDetails() {
    const contentView = document.getElementById('match-content-view');
    const notFoundView = document.getElementById('match-not-found-view');
    const backBtn = document.getElementById('back-nav-btn');

    // Smart back button: use history if available and from our site, else fallback to index.html
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        if (window.history.length > 1 && document.referrer && document.referrer.includes(window.location.host)) {
          e.preventDefault();
          window.history.back();
        }
      });
    }

    // Get match id from query string
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('id');

    const matchesApi = window.TossBookMatches;
    const match = matchesApi ? matchesApi.getById(matchId) : null;

    if (!match) {
      if (contentView) contentView.style.display = 'none';
      if (notFoundView) notFoundView.style.display = 'flex';
      return;
    }

    // Match found - render details
    if (notFoundView) notFoundView.style.display = 'none';
    if (contentView) contentView.style.display = 'flex';

    // Update document title
    document.title = `IRONMAN TOSS BOOK | ${match.matchTitle}`;

    // Populate Hero Summary Card
    const tourneyEl = document.getElementById('hero-tournament');
    const statusEl = document.getElementById('hero-status-container');
    const teamOneCrest = document.getElementById('hero-team-one-crest');
    const teamOneName = document.getElementById('hero-team-one-name');
    const teamOneCaptain = document.getElementById('hero-team-one-captain');
    const teamTwoCrest = document.getElementById('hero-team-two-crest');
    const teamTwoName = document.getElementById('hero-team-two-name');
    const teamTwoCaptain = document.getElementById('hero-team-two-captain');
    const timeEl = document.getElementById('hero-scheduled-time');
    const venueEl = document.getElementById('hero-venue');
    const lockEl = document.getElementById('hero-lock-status');

    if (tourneyEl) tourneyEl.textContent = `${match.competition} • ${match.stage || 'Fixture'}`;
    if (statusEl) statusEl.innerHTML = renderStatusBadge(match.status);
    if (teamOneCrest) teamOneCrest.textContent = match.teamOneAbbr;
    if (teamOneName) teamOneName.textContent = match.teamOne;
    if (teamOneCaptain) teamOneCaptain.textContent = `Capt: ${match.teamOneCaptain || 'N/A'}`;
    if (teamTwoCrest) teamTwoCrest.textContent = match.teamTwoAbbr;
    if (teamTwoName) teamTwoName.textContent = match.teamTwo;
    if (teamTwoCaptain) teamTwoCaptain.textContent = `Capt: ${match.teamTwoCaptain || 'N/A'}`;
    if (timeEl) timeEl.textContent = match.scheduledTime;
    if (venueEl) venueEl.textContent = match.venue;
    if (lockEl) lockEl.textContent = match.lockCountdown || (match.status === 'completed' ? 'Toss Declared' : 'Locks before toss');

    // Populate Toss Market Overview
    const marketStatusBadge = document.getElementById('toss-market-status-badge');
    const marketDesc = document.getElementById('toss-market-desc');
    const rateOneTeam = document.getElementById('toss-rate-one-team');
    const rateOneVal = document.getElementById('toss-rate-one-val');
    const rateTwoTeam = document.getElementById('toss-rate-two-team');
    const rateTwoVal = document.getElementById('toss-rate-two-val');

    if (marketStatusBadge) marketStatusBadge.textContent = match.tossMarketStatus || 'Active Market';
    if (marketDesc) marketDesc.textContent = match.marketDescription || 'Official referee coin toss market.';
    if (rateOneTeam) rateOneTeam.textContent = `${match.teamOne} Toss Winner`;
    if (rateOneVal) rateOneVal.textContent = match.teamOneRate.toFixed(2);
    if (rateTwoTeam) rateTwoTeam.textContent = `${match.teamTwo} Toss Winner`;
    if (rateTwoVal) rateTwoVal.textContent = match.teamTwoRate.toFixed(2);

    // Populate Meta Grid
    const metaCompetition = document.getElementById('meta-competition');
    const metaStage = document.getElementById('meta-stage');
    const metaVenue = document.getElementById('meta-venue');
    const metaPitch = document.getElementById('meta-pitch');
    const metaReferee = document.getElementById('meta-referee');
    const metaCaptains = document.getElementById('meta-captains');

    if (metaCompetition) metaCompetition.textContent = match.competition;
    if (metaStage) metaStage.textContent = match.stage || 'Official Fixture';
    if (metaVenue) metaVenue.textContent = match.venue;
    if (metaPitch) metaPitch.textContent = match.pitchCondition || 'Standard Cricket Surface';
    if (metaReferee) metaReferee.textContent = match.referee || 'ICC Panel Match Referee';
    if (metaCaptains) metaCaptains.textContent = `${match.teamOneCaptain || match.teamOne} vs ${match.teamTwoCaptain || match.teamTwo}`;
  }

  // Bind on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMatchDetails);
  } else {
    initMatchDetails();
  }

  // Export controller for automated testing
  window.MatchDetailsController = {
    init: initMatchDetails
  };
})();
