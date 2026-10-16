/**
 * IRONMAN TOSS BOOK - Standardized Frontend API Client (Day 15)
 * Centralized, resilient HTTP client for frontend-backend communication,
 * token lifecycle management, error normalization, and real-time balance sync.
 */

(function () {
  'use strict';

  // Storage Keys
  const TOKEN_KEY = 'itb_auth_token';
  const USER_KEY = 'itb_auth_user';

  /**
   * Determine effective API base URL
   */
  function getBaseUrl() {
    if (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) {
      return window.APP_CONFIG.apiBaseUrl;
    }
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? 'http://localhost:5000/api' : '/api';
  }

  /**
   * Token and user session management
   */
  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function setToken(token, persist = true) {
    try {
      if (persist) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        sessionStorage.setItem(TOKEN_KEY, token);
      }
    } catch (e) {
      console.warn('[API CLIENT] Unable to persist token:', e.message);
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setUser(user) {
    try {
      if (user) {
        // Defensive preservation: if updated user lacks wallet, retain previously verified wallet
        const current = getUser();
        if (current && !user.wallet && (user.id === current.id || user.uuid === current.uuid) && current.wallet) {
          user.wallet = current.wallet;
        }

        // Defensive normalization if flat balance properties exist
        if (!user.wallet && (user.available_balance !== undefined || user.available !== undefined)) {
          user.wallet = {
            available_balance: user.available_balance !== undefined ? user.available_balance : user.available,
            exposure_balance: user.exposure_balance !== undefined ? user.exposure_balance : (user.exposure || 0),
            currency: user.currency || 'INR'
          };
        }

        const str = JSON.stringify(user);
        localStorage.setItem(USER_KEY, str);
        syncBalancesFromUser(user);
      } else {
        localStorage.removeItem(USER_KEY);
        sessionStorage.removeItem(USER_KEY);
      }
    } catch (e) {}
  }

  function clearUser() {
    try {
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(USER_KEY);
      if (window.SharedLayout && typeof window.SharedLayout.updateBalances === 'function') {
        window.SharedLayout.updateBalances('0.00', '0.00');
      }
      try {
        window.dispatchEvent(new CustomEvent('itb:balance-updated', {
          detail: { available: 0, exposure: 0, formattedAvailable: '0.00', formattedExposure: '0.00' }
        }));
      } catch (evtErr) {}
    } catch (e) {}
  }

  function isAuthenticated() {
    return Boolean(getToken());
  }

  // Authoritative balance cache and in-flight promise tracker
  let balanceFetchPromise = null;
  let lastVerifiedBalance = null;

  function formatCoinAmount(val) {
    if (typeof val !== 'number' || isNaN(val)) return '0.00';
    return val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getCurrencySymbol() {
    return (window.APP_CONFIG && window.APP_CONFIG.initialBalances && window.APP_CONFIG.initialBalances.currencySymbol) || '₹';
  }

  /**
   * Resilient DOM updater for every balance presentation across the website.
   * Handles loading ('loading'), error ('error'), and verified loaded ('loaded') states.
   */
  function updateAllBalanceDisplays(available, exposure, state = 'loaded') {
    const symbol = getCurrencySymbol();

    const targets = [
      { id: 'header-available-balance', type: 'available' },
      { id: 'header-exposure-balance', type: 'exposure' },
      { id: 'home-wallet-balance', type: 'available' },
      { id: 'home-wallet-exposure', type: 'exposure' },
      { id: 'hero-available-balance', type: 'available' },
      { id: 'modal-deposit-current-bal', type: 'available' },
      { id: 'modal-withdraw-current-bal', type: 'available' }
    ];

    targets.forEach(({ id, type }) => {
      const el = document.getElementById(id);
      if (!el) return;

      if (state === 'loading') {
        el.classList.add('balance-loading');
        el.classList.remove('balance-error');
        if (!lastVerifiedBalance) {
          el.textContent = `${symbol}...`;
        }
      } else if (state === 'error') {
        el.classList.remove('balance-loading');
        el.classList.add('balance-error');
        el.textContent = `${symbol}—`;
        el.title = 'Unable to retrieve balance from server. Click to retry.';
        if (!el.dataset.hasRetry) {
          el.dataset.hasRetry = 'true';
          el.style.cursor = 'pointer';
          el.addEventListener('click', () => {
            refreshBalance(true).catch(() => {});
          });
        }
      } else {
        el.classList.remove('balance-loading', 'balance-error');
        el.removeAttribute('title');
        const num = type === 'available' ? available : exposure;
        const formatted = formatCoinAmount(num);
        el.textContent = `${symbol}${formatted}`;
      }
    });

    // Also update any elements with data-balance-field
    document.querySelectorAll('[data-balance-field]').forEach(el => {
      const field = el.dataset.balanceField;
      if (state === 'loading') {
        el.classList.add('balance-loading');
        if (!lastVerifiedBalance) el.textContent = `${symbol}...`;
      } else if (state === 'error') {
        el.classList.add('balance-error');
        el.textContent = `${symbol}—`;
      } else {
        el.classList.remove('balance-loading', 'balance-error');
        const num = field === 'exposure' ? exposure : available;
        el.textContent = `${symbol}${formatCoinAmount(num)}`;
      }
    });
  }

  /**
   * Retrieves authoritative balance information from the stored session or last verified network state
   */
  function getBalance() {
    if (lastVerifiedBalance) {
      return {
        available: lastVerifiedBalance.available,
        exposure: lastVerifiedBalance.exposure,
        currency: lastVerifiedBalance.currency,
        formattedAvailable: formatCoinAmount(lastVerifiedBalance.available),
        formattedExposure: formatCoinAmount(lastVerifiedBalance.exposure),
        verified: true
      };
    }

    const user = getUser();
    if (!user || !user.wallet) {
      return {
        available: 0,
        exposure: 0,
        currency: 'INR',
        formattedAvailable: '0.00',
        formattedExposure: '0.00',
        verified: false
      };
    }

    const availNum = Number(user.wallet.available_balance !== undefined ? user.wallet.available_balance : user.wallet.available) || 0;
    const expNum = Number(user.wallet.exposure_balance !== undefined ? user.wallet.exposure_balance : user.wallet.exposure) || 0;
    return {
      available: availNum,
      exposure: expNum,
      currency: user.wallet.currency || 'INR',
      formattedAvailable: formatCoinAmount(availNum),
      formattedExposure: formatCoinAmount(expNum),
      verified: false
    };
  }

  /**
   * Refresh authoritative balance directly from backend MySQL API (/wallet/balance)
   * Resolves to verified balance metrics and updates all page presentations uniformly.
   */
  async function refreshBalance(force = false) {
    if (!isAuthenticated()) {
      lastVerifiedBalance = null;
      updateAllBalanceDisplays(0, 0, 'loaded');
      return {
        available: 0,
        exposure: 0,
        formattedAvailable: '0.00',
        formattedExposure: '0.00',
        currency: 'INR',
        isAuthenticated: false
      };
    }

    if (balanceFetchPromise && !force) {
      return balanceFetchPromise;
    }

    balanceFetchPromise = (async () => {
      try {
        if (!lastVerifiedBalance) {
          updateAllBalanceDisplays(null, null, 'loading');
        }

        let res = null;
        try {
          res = await get('/wallet/balance', { noDedupe: true });
        } catch (walletErr) {
          if (walletErr.status === 404) {
            // Fallback to /auth/me if dedicated route is loading
            res = await get('/auth/me', { noDedupe: true });
          } else {
            throw walletErr;
          }
        }

        let rawAvail = null;
        let rawExp = 0;
        let currency = 'INR';

        if (res) {
          if (typeof res.balance === 'number') {
            rawAvail = res.balance;
          } else if (res.data && typeof res.data.balance === 'number') {
            rawAvail = res.data.balance;
          } else if (res.data && res.data.wallet && typeof res.data.wallet.available_balance === 'number') {
            rawAvail = res.data.wallet.available_balance;
          } else if (res.user && res.user.wallet && typeof res.user.wallet.available_balance === 'number') {
            rawAvail = res.user.wallet.available_balance;
          } else if (res.data && res.data.user && res.data.user.wallet && typeof res.data.user.wallet.available_balance === 'number') {
            rawAvail = res.data.user.wallet.available_balance;
          }

          if (typeof res.exposure_balance === 'number') {
            rawExp = res.exposure_balance;
          } else if (res.data && typeof res.data.exposureBalance === 'number') {
            rawExp = res.data.exposureBalance;
          } else if (res.user && res.user.wallet && typeof res.user.wallet.exposure_balance === 'number') {
            rawExp = res.user.wallet.exposure_balance;
          }

          currency = res.currency || (res.data && res.data.currency) || 'INR';
        }

        if (rawAvail === null || isNaN(rawAvail)) {
          throw new Error('Invalid balance payload returned by server.');
        }

        const availNum = parseFloat(rawAvail);
        const expNum = parseFloat(rawExp || 0);

        lastVerifiedBalance = {
          available: availNum,
          exposure: expNum,
          currency,
          timestamp: Date.now()
        };

        // Synchronize in user session storage
        const current = getUser();
        if (current) {
          current.wallet = {
            available_balance: availNum,
            exposure_balance: expNum,
            currency
          };
          current.available_balance = availNum;
          current.exposure_balance = expNum;
          try {
            localStorage.setItem(USER_KEY, JSON.stringify(current));
          } catch (e) {}
        }

        updateAllBalanceDisplays(availNum, expNum, 'loaded');

        const formattedAvail = formatCoinAmount(availNum);
        const formattedExp = formatCoinAmount(expNum);

        try {
          window.dispatchEvent(new CustomEvent('itb:balance-updated', {
            detail: {
              available: availNum,
              exposure: expNum,
              formattedAvailable: formattedAvail,
              formattedExposure: formattedExp,
              currency,
              verified: true
            }
          }));
        } catch (evtErr) {}

        return {
          available: availNum,
          exposure: expNum,
          formattedAvailable: formattedAvail,
          formattedExposure: formattedExp,
          currency,
          verified: true
        };
      } catch (err) {
        if (err.status === 401) {
          clearToken();
          clearUser();
          updateAllBalanceDisplays(0, 0, 'loaded');
        } else {
          console.warn('[API CLIENT] Authoritative balance fetch notice:', err.message);
          updateAllBalanceDisplays(null, null, 'error');
          try {
            window.dispatchEvent(new CustomEvent('itb:balance-error', {
              detail: { error: err }
            }));
          } catch (evtErr) {}
        }
        throw err;
      } finally {
        balanceFetchPromise = null;
      }
    })();

    return balanceFetchPromise;
  }

  /**
   * Automatically update UI balances if user wallet data is in response
   */
  function syncBalancesFromUser(user) {
    if (!user) return;
    const wallet = user.wallet || (user.available_balance !== undefined ? { available_balance: user.available_balance, exposure_balance: user.exposure_balance || 0 } : null);
    if (!wallet) return;

    const availNum = Number(wallet.available_balance !== undefined ? wallet.available_balance : wallet.available) || 0;
    const expNum = Number(wallet.exposure_balance !== undefined ? wallet.exposure_balance : wallet.exposure) || 0;

    lastVerifiedBalance = {
      available: availNum,
      exposure: expNum,
      currency: wallet.currency || 'INR',
      timestamp: Date.now()
    };

    updateAllBalanceDisplays(availNum, expNum, 'loaded');

    const formattedAvail = formatCoinAmount(availNum);
    const formattedExp = formatCoinAmount(expNum);

    try {
      window.dispatchEvent(new CustomEvent('itb:balance-updated', {
        detail: {
          available: availNum,
          exposure: expNum,
          formattedAvailable: formattedAvail,
          formattedExposure: formattedExp
        }
      }));
    } catch (evtErr) {}
  }

  // Performance: In-flight request deduplication and client-side TTL response cache
  const inFlightRequests = new Map();
  const responseCache = new Map();
  const abortControllers = new Map();

  /**
   * Debounce helper for search and input events
   */
  function debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * AbortController signal generator for cancellable requests (e.g. search typing)
   */
  function getAbortSignal(key) {
    if (abortControllers.has(key)) {
      try {
        abortControllers.get(key).abort();
      } catch (e) {}
    }
    if (typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      abortControllers.set(key, controller);
      return controller.signal;
    }
    return undefined;
  }

  /**
   * Clear cached API responses
   */
  function clearCache(keyPrefix = null) {
    if (!keyPrefix) {
      responseCache.clear();
      return;
    }
    for (const key of responseCache.keys()) {
      if (key.startsWith(keyPrefix)) {
        responseCache.delete(key);
      }
    }
  }

  /**
   * Centralized HTTP Request Dispatcher
   * Implements in-flight request deduplication and short-lived caching for GET operations.
   */
  async function request(endpoint, options = {}) {
    const baseUrl = getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${baseUrl}${cleanEndpoint}`;

    const method = (options.method || 'GET').toUpperCase();
    const token = getToken();

    // Cache key incorporates method, URL, and user context
    const cacheKey = `${method}:${url}:${token ? 'auth' : 'anon'}`;

    // 1. Check TTL cache for safe GET requests
    if (method === 'GET' && options.cacheTTL && responseCache.has(cacheKey)) {
      const cached = responseCache.get(cacheKey);
      if (Date.now() < cached.expiresAt) {
        return cached.data;
      }
      responseCache.delete(cacheKey);
    }

    // 2. In-flight request deduplication for identical concurrent GET calls
    if (method === 'GET' && !options.noDedupe && inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey);
    }

    // 3. Mutating requests (POST, PUT, DELETE) invalidate cache
    if (method !== 'GET') {
      clearCache();
    }

    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    // Attach Bearer token if available and not explicitly skipped
    if (token && !headers['Authorization'] && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // JSON serialization if body is an object or string
    let body = options.body;
    if (body !== undefined && body !== null) {
      if (typeof body === 'object' && !(body instanceof FormData)) {
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
      } else if (typeof body === 'string' && !headers['Content-Type'] && (body.trim().startsWith('{') || body.trim().startsWith('['))) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const config = {
      method,
      headers,
      body,
      signal: options.signal
    };

    const fetchPromise = (async () => {
      try {
        const res = await fetch(url, config);

        // Parse response safely
        let data = null;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await res.json().catch(() => null);
        } else {
          const text = await res.text().catch(() => '');
          data = { rawText: text };
        }

        // Check HTTP error status
        if (!res.ok) {
          const errorObj = (data && data.error) || {};
          const message = errorObj.message || (data && data.message) || (data && data.rawText) || `HTTP Error ${res.status}`;
          const code = errorObj.code || (data && data.code) || `HTTP_${res.status}`;

          const error = new Error(message);
          error.status = res.status;
          error.code = code;
          error.details = errorObj.details || null;
          error.field = errorObj.field || null;
          error.data = data;
          error.error = errorObj;

          // If 401 Unauthorized and was authenticated, session might be expired
          if (res.status === 401 && isAuthenticated()) {
            console.warn('[API CLIENT] Received 401 Unauthorized from', cleanEndpoint);
            if (error.code === 'TOKEN_EXPIRED' || error.code === 'INVALID_TOKEN') {
              clearToken();
              clearUser();
            }
          }

          throw error;
        }

        // Automatically sync balances if user payload was returned
        if (data && data.user) {
          setUser(data.user);
          syncBalancesFromUser(data.user);
        } else if (data && data.data && data.data.user) {
          setUser(data.data.user);
          syncBalancesFromUser(data.data.user);
        }

        // Store in cache if cacheTTL specified
        if (method === 'GET' && options.cacheTTL) {
          responseCache.set(cacheKey, {
            data,
            expiresAt: Date.now() + options.cacheTTL
          });
        }

        return data;
      } catch (networkError) {
        if (networkError.name === 'AbortError') {
          throw networkError;
        }
        if (networkError.status) {
          throw networkError;
        }

        const err = new Error(networkError.message || 'Network connection failed. Please ensure backend server is active.');
        err.status = 0;
        err.code = 'NETWORK_ERROR';
        throw err;
      } finally {
        if (method === 'GET') {
          inFlightRequests.delete(cacheKey);
        }
      }
    })();

    if (method === 'GET' && !options.noDedupe) {
      inFlightRequests.set(cacheKey, fetchPromise);
    }

    return fetchPromise;
  }

  // HTTP Method Convenience Helpers
  function get(endpoint, options = {}) {
    return request(endpoint, { ...options, method: 'GET' });
  }

  function post(endpoint, body, options = {}) {
    return request(endpoint, { ...options, method: 'POST', body });
  }

  function put(endpoint, body, options = {}) {
    return request(endpoint, { ...options, method: 'PUT', body });
  }

  function del(endpoint, options = {}) {
    return request(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Session Initialization: refresh live user & authoritative wallet from backend on load
   */
  async function initSession() {
    if (!isAuthenticated()) {
      updateAllBalanceDisplays(0, 0, 'loaded');
      return null;
    }

    try {
      // Concurrently synchronize profile info and authoritative wallet balance directly from MySQL
      const [userRes] = await Promise.allSettled([
        get('/auth/me', { cacheTTL: 3000 }),
        refreshBalance(true)
      ]);

      if (userRes.status === 'fulfilled' && userRes.value) {
        const user = userRes.value.user || (userRes.value.data && userRes.value.data.user);
        if (user) {
          setUser(user);
          return user;
        }
      }
    } catch (e) {
      console.warn('[API CLIENT] Background session sync notice:', e.message);
    }
    return null;
  }

  // Export to global window namespace
  window.ApiClient = {
    request,
    get,
    post,
    put,
    delete: del,
    getToken,
    setToken,
    clearToken,
    getUser,
    setUser,
    clearUser,
    isAuthenticated,
    getBalance,
    refreshBalance,
    fetchBalance: refreshBalance,
    updateAllBalanceDisplays,
    syncBalancesFromUser,
    initSession,
    getBaseUrl,
    debounce,
    getAbortSignal,
    clearCache,
    formatCoinAmount,
    getLastVerifiedBalance: () => lastVerifiedBalance
  };

  // Auto-sync session on DOMContentLoaded if token exists
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSession();
    });
  } else {
    initSession();
  }
})();
