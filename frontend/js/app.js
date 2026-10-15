/**
 * IRONMAN TOSS BOOK - Frontend Application Entry (Day 1)
 */

(function () {
  'use strict';

  // 1. Initialize Theme from LocalStorage or Default to Reference Light Mode
  function initTheme() {
    const savedTheme = localStorage.getItem('itb_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', savedTheme);
      updateThemeToggleButton(savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      updateThemeToggleButton('light');
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('itb_theme', nextTheme);
    updateThemeToggleButton(nextTheme);
  }

  function updateThemeToggleButton(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode';
    }
  }

  // 2. Backend Health Diagnostic Probe
  async function checkBackendHealth(isManual = false) {
    const statusBadge = document.getElementById('api-status-badge');
    const statusText = document.getElementById('api-status-text');
    const refreshBtn = document.getElementById('api-check-btn');

    if (!statusBadge || !statusText) return;

    if (refreshBtn && window.SharedLayout && typeof window.SharedLayout.setButtonLoading === 'function') {
      window.SharedLayout.setButtonLoading(refreshBtn, true, 'Checking...');
    } else if (refreshBtn) {
      refreshBtn.disabled = true;
    }

    statusBadge.className = 'badge badge-warning badge-pill';
    statusBadge.textContent = 'Checking...';
    statusText.textContent = 'Connecting to backend API...';

    const healthUrl = `${window.APP_CONFIG.apiBaseUrl}${window.APP_CONFIG.endpoints.health}`;

    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data && data.success) {
        statusBadge.className = 'badge badge-success badge-pill';
        statusBadge.textContent = 'Online';
        statusText.innerHTML = `<strong>${escapeHtml(data.message)}</strong> &bull; Service: <code>${escapeHtml(data.service || 'ironman-toss-book-api')}</code> &bull; Uptime: ${Math.floor(data.uptime || 0)}s`;
        if (isManual && window.SharedLayout && typeof window.SharedLayout.showToast === 'function') {
          window.SharedLayout.showToast('Backend API is online and healthy', 'success');
        }
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (err) {
      statusBadge.className = 'badge badge-danger badge-pill';
      statusBadge.textContent = 'Offline';
      statusText.innerHTML = `Unable to connect to <code>${escapeHtml(healthUrl)}</code>. Ensure the backend server is running (<code>npm start</code> in backend).`;
      if (isManual && window.SharedLayout && typeof window.SharedLayout.showToast === 'function') {
        window.SharedLayout.showToast('Backend API connection failed. Ensure server is running on port 5000.', 'error');
      }
    } finally {
      if (refreshBtn && window.SharedLayout && typeof window.SharedLayout.setButtonLoading === 'function') {
        window.SharedLayout.setButtonLoading(refreshBtn, false);
      } else if (refreshBtn) {
        refreshBtn.disabled = false;
      }
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // 3. Lifecycle Binding on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', toggleTheme);
    }

    const checkBtn = document.getElementById('api-check-btn');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => checkBackendHealth(true));
    }

    // Attempt initial passive health probe
    checkBackendHealth(false);
  });
})();
