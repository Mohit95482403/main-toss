/**
 * DADDY TOSS BOOK - Centralized Match Fixtures Service
 * Authoritative integration with MySQL Match Fixtures API (/api/matches).
 * Eliminates all static demo and placeholder datasets.
 */

(function () {
  'use strict';

  let cachedMatches = null;
  let cachedCounts = null;

  function getApiBase() {
    if (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) {
      return window.APP_CONFIG.apiBaseUrl;
    }
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? 'http://localhost:5000/api' : '/api';
  }

  async function fetchAll(category = 'all', search = '') {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.append('category', category);
    if (search) params.append('search', search);

    const url = `${getApiBase()}/matches?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Failed to load matches: HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.success || !json.data) {
      throw new Error(json.error?.message || 'Invalid server response');
    }

    cachedMatches = json.data.matches || [];
    cachedCounts = json.data.counts || { all: 0, live: 0, upcoming: 0, completed: 0 };
    return { matches: cachedMatches, counts: cachedCounts };
  }

  async function fetchById(id) {
    if (!id) return null;
    const url = `${getApiBase()}/matches/${encodeURIComponent(id)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Failed to load match: HTTP ${res.status}`);
    }
    const json = await res.json();
    return json.success ? json.data : null;
  }

  // Export to window
  window.TossBookMatches = {
    getAll: (category, search) => fetchAll(category, search),
    getById: (id) => fetchById(id),
    getCached: () => cachedMatches || [],
    getCachedCounts: () => cachedCounts || { all: 0, live: 0, upcoming: 0, completed: 0 }
  };
})();
