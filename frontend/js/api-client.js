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
        const str = JSON.stringify(user);
        localStorage.setItem(USER_KEY, str);
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
    } catch (e) {}
  }

  function isAuthenticated() {
    return Boolean(getToken());
  }

  /**
   * Automatically update UI balances if user wallet data is in response
   */
  function syncBalancesFromUser(user) {
    if (!user || !user.wallet) return;
    const avail = user.wallet.available_balance !== undefined ? user.wallet.available_balance : user.wallet.available;
    const exp = user.wallet.exposure_balance !== undefined ? user.wallet.exposure_balance : user.wallet.exposure;
    if (window.SharedLayout && typeof window.SharedLayout.updateBalances === 'function') {
      window.SharedLayout.updateBalances(avail, exp);
    }
  }

  /**
   * Centralized HTTP Request Dispatcher
   */
  async function request(endpoint, options = {}) {
    const baseUrl = getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${baseUrl}${cleanEndpoint}`;

    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    // Attach Bearer token if available and not explicitly skipped
    const token = getToken();
    if (token && !headers['Authorization'] && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // JSON serialization if body is an object
    let body = options.body;
    if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    const config = {
      method: (options.method || 'GET').toUpperCase(),
      headers,
      body,
      signal: options.signal
    };

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

        // If 401 Unauthorized and was authenticated, session might be expired
        if (res.status === 401 && isAuthenticated()) {
          console.warn('[API CLIENT] Received 401 Unauthorized from', cleanEndpoint);
          // Token expired or invalid
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

      return data;
    } catch (networkError) {
      // Re-throw if already an API error with status
      if (networkError.status) {
        throw networkError;
      }

      // Normalize network failures (e.g. backend offline or CORS error)
      const err = new Error(networkError.message || 'Network connection failed. Please ensure backend server is active.');
      err.status = 0;
      err.code = 'NETWORK_ERROR';
      throw err;
    }
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
   * Session Initialization: refresh live user & wallet from backend on load
   */
  async function initSession() {
    if (!isAuthenticated()) return null;

    try {
      const res = await get('/auth/me');
      const user = res.user || (res.data && res.data.user);
      if (user) {
        setUser(user);
        syncBalancesFromUser(user);
        return user;
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
    initSession,
    getBaseUrl
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
