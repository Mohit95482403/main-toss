/**
 * IRONMAN TOSS BOOK - Administrative Portal Client Controller (Day 14)
 * Handles authentication checks, live statistics, server-side user directory,
 * moderation actions (suspend/restore/ban), role assignment, audit history, and diagnostics.
 */

(function () {
  'use strict';

  // API Base URL
  const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || 'http://localhost:5000/api';

  // Current authenticated admin user state
  let currentAdmin = null;

  // Active state for Users directory
  const usersState = {
    page: 1,
    limit: 10,
    search: '',
    role: 'all',
    status: 'all',
    totalPages: 1,
    total: 0,
    activeTargetUser: null
  };

  // Active state for Audit History
  const auditsState = {
    page: 1,
    limit: 15,
    actionType: 'all',
    search: '',
    totalPages: 1,
    total: 0
  };

  // Active state for Match Monitoring
  const matchesState = {
    search: '',
    status: 'all',
    hasBets: 'all',
    settlement: 'all',
    matches: [],
    stats: null,
    activeMatchForBets: null,
    modalBets: []
  };

  // Active state for Bet Settlement
  const settlementState = {
    eligibleMatches: [],
    selectedMatch: null,
    selectedOutcome: null,
    previewData: null,
    history: []
  };

  // Active state for Player Coin Management
  const coinsState = {
    searchQuery: '',
    matchedPlayers: [],
    selectedPlayer: null,
    activeAction: null, // 'ADMIN_CREDIT' | 'ADMIN_DEBIT'
    history: [],
    historyPage: 1,
    historyLimit: 15,
    historyTotal: 0,
    historyTotalPages: 1,
    actionFilter: 'ALL',
    isSubmitting: false
  };

  /**
   * Helper: Get stored auth token
   */
  function getAuthToken() {
    return localStorage.getItem('itb_auth_token') || sessionStorage.getItem('itb_auth_token');
  }

  /**
   * Helper: Authenticated fetch wrapper
   */
  async function apiFetch(endpoint, options = {}) {
    const token = getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    if (window.ApiClient && typeof window.ApiClient.request === 'function') {
      return window.ApiClient.request(endpoint, {
        ...options,
        headers
      });
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMsg = (data.error && data.error.message) || data.message || `HTTP ${res.status}`;
      const err = new Error(errorMsg);
      err.status = res.status;
      err.code = (data.error && data.error.code) || 'API_ERROR';
      err.error = data.error || {};
      throw err;
    }

    return data;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Currency & Date formatters
   */
  function formatMoney(amount) {
    if (window.ITB_FORMATTERS && window.ITB_FORMATTERS.currency) {
      return window.ITB_FORMATTERS.currency(amount);
    }
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }

  function formatDateStr(dateInput) {
    if (!dateInput) return '—';
    if (window.ITB_FORMATTERS && window.ITB_FORMATTERS.date) {
      return window.ITB_FORMATTERS.date(dateInput);
    }
    try {
      const d = new Date(dateInput);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return String(dateInput);
    }
  }

  /**
   * Show notification toast
   */
  function notify(message, type = 'info') {
    if (window.showAppToast) {
      window.showAppToast(message, type);
    } else {
      console.log(`[TOAST - ${type.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Open & Close Modals
   */
  function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
      el.classList.add('open');
      el.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
      el.classList.remove('open');
      el.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  /**
   * Set up tab switching
   */
  function setupTabs() {
    const tabButtons = document.querySelectorAll('.admin-tab-btn');
    const sections = document.querySelectorAll('.admin-section');

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabKey = btn.dataset.tab;
        tabButtons.forEach((b) => b.classList.remove('active'));
        sections.forEach((s) => s.classList.remove('active'));

        btn.classList.add('active');
        const activeSection = document.getElementById(`section-${tabKey}`);
        if (activeSection) {
          activeSection.classList.add('active');
        }

        // Lazy load tab data
        if (tabKey === 'overview') loadOverviewStats();
        if (tabKey === 'matches') loadMatches();
        if (tabKey === 'settlement') loadSettlement();
        if (tabKey === 'coins') loadCoinsManagement();
        if (tabKey === 'users') loadUsers();
        if (tabKey === 'audits') loadAudits();
        if (tabKey === 'system') loadSystemHealth();
      });
    });

    // "View All Logs" button on overview switches to audits tab
    const viewAllAuditsBtn = document.getElementById('btn-view-all-audits');
    if (viewAllAuditsBtn) {
      viewAllAuditsBtn.addEventListener('click', () => {
        const auditTabBtn = document.querySelector('[data-tab="audits"]');
        if (auditTabBtn) auditTabBtn.click();
      });
    }
  }

  // ===========================================================================
  // 1. AUTHENTICATION & ACCESS VERIFICATION
  // ===========================================================================
  async function verifyAdminAuth() {
    const token = getAuthToken();
    const mainContainer = document.getElementById('admin-main-container');

    if (!token) {
      renderAccessDenied('Authentication required. You must sign in with an administrator account to access this governance area.');
      return false;
    }

    try {
      const res = await apiFetch('/auth/me');
      const user = res.data && res.data.user;

      if (!user || !['admin', 'super_admin'].includes(user.role)) {
        renderAccessDenied('Access Denied. Your account does not have administrative permissions.');
        return false;
      }

      currentAdmin = user;

      // Update header chip
      const usernameEl = document.getElementById('admin-username');
      const roleBadge = document.getElementById('admin-role-badge');
      const avatarEl = document.getElementById('admin-avatar');

      if (usernameEl) usernameEl.textContent = user.username;
      if (roleBadge) {
        roleBadge.textContent = user.role === 'super_admin' ? 'Super Admin' : 'Admin';
        roleBadge.className = `admin-role-badge ${user.role}`;
      }
      if (avatarEl) {
        avatarEl.textContent = (user.username || 'A').charAt(0).toUpperCase();
      }

      return true;
    } catch (err) {
      console.error('[AUTH ERROR]', err);
      renderAccessDenied(`Session verification failed: ${err.message}. Please sign in again.`);
      return false;
    }
  }

  function renderAccessDenied(message) {
    const main = document.getElementById('admin-main-container');
    if (!main) return;

    main.innerHTML = `
      <div style="max-width: 520px; margin: 60px auto; text-align: center; background: var(--color-surface); padding: 36px 24px; border-radius: var(--border-radius-lg); border: 1px solid var(--color-border); box-shadow: var(--shadow-md);">
        <div style="font-size: 48px; margin-bottom: 16px;">🛡️</div>
        <h2 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); margin-bottom: 12px; color: var(--color-danger);">
          Administrative Access Restricted
        </h2>
        <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 24px;">
          ${escapeHtml(message)}
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <a href="../pages/login.html" class="btn btn-primary btn-sm">
            Sign In as Admin
          </a>
          <a href="../index.html" class="btn btn-secondary btn-sm">
            Go to Player View
          </a>
        </div>
      </div>
    `;

    // Disable tab buttons
    document.querySelectorAll('.admin-tab-btn').forEach((b) => (b.disabled = true));
  }

  // ===========================================================================
  // 2. DASHBOARD OVERVIEW & KPIS
  // ===========================================================================
  async function loadOverviewStats() {
    try {
      // Concurrently fetch stats, banner health, and recent audit preview in parallel
      const [statsRes] = await Promise.all([
        apiFetch('/admin/dashboard/stats'),
        loadQuickBannerStatus(),
        loadRecentAuditPreview()
      ]);
      const stats = statsRes.data || {};

      // Populate KPI cards
      const elTotalUsers = document.getElementById('kpi-total-users');
      const elActiveUsers = document.getElementById('kpi-active-users');
      const elRestrictedUsers = document.getElementById('kpi-restricted-users');
      const elNew24h = document.getElementById('kpi-new-24h');
      const elNew7dSub = document.getElementById('kpi-new-7d-sub');
      const elTotalBal = document.getElementById('kpi-total-balance');
      const elTotalExp = document.getElementById('kpi-total-exposure');
      const elActiveSessions = document.getElementById('kpi-active-sessions');
      const elAdminActions = document.getElementById('kpi-admin-actions');

      if (elTotalUsers) elTotalUsers.textContent = (stats.users?.total || 0).toLocaleString();
      if (elActiveUsers) elActiveUsers.textContent = (stats.users?.active || 0).toLocaleString();
      if (elRestrictedUsers) {
        const restricted = (stats.users?.suspended || 0) + (stats.users?.banned || 0);
        elRestrictedUsers.textContent = restricted.toLocaleString();
      }
      if (elNew24h) elNew24h.textContent = (stats.users?.newLast24h || 0).toLocaleString();
      if (elNew7dSub) elNew7dSub.textContent = `+${stats.users?.newLast7d || 0} in past 7 days`;

      if (elTotalBal) elTotalBal.textContent = formatMoney(stats.financials?.totalAvailableBalance || 0);
      if (elTotalExp) elTotalExp.textContent = formatMoney(stats.financials?.totalExposureBalance || 0);
      if (elActiveSessions) elActiveSessions.textContent = (stats.sessions?.activeCount || 0).toLocaleString();
      if (elAdminActions) elAdminActions.textContent = (stats.activity?.recentAuditLogs24h || 0).toLocaleString();
    } catch (err) {
      console.warn('[STATS LOAD ERROR]', err.message);
      notify(`Unable to refresh statistics: ${err.message}`, 'error');
    }
  }

  async function loadQuickBannerStatus() {
    try {
      const res = await apiFetch('/admin/system/status');
      const db = res.data?.database || {};
      const app = res.data?.application || {};

      const bannerDbStatus = document.getElementById('banner-db-status');
      const bannerDbLatency = document.getElementById('banner-db-latency');
      const bannerUptime = document.getElementById('banner-uptime');

      if (bannerDbStatus) {
        bannerDbStatus.textContent = db.status === 'online' ? 'Online' : 'Unavailable';
        bannerDbStatus.className = `health-metric-val ${db.status === 'online' ? 'text-success' : 'text-danger'}`;
      }
      if (bannerDbLatency) bannerDbLatency.textContent = `${db.latencyMs || 0} ms`;
      if (bannerUptime) bannerUptime.textContent = app.uptimeHuman || '--';
    } catch (e) {
      console.warn('[BANNER STATUS ERROR]', e.message);
    }
  }

  async function loadRecentAuditPreview() {
    const tbody = document.getElementById('tbody-recent-audits');
    if (!tbody) return;

    try {
      const res = await apiFetch('/admin/audit-logs?page=1&limit=5');
      const logs = (res.data && res.data.logs) || [];

      if (logs.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center text-muted" style="padding: 24px;">
              No administrative actions recorded yet.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = logs
        .map((log) => {
          const detailStr = log.details ? (log.details.reason || log.details.event || JSON.stringify(log.details)) : '—';
          return `
            <tr>
              <td><span class="text-xs text-muted">${formatDateStr(log.created_at)}</span></td>
              <td><span class="font-bold">${escapeHtml(log.admin_username)}</span></td>
              <td><span class="audit-action-badge">${escapeHtml(log.action_type)}</span></td>
              <td><span class="text-sm">${escapeHtml(log.target_identifier || '—')}</span></td>
              <td><span class="text-xs text-secondary">${escapeHtml(detailStr)}</span></td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger" style="padding: 20px;">Failed to load recent activity: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // ===========================================================================
  // 3. USER MANAGEMENT & DIRECTORY
  // ===========================================================================
  let activeUsersAbortController = null;

  async function loadUsers() {
    const tbody = document.getElementById('tbody-users');
    if (!tbody) return;

    if (activeUsersAbortController) {
      try { activeUsersAbortController.abort(); } catch (e) {}
    }
    activeUsersAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const signal = activeUsersAbortController ? activeUsersAbortController.signal : undefined;

    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted" style="padding: 30px;">
          <span class="btn-spinner" style="margin-right: 8px;"></span> Loading user directory...
        </td>
      </tr>
    `;

    try {
      const queryParams = new URLSearchParams({
        page: usersState.page,
        limit: usersState.limit,
        search: usersState.search,
        role: usersState.role,
        status: usersState.status
      });

      const res = await apiFetch(`/admin/users?${queryParams.toString()}`, { signal });
      const data = res.data || {};
      const users = data.users || [];
      const pagination = data.pagination || {};

      usersState.totalPages = pagination.totalPages || 1;
      usersState.total = pagination.total || 0;

      // Update summary and pagination controls
      const countSummary = document.getElementById('user-count-summary');
      if (countSummary) {
        countSummary.textContent = `${usersState.total} users registered in MySQL`;
      }

      const paginationInfo = document.getElementById('users-pagination-info');
      if (paginationInfo) {
        paginationInfo.textContent = `Showing page ${usersState.page} of ${usersState.totalPages} (${usersState.total} total matching users)`;
      }

      const prevBtn = document.getElementById('btn-users-prev');
      const nextBtn = document.getElementById('btn-users-next');
      if (prevBtn) prevBtn.disabled = usersState.page <= 1;
      if (nextBtn) nextBtn.disabled = usersState.page >= usersState.totalPages;

      if (users.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center" style="padding: 40px 20px;">
              <div class="empty-state-icon" style="font-size: 32px; margin-bottom: 8px;">🔍</div>
              <div class="font-bold">No Users Found</div>
              <div class="text-xs text-muted" style="margin-top: 4px;">
                No user records matched your search "${escapeHtml(usersState.search)}" or selected filters.
              </div>
            </td>
          </tr>
        `;
        return;
      }

      // Render table rows
      tbody.innerHTML = users
        .map((u) => {
          const initials = (u.username || 'U').substring(0, 2).toUpperCase();
          const availBal = formatMoney(u.wallet?.available_balance || 0);
          const expBal = formatMoney(u.wallet?.exposure_balance || 0);
          const isSelf = currentAdmin && currentAdmin.id === u.id;

          return `
            <tr data-user-id="${u.id}">
              <td class="font-bold text-xs text-muted">#${u.id}</td>
              <td>
                <div class="user-info-cell">
                  <div class="user-cell-avatar">${initials}</div>
                  <div class="user-cell-names">
                    <span class="user-name-primary">${escapeHtml(u.full_name || u.username)}</span>
                    <span class="user-name-handle">@${escapeHtml(u.username)}</span>
                  </div>
                </div>
              </td>
              <td>
                <div style="display: flex; flex-direction: column;">
                  <span class="text-sm">${escapeHtml(u.email || '—')}</span>
                  <span class="text-xs text-muted">${escapeHtml(u.phone || '—')}</span>
                </div>
              </td>
              <td>
                <span class="admin-role-badge ${escapeHtml(u.role)}">${escapeHtml(u.role)}</span>
              </td>
              <td>
                <span class="badge-status ${escapeHtml(u.status)}">${escapeHtml(u.status)}</span>
              </td>
              <td>
                <div style="display: flex; flex-direction: column;">
                  <span class="text-sm font-bold text-success">${availBal}</span>
                  ${u.wallet?.exposure_balance > 0 ? `<span class="text-xs text-danger font-medium">Exp: ${expBal}</span>` : ''}
                </div>
              </td>
              <td>
                <span class="text-xs text-muted">${formatDateStr(u.created_at)}</span>
              </td>
              <td style="text-align: right;">
                <div class="table-action-group" style="justify-content: flex-end;">
                  <button type="button" class="btn-action-icon btn-inspect" data-id="${u.id}" title="Inspect full user profile">
                    Inspect
                  </button>
                  ${
                    !isSelf
                      ? `
                    <button type="button" class="btn-action-icon ${u.status === 'active' ? 'btn-danger-action' : ''} btn-status" data-id="${u.id}" data-username="${escapeHtml(u.username)}" data-status="${escapeHtml(u.status)}" title="Change account moderation status">
                      ${u.status === 'active' ? 'Suspend/Ban' : 'Restore'}
                    </button>
                    ${
                      currentAdmin?.role === 'super_admin'
                        ? `<button type="button" class="btn-action-icon btn-role" data-id="${u.id}" data-username="${escapeHtml(u.username)}" data-role="${escapeHtml(u.role)}" title="Assign user role">
                            Role
                          </button>`
                        : ''
                    }
                    <button type="button" class="btn-action-icon btn-danger-action btn-delete-user" data-id="${u.id}" data-username="${escapeHtml(u.username)}" data-balance="${u.wallet?.available_balance || 0}" data-status="${escapeHtml(u.status)}" data-created="${escapeHtml(u.created_at || '')}" title="Permanently delete user account">
                      Delete User
                    </button>
                  `
                      : `<span class="text-xs text-muted" style="padding: 4px 8px;">(Current Admin)</span>`
                  }
                </div>
              </td>
            </tr>
          `;
        })
        .join('');

      // Attach row event listeners
      attachUserTableEvents();
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[USERS LOAD ERROR]', err);
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-danger" style="padding: 30px;">
            Failed to load users: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  function attachUserTableEvents() {
    // Inspect button
    document.querySelectorAll('.btn-inspect').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.id;
        inspectUserDetails(userId);
      });
    });

    // Status button
    document.querySelectorAll('.btn-status').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.id;
        const username = btn.dataset.username;
        const currentStatus = btn.dataset.status;
        promptStatusModal(userId, username, currentStatus);
      });
    });

    // Role button
    document.querySelectorAll('.btn-role').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.id;
        const username = btn.dataset.username;
        const currentRole = btn.dataset.role;
        promptRoleModal(userId, username, currentRole);
      });
    });

    // Delete User button
    document.querySelectorAll('.btn-delete-user').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = parseInt(btn.dataset.id, 10);
        const username = btn.dataset.username;
        const balance = parseFloat(btn.dataset.balance || 0);
        const status = btn.dataset.status;
        const created = btn.dataset.created;
        promptDeleteUserModal({ id: userId, username, balance, status, created_at: created });
      });
    });
  }

  // ===========================================================================
  // 4. USER DETAILS INSPECTOR MODAL
  // ===========================================================================
  async function inspectUserDetails(userId) {
    const bodyEl = document.getElementById('inspect-modal-body');
    if (!bodyEl) return;

    bodyEl.innerHTML = `<div class="text-center text-muted" style="padding: 24px;"><span class="btn-spinner"></span> Fetching record from MySQL...</div>`;
    openModal('modal-inspect-user');

    try {
      const res = await apiFetch(`/admin/users/${userId}`);
      const u = res.data;

      bodyEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--color-border);">
          <div class="user-cell-avatar" style="width: 48px; height: 48px; font-size: var(--font-size-base);">
            ${(u.username || 'U').substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div class="text-base font-bold">${escapeHtml(u.full_name || u.username)}</div>
            <div class="text-xs text-muted">@${escapeHtml(u.username)} • UUID: ${escapeHtml(u.uuid)}</div>
          </div>
        </div>

        <div class="system-metrics-grid" style="grid-template-columns: 1fr 1fr; gap: 12px; font-size: var(--font-size-sm);">
          <div>
            <span class="text-muted text-xs">EMAIL</span>
            <div class="font-bold">${escapeHtml(u.email || '—')}</div>
          </div>
          <div>
            <span class="text-muted text-xs">PHONE</span>
            <div class="font-bold">${escapeHtml(u.phone || '—')}</div>
          </div>
          <div>
            <span class="text-muted text-xs">ROLE</span>
            <div><span class="admin-role-badge ${escapeHtml(u.role)}">${escapeHtml(u.role)}</span></div>
          </div>
          <div>
            <span class="text-muted text-xs">STATUS</span>
            <div><span class="badge-status ${escapeHtml(u.status)}">${escapeHtml(u.status)}</span></div>
          </div>
          <div>
            <span class="text-muted text-xs">AVAILABLE BALANCE</span>
            <div class="font-bold text-success">${formatMoney(u.wallet?.available_balance || 0)}</div>
          </div>
          <div>
            <span class="text-muted text-xs">ACTIVE EXPOSURE</span>
            <div class="font-bold text-danger">${formatMoney(u.wallet?.exposure_balance || 0)}</div>
          </div>
          <div>
            <span class="text-muted text-xs">ACTIVE SESSIONS</span>
            <div class="font-bold">${u.activeSessions || 0} active token(s)</div>
          </div>
          <div>
            <span class="text-muted text-xs">REGISTERED ON</span>
            <div class="text-xs">${formatDateStr(u.created_at)}</div>
          </div>
        </div>

        <div style="background: var(--color-surface-subtle); padding: 10px 14px; border-radius: var(--border-radius-md); font-size: var(--font-size-xs);">
          <span class="text-muted font-bold">Preferences:</span>
          Dark Mode: ${u.preferences?.darkMode ? 'Enabled' : 'Disabled'} • Toss Alerts: ${u.preferences?.tossAlerts ? 'Yes' : 'No'} • Match Reminders: ${u.preferences?.matchReminders ? 'Yes' : 'No'}
        </div>
      `;

      // Configure Delete User button inside inspector modal
      const btnInspectDelete = document.getElementById('btn-inspect-delete-user');
      if (btnInspectDelete) {
        const isSelf = currentAdmin && currentAdmin.id === u.id;
        if (!isSelf) {
          btnInspectDelete.style.display = 'inline-flex';
          btnInspectDelete.onclick = () => {
            promptDeleteUserModal({
              id: u.id,
              username: u.username,
              balance: u.wallet?.available_balance || 0,
              status: u.status,
              created_at: u.created_at
            });
          };
        } else {
          btnInspectDelete.style.display = 'none';
          btnInspectDelete.onclick = null;
        }
      }
    } catch (err) {
      bodyEl.innerHTML = `<div class="text-danger text-center" style="padding: 20px;">Failed to inspect user: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ===========================================================================
  // 5. USER STATUS MODAL (SUSPEND, RESTORE, BAN)
  // ===========================================================================
  function promptStatusModal(userId, username, currentStatus) {
    usersState.activeTargetUser = { id: userId, username, currentStatus };

    const descEl = document.getElementById('status-modal-desc');
    const selectEl = document.getElementById('status-target-select');
    const reasonEl = document.getElementById('status-reason-input');
    const warningBox = document.getElementById('status-warning-box');

    if (descEl) {
      descEl.innerHTML = `Adjust moderation status for account <strong>@${escapeHtml(username)}</strong> (currently <span class="badge-status ${escapeHtml(currentStatus)}">${escapeHtml(currentStatus)}</span>).`;
    }

    if (selectEl) {
      selectEl.value = currentStatus === 'active' ? 'suspended' : 'active';
    }

    if (reasonEl) reasonEl.value = '';

    if (warningBox) {
      warningBox.style.display = selectEl && selectEl.value !== 'active' ? 'flex' : 'none';
      if (selectEl) {
        selectEl.onchange = () => {
          warningBox.style.display = selectEl.value !== 'active' ? 'flex' : 'none';
        };
      }
    }

    openModal('modal-status-user');
  }

  async function handleConfirmStatusChange() {
    if (!usersState.activeTargetUser) return;

    const selectEl = document.getElementById('status-target-select');
    const reasonEl = document.getElementById('status-reason-input');
    const confirmBtn = document.getElementById('btn-confirm-status-change');

    const newStatus = selectEl ? selectEl.value : 'active';
    const reason = reasonEl ? reasonEl.value.trim() : '';

    if (window.SharedLayout?.setButtonLoading) {
      window.SharedLayout.setButtonLoading(confirmBtn, true, 'Updating...');
    }

    try {
      const res = await apiFetch(`/admin/users/${usersState.activeTargetUser.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus, reason })
      });

      notify(res.message || 'Account status updated successfully.', 'success');
      closeModal('modal-status-user');

      // Refresh users directory and dashboard stats
      loadUsers();
      loadOverviewStats();
    } catch (err) {
      notify(`Status update failed: ${err.message}`, 'error');
    } finally {
      if (window.SharedLayout?.setButtonLoading) {
        window.SharedLayout.setButtonLoading(confirmBtn, false);
      }
    }
  }

  // ===========================================================================
  // 6. USER ROLE MODAL (SUPER_ADMIN ONLY)
  // ===========================================================================
  function promptRoleModal(userId, username, currentRole) {
    usersState.activeTargetUser = { id: userId, username, currentRole };

    const descEl = document.getElementById('role-modal-desc');
    const selectEl = document.getElementById('role-target-select');
    const reasonEl = document.getElementById('role-reason-input');

    if (descEl) {
      descEl.innerHTML = `Modify platform permissions for account <strong>@${escapeHtml(username)}</strong> (current role: <span class="admin-role-badge ${escapeHtml(currentRole)}">${escapeHtml(currentRole)}</span>).`;
    }

    if (selectEl) selectEl.value = currentRole;
    if (reasonEl) reasonEl.value = '';

    openModal('modal-role-user');
  }

  async function handleConfirmRoleChange() {
    if (!usersState.activeTargetUser) return;

    const selectEl = document.getElementById('role-target-select');
    const reasonEl = document.getElementById('role-reason-input');
    const confirmBtn = document.getElementById('btn-confirm-role-change');

    const newRole = selectEl ? selectEl.value : 'user';
    const reason = reasonEl ? reasonEl.value.trim() : '';

    if (window.SharedLayout?.setButtonLoading) {
      window.SharedLayout.setButtonLoading(confirmBtn, true, 'Updating...');
    }

    try {
      const res = await apiFetch(`/admin/users/${usersState.activeTargetUser.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole, reason })
      });

      notify(res.message || 'User role updated successfully.', 'success');
      closeModal('modal-role-user');

      loadUsers();
      loadOverviewStats();
    } catch (err) {
      notify(`Role update failed: ${err.message}`, 'error');
    } finally {
      if (window.SharedLayout?.setButtonLoading) {
        window.SharedLayout.setButtonLoading(confirmBtn, false);
      }
    }
  }

  // ===========================================================================
  // 5B. DELETE USER CONFIRMATION & CONTROLLER
  // ===========================================================================
  let deleteUserTarget = null;

  function promptDeleteUserModal(target) {
    if (!target) return;
    deleteUserTarget = target;

    const modalTitle = document.getElementById('delete-user-modal-title');
    const valUsername = document.getElementById('delete-user-val-username');
    const valId = document.getElementById('delete-user-val-id');
    const valStatus = document.getElementById('delete-user-val-status');
    const valBalance = document.getElementById('delete-user-val-balance');
    const valCreated = document.getElementById('delete-user-val-created');
    const expectedUsernameEl = document.getElementById('delete-user-expected-username');
    const confirmInput = document.getElementById('delete-user-confirm-input');
    const reasonInput = document.getElementById('delete-user-reason-input');
    const errorBox = document.getElementById('delete-user-error-box');
    const errorText = document.getElementById('delete-user-error-text');
    const confirmBtn = document.getElementById('btn-confirm-delete-user');
    const spinner = document.getElementById('delete-user-spinner');
    const btnText = document.getElementById('delete-user-btn-text');
    const hintEl = document.getElementById('delete-user-confirm-hint');

    if (modalTitle) modalTitle.textContent = `Permanently Delete @${target.username}?`;
    if (valUsername) valUsername.textContent = `@${target.username}`;
    if (valId) valId.textContent = `#${target.id}`;
    if (valStatus) valStatus.innerHTML = `<span class="badge-status ${escapeHtml(target.status || 'active')}">${escapeHtml(target.status || 'active')}</span>`;
    if (valBalance) valBalance.textContent = formatMoney(target.balance || 0);
    if (valCreated) valCreated.textContent = formatDateStr(target.created_at);
    if (expectedUsernameEl) expectedUsernameEl.textContent = target.username;

    if (confirmInput) confirmInput.value = '';
    if (reasonInput) reasonInput.value = '';
    if (errorBox) errorBox.style.display = 'none';
    if (errorText) errorText.textContent = '';
    if (confirmBtn) confirmBtn.disabled = true;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent = 'Permanently Delete User';
    if (hintEl) hintEl.textContent = 'Button remains disabled until the exact username is typed.';

    openModal('modal-delete-user');

    setTimeout(() => {
      if (confirmInput) confirmInput.focus();
    }, 100);
  }

  function handleDeleteUserConfirmInput() {
    if (!deleteUserTarget) return;
    const confirmInput = document.getElementById('delete-user-confirm-input');
    const confirmBtn = document.getElementById('btn-confirm-delete-user');
    const hintEl = document.getElementById('delete-user-confirm-hint');
    const errorBox = document.getElementById('delete-user-error-box');
    if (!confirmInput || !confirmBtn) return;

    const entered = confirmInput.value.trim();
    const expected = (deleteUserTarget.username || '').trim();
    const matches = entered === expected && entered.length > 0;

    if (matches) {
      confirmBtn.disabled = false;
      if (errorBox) errorBox.style.display = 'none';
      if (hintEl) {
        hintEl.innerHTML = '<span class="text-success font-medium">✓ Username matched. You may now confirm permanent deletion.</span>';
      }
    } else {
      confirmBtn.disabled = true;
      if (hintEl) {
        if (entered.length > 0) {
          hintEl.innerHTML = `<span class="text-danger font-medium">Username does not match "${escapeHtml(expected)}".</span>`;
        } else {
          hintEl.textContent = 'Button remains disabled until the exact username is typed.';
        }
      }
    }
  }

  async function handleConfirmDeleteUser() {
    if (!deleteUserTarget) return;

    const confirmInput = document.getElementById('delete-user-confirm-input');
    const reasonInput = document.getElementById('delete-user-reason-input');
    const confirmBtn = document.getElementById('btn-confirm-delete-user');
    const spinner = document.getElementById('delete-user-spinner');
    const btnText = document.getElementById('delete-user-btn-text');
    const errorBox = document.getElementById('delete-user-error-box');
    const errorText = document.getElementById('delete-user-error-text');

    const enteredUsername = (confirmInput?.value || '').trim();
    const expectedUsername = (deleteUserTarget.username || '').trim();

    if (!enteredUsername || enteredUsername !== expectedUsername) {
      if (errorBox && errorText) {
        errorText.textContent = `Confirmation failed: You must type the exact username "${expectedUsername}" to authorize account deletion.`;
        errorBox.style.display = 'flex';
      }
      return;
    }

    if (confirmBtn) confirmBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Deleting Account...';
    if (errorBox) errorBox.style.display = 'none';

    try {
      const res = await apiFetch(`/admin/users/${deleteUserTarget.id}?confirmUsername=${encodeURIComponent(enteredUsername)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          confirmUsername: enteredUsername,
          reason: (reasonInput?.value || '').trim()
        })
      });

      notify(res.message || `User account "@${expectedUsername}" permanently deleted.`, 'success');

      closeModal('modal-delete-user');
      closeModal('modal-inspect-user');
      deleteUserTarget = null;

      // Refresh directory, statistics, and audit trail
      loadUsers();
      loadOverviewStats();
      loadRecentAuditPreview();
    } catch (err) {
      console.error('[DELETE USER ERROR]', err);
      const msg = err.message || 'Failed to delete user account.';
      if (errorBox && errorText) {
        errorText.textContent = msg;
        errorBox.style.display = 'flex';
      }
      notify(msg, 'error');
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (btnText) btnText.textContent = 'Permanently Delete User';
    }
  }

  // ===========================================================================
  // 6B. CREATE USER MODAL CONTROLLER (ADMIN ONLY)
  // ===========================================================================
  function resetCreateUserForm() {
    const form = document.getElementById('form-create-user');
    if (form) form.reset();

    const balanceInput = document.getElementById('input-create-balance');
    if (balanceInput) balanceInput.value = '0';

    const statusSelect = document.getElementById('select-create-status');
    if (statusSelect) statusSelect.value = 'active';

    const errorBox = document.getElementById('create-user-error-box');
    if (errorBox) {
      errorBox.style.display = 'none';
      const text = document.getElementById('create-user-error-text');
      if (text) text.textContent = '';
    }

    ['displayname', 'fullname', 'username', 'password', 'confirm', 'balance', 'status'].forEach((field) => {
      const errEl = document.getElementById(`error-create-${field}`);
      if (errEl) {
        errEl.style.display = 'none';
        errEl.textContent = '';
      }
    });

    const pwdInput = document.getElementById('input-create-password');
    if (pwdInput) pwdInput.type = 'password';
    const togglePwd = document.getElementById('btn-toggle-create-password');
    if (togglePwd) togglePwd.textContent = '👁️';

    const confirmInput = document.getElementById('input-create-confirm');
    if (confirmInput) confirmInput.type = 'password';
    const toggleConfirm = document.getElementById('btn-toggle-create-confirm');
    if (toggleConfirm) toggleConfirm.textContent = '👁️';
  }

  function setCreateUserFieldError(fieldName, message) {
    const normalized = (fieldName || '').toLowerCase();
    const targetId = (normalized === 'fullname' || normalized === 'displayname') ? 'displayname' :
                     (normalized === 'confirmpassword') ? 'confirm' :
                     (normalized === 'initialcoinbalance' || normalized === 'initialbalance') ? 'balance' :
                     (normalized === 'accountstatus') ? 'status' : normalized;

    const errEl = document.getElementById(`error-create-${targetId}`) ||
                  (targetId === 'displayname' ? document.getElementById('error-create-fullname') : null) ||
                  document.getElementById(`error-create-${normalized}`);
    if (errEl) {
      errEl.textContent = message;
      errEl.style.display = 'block';
    }
    const inputEl = document.getElementById(`input-create-${targetId}`) ||
                    document.getElementById(`select-create-${targetId}`) ||
                    (targetId === 'displayname' ? document.getElementById('input-create-fullname') : null) ||
                    document.getElementById(`input-create-${normalized}`);
    if (inputEl) inputEl.focus();
  }

  async function handleCreateUserSubmit(e) {
    e.preventDefault();

    // Clear previous field errors
    ['displayname', 'fullname', 'username', 'password', 'confirm', 'balance', 'status'].forEach((field) => {
      const errEl = document.getElementById(`error-create-${field}`);
      if (errEl) {
        errEl.style.display = 'none';
        errEl.textContent = '';
      }
    });

    const errorBox = document.getElementById('create-user-error-box');
    const errorText = document.getElementById('create-user-error-text');
    if (errorBox) errorBox.style.display = 'none';

    // The six required fields
    const displayNameInput = document.getElementById('input-create-displayname') || document.getElementById('input-create-fullname');
    const usernameInput = document.getElementById('input-create-username');
    const passwordInput = document.getElementById('input-create-password');
    const confirmInput = document.getElementById('input-create-confirm');
    const balanceInput = document.getElementById('input-create-balance');
    const statusSelect = document.getElementById('select-create-status');

    const displayName = (displayNameInput?.value || '').trim();
    const username = (usernameInput?.value || '').trim();
    const password = passwordInput?.value || '';
    const confirmPassword = confirmInput?.value || '';
    const rawBalance = balanceInput?.value !== undefined ? balanceInput.value : '';
    const initialCoinBalance = parseFloat(rawBalance === '' ? 0 : rawBalance);
    const accountStatus = statusSelect?.value || 'active';

    // Client-side validations
    // 1. Display Name
    if (!displayName || displayName.length < 2 || displayName.length > 100) {
      setCreateUserFieldError('displayname', 'Please enter a valid display name (2–100 characters).');
      return;
    }

    // 2. Username
    if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setCreateUserFieldError('username', 'Username must be 3-30 characters long (letters, numbers, underscores).');
      return;
    }

    // 3. Password
    if (!password || password.length < 8) {
      setCreateUserFieldError('password', 'Password must be at least 8 characters long.');
      return;
    }

    // 4. Confirm Password
    if (!confirmPassword) {
      setCreateUserFieldError('confirm', 'Please confirm the password.');
      return;
    }
    if (password !== confirmPassword) {
      setCreateUserFieldError('confirm', 'Passwords do not match.');
      return;
    }

    // 5. Initial Coin Balance
    if (isNaN(initialCoinBalance) || initialCoinBalance < 0 || initialCoinBalance > 100000000) {
      setCreateUserFieldError('balance', 'Initial coin balance must be a valid, non-negative amount within supported limits.');
      return;
    }

    // 6. Account Status
    if (!['active', 'suspended'].includes(accountStatus)) {
      setCreateUserFieldError('status', 'Please select a valid account status.');
      return;
    }

    // Set submitting state
    const submitBtn = document.getElementById('btn-submit-create-user');
    const spinner = document.getElementById('create-user-spinner');
    const btnText = document.getElementById('create-user-btn-text');

    if (submitBtn) submitBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Creating Account...';

    try {
      const payload = {
        displayName,
        fullName: displayName,
        username,
        password,
        confirmPassword,
        initialCoinBalance,
        initialBalance: initialCoinBalance,
        accountStatus,
        status: accountStatus
      };

      const res = await apiFetch('/admin/users/create', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      notify(res.message || `Player account "@${username}" created successfully.`, 'success');
      closeModal('modal-create-user');
      resetCreateUserForm();

      // Refresh directory and stats
      loadUsers();
      loadOverviewStats();
    } catch (err) {
      console.error('[CREATE USER ERROR]', err);
      const msg = err.message || 'Failed to create user account.';
      if (errorBox && errorText) {
        errorText.textContent = msg;
        errorBox.style.display = 'flex';
      }
      if (err.error && err.error.field) {
        setCreateUserFieldError(err.error.field, msg);
      }
      notify(msg, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (btnText) btnText.textContent = 'Create Account';
    }
  }

  // ===========================================================================
  // 7. AUDIT TRAIL LOGGING
  // ===========================================================================
  async function loadAudits() {
    const tbody = document.getElementById('tbody-audits');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted" style="padding: 30px;">
          <span class="btn-spinner" style="margin-right: 8px;"></span> Loading immutable audit trail...
        </td>
      </tr>
    `;

    try {
      const queryParams = new URLSearchParams({
        page: auditsState.page,
        limit: auditsState.limit,
        actionType: auditsState.actionType,
        search: auditsState.search
      });

      const res = await apiFetch(`/admin/audit-logs?${queryParams.toString()}`);
      const logs = (res.data && res.data.logs) || [];
      const pagination = (res.data && res.data.pagination) || {};

      auditsState.totalPages = pagination.totalPages || 1;
      auditsState.total = pagination.total || 0;

      const paginationInfo = document.getElementById('audits-pagination-info');
      if (paginationInfo) {
        paginationInfo.textContent = `Showing page ${auditsState.page} of ${auditsState.totalPages} (${auditsState.total} total audit entries)`;
      }

      const prevBtn = document.getElementById('btn-audits-prev');
      const nextBtn = document.getElementById('btn-audits-next');
      if (prevBtn) prevBtn.disabled = auditsState.page <= 1;
      if (nextBtn) nextBtn.disabled = auditsState.page >= auditsState.totalPages;

      if (logs.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center" style="padding: 40px 20px;">
              <div class="empty-state-icon" style="font-size: 32px; margin-bottom: 8px;">📜</div>
              <div class="font-bold">No Audit Records Found</div>
              <div class="text-xs text-muted" style="margin-top: 4px;">
                No administrative actions match your current filter criteria.
              </div>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = logs
        .map((log) => {
          const detailStr = log.details ? (log.details.reason || log.details.event || JSON.stringify(log.details)) : '—';
          return `
            <tr>
              <td><span class="text-xs text-muted">${formatDateStr(log.created_at)}</span></td>
              <td><span class="font-bold">${escapeHtml(log.admin_username)}</span></td>
              <td><span class="audit-action-badge">${escapeHtml(log.action_type)}</span></td>
              <td><span class="text-sm">${escapeHtml(log.target_identifier || '—')}</span></td>
              <td><span class="text-xs text-secondary">${escapeHtml(detailStr)}</span></td>
              <td><span class="text-xs text-muted" style="font-family: var(--font-family-mono);">${escapeHtml(log.ip_address || '—')}</span></td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      console.error('[AUDITS LOAD ERROR]', err);
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="padding: 24px;">Failed to load audit history: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // ===========================================================================
  // 8. SYSTEM MONITORING & HEALTH DIAGNOSTICS
  // ===========================================================================
  async function loadSystemHealth() {
    const diagBtn = document.getElementById('btn-run-diag');
    if (diagBtn && window.SharedLayout?.setButtonLoading) {
      window.SharedLayout.setButtonLoading(diagBtn, true, 'Probing...');
    }

    try {
      const res = await apiFetch('/admin/system/status');
      const data = res.data || {};
      const app = data.application || {};
      const proc = data.process || {};
      const db = data.database || {};
      const tables = db.tableCounts || {};

      // Fill service info
      const elAppName = document.getElementById('sys-app-name');
      const elEnv = document.getElementById('sys-env');
      const elUptime = document.getElementById('sys-uptime');
      const elClock = document.getElementById('sys-clock');

      if (elAppName) elAppName.textContent = app.name || 'IRONMAN TOSS BOOK';
      if (elEnv) elEnv.textContent = app.environment || 'development';
      if (elUptime) elUptime.textContent = app.uptimeHuman || '--';
      if (elClock) elClock.textContent = app.serverTime || '--';

      // Fill DB info
      const elDbStatus = document.getElementById('sys-db-status');
      const elDbDriver = document.getElementById('sys-db-driver');
      const elDbLatency = document.getElementById('sys-db-latency');
      const elSessions = document.getElementById('sys-sessions-count');

      if (elDbStatus) {
        elDbStatus.textContent = db.status === 'online' ? 'Online' : 'Unavailable';
        elDbStatus.className = `badge ${db.status === 'online' ? 'badge-success' : 'badge-danger'}`;
      }
      if (elDbDriver) elDbDriver.textContent = `${db.driver} (${db.connectionPool})`;
      if (elDbLatency) elDbLatency.textContent = `${db.latencyMs} ms`;
      if (elSessions) elSessions.textContent = (tables.sessions || 0).toLocaleString();

      // Fill Process info
      const elNodeVer = document.getElementById('sys-node-version');
      const elPlatform = document.getElementById('sys-platform');
      const elMemRss = document.getElementById('sys-mem-rss');
      const elMemHeap = document.getElementById('sys-mem-heap');

      if (elNodeVer) elNodeVer.textContent = proc.nodeVersion || '--';
      if (elPlatform) elPlatform.textContent = `${proc.platform} (${proc.architecture})`;
      if (elMemRss) elMemRss.textContent = proc.memoryUsage?.rss || '--';
      if (elMemHeap) elMemHeap.textContent = `${proc.memoryUsage?.heapUsed} / ${proc.memoryUsage?.heapTotal}`;

      // Fill Table counts
      const elUsersTbl = document.getElementById('tbl-users-count');
      const elWalletsTbl = document.getElementById('tbl-wallets-count');
      const elSessionsTbl = document.getElementById('tbl-sessions-count');
      const elAuditsTbl = document.getElementById('tbl-audits-count');

      if (elUsersTbl) elUsersTbl.textContent = (tables.users || 0).toLocaleString();
      if (elWalletsTbl) elWalletsTbl.textContent = (tables.wallets || 0).toLocaleString();
      if (elSessionsTbl) elSessionsTbl.textContent = (tables.sessions || 0).toLocaleString();
      if (elAuditsTbl) elAuditsTbl.textContent = (tables.admin_audit_logs || 0).toLocaleString();

      notify('Operational diagnostic probe completed: Database online and responsive.', 'success');
    } catch (err) {
      console.error('[SYSTEM HEALTH ERROR]', err);
      notify(`System diagnostic failed: ${err.message}`, 'error');
    } finally {
      if (diagBtn && window.SharedLayout?.setButtonLoading) {
        window.SharedLayout.setButtonLoading(diagBtn, false);
      }
    }
  }

  // ===========================================================================
  // 6. MATCH MONITORING & BET INSPECTION CONTROLLER
  // ===========================================================================
  async function loadMatches() {
    const tableBody = document.getElementById('matches-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center text-muted" style="padding: 24px;">
          Fetching matches and wagering statistics from MySQL...
        </td>
      </tr>
    `;

    try {
      const queryParams = new URLSearchParams({
        search: matchesState.search,
        status: matchesState.status,
        hasBets: matchesState.hasBets,
        settlement: matchesState.settlement
      });

      const res = await apiFetch(`/admin/matches?${queryParams.toString()}`);
      const { summary, matches } = res.data;

      matchesState.matches = matches || [];
      matchesState.stats = summary || {};

      // Update KPI metrics
      const kpiMatchesWithBets = document.getElementById('kpi-matches-with-bets');
      const kpiTotalBets = document.getElementById('kpi-total-bets');
      const kpiPendingBets = document.getElementById('kpi-pending-bets');
      const kpiSettledBets = document.getElementById('kpi-settled-bets');
      const kpiTotalStakes = document.getElementById('kpi-total-stakes');

      if (kpiMatchesWithBets) kpiMatchesWithBets.textContent = summary.matches_with_bets || 0;
      if (kpiTotalBets) kpiTotalBets.textContent = summary.total_bets || 0;
      if (kpiPendingBets) kpiPendingBets.textContent = summary.pending_bets || 0;
      if (kpiSettledBets) kpiSettledBets.textContent = summary.settled_bets || 0;
      if (kpiTotalStakes) kpiTotalStakes.textContent = formatMoney(summary.total_stakes_placed || 0);

      renderMatchesTable(matchesState.matches);
    } catch (err) {
      console.error('[LOAD MATCHES ERROR]', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center text-danger" style="padding: 24px;">
            Failed to load matches: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
      notify(`Failed to load matches: ${err.message}`, 'error');
    }
  }

  function renderMatchesTable(matches) {
    const tableBody = document.getElementById('matches-table-body');
    if (!tableBody) return;

    if (!matches || matches.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center text-muted" style="padding: 30px;">
            No matches found matching the specified filters.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = matches.map((m) => {
      const isSettled = m.settled === 1 || m.settled === true;
      const statusBadge = `<span class="admin-badge role-${(m.status || 'scheduled').toLowerCase()}">${escapeHtml(m.status || 'Scheduled')}</span>`;
      const settlementBadge = isSettled
        ? `<span class="badge-status settled">✓ Settled (${escapeHtml(m.toss_winner || 'Declared')})</span>`
        : (m.pending_bets > 0
            ? `<span class="badge-status pending">⏳ Pending (${m.pending_bets})</span>`
            : `<span class="text-xs text-muted">No Pending</span>`);

      return `
        <tr>
          <td class="font-bold">#${m.id}</td>
          <td>
            <div class="font-bold text-sm">${escapeHtml(m.match_title)}</div>
            <div class="text-xs text-muted">${escapeHtml(m.team_one)} vs ${escapeHtml(m.team_two)}</div>
          </td>
          <td>
            <span class="text-xs font-semibold">${escapeHtml(m.competition || 'Cricket')}</span>
          </td>
          <td>${statusBadge}</td>
          <td class="text-right font-bold">${m.total_bets}</td>
          <td class="text-right text-muted">${m.total_players}</td>
          <td class="text-right font-bold text-primary">${formatMoney(m.total_stake)}</td>
          <td>${settlementBadge}</td>
          <td class="text-center">
            <div style="display: flex; gap: 6px; justify-content: center;">
              <button type="button" class="btn btn-secondary btn-xs btn-inspect-match-bets" data-match-id="${m.id}" title="Inspect all player bets">
                Inspect Bets (${m.total_bets})
              </button>
              ${!isSettled && m.pending_bets > 0 ? `
                <button type="button" class="btn btn-primary btn-xs btn-settle-match-direct" data-match-id="${m.id}" title="Settle this match">
                  Settle
                </button>
              ` : ''}
              ${m.total_bets === 0 ? `
                <button type="button" class="btn btn-danger btn-xs btn-delete-match" data-match-id="${m.id}" title="Delete un-wagered match fixture">
                  Delete
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row button clicks
    tableBody.querySelectorAll('.btn-inspect-match-bets').forEach((btn) => {
      btn.addEventListener('click', () => {
        const matchId = btn.dataset.matchId;
        openMatchBetsModal(matchId);
      });
    });

    tableBody.querySelectorAll('.btn-settle-match-direct').forEach((btn) => {
      btn.addEventListener('click', () => {
        const matchId = btn.dataset.matchId;
        // Switch to settlement tab
        const settlementTabBtn = document.querySelector('[data-tab="settlement"]');
        if (settlementTabBtn) settlementTabBtn.click();
        selectMatchForSettlement(matchId);
      });
    });

    tableBody.querySelectorAll('.btn-delete-match').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const matchId = btn.dataset.matchId;
        if (!confirm(`Are you sure you want to delete match fixture #${matchId}? This action cannot be undone.`)) return;
        try {
          await apiFetch(`/admin/matches/${encodeURIComponent(matchId)}`, { method: 'DELETE' });
          notify('Match fixture deleted successfully.', 'success');
          loadMatches();
        } catch (err) {
          notify(`Failed to delete match: ${err.message}`, 'error');
        }
      });
    });
  }

  function resetCreateMatchForm() {
    const form = document.getElementById('form-create-match');
    if (form) form.reset();
    const errorBox = document.getElementById('create-match-error-box');
    if (errorBox) errorBox.style.display = 'none';
    const rate1 = document.getElementById('match-input-team-one-rate');
    const rate2 = document.getElementById('match-input-team-two-rate');
    if (rate1) rate1.value = '1.90';
    if (rate2) rate2.value = '1.90';
    const statusSelect = document.getElementById('match-input-status');
    if (statusSelect) statusSelect.value = 'upcoming';
  }

  async function handleCreateMatchSubmit(e) {
    e.preventDefault();
    const errorBox = document.getElementById('create-match-error-box');
    const errorText = document.getElementById('create-match-error-text');
    if (errorBox) errorBox.style.display = 'none';

    const competition = document.getElementById('match-input-competition')?.value.trim();
    const stage = document.getElementById('match-input-stage')?.value.trim() || 'Fixture';
    const teamOne = document.getElementById('match-input-team-one')?.value.trim();
    const teamOneAbbr = document.getElementById('match-input-team-one-abbr')?.value.trim() || (teamOne ? teamOne.substring(0, 4).toUpperCase() : '');
    const teamOneRate = parseFloat(document.getElementById('match-input-team-one-rate')?.value || '1.90');
    const teamTwo = document.getElementById('match-input-team-two')?.value.trim();
    const teamTwoAbbr = document.getElementById('match-input-team-two-abbr')?.value.trim() || (teamTwo ? teamTwo.substring(0, 4).toUpperCase() : '');
    const teamTwoRate = parseFloat(document.getElementById('match-input-team-two-rate')?.value || '1.90');
    const scheduledTime = document.getElementById('match-input-schedule')?.value.trim();
    const venue = document.getElementById('match-input-venue')?.value.trim() || 'Cricket Stadium';
    const status = document.getElementById('match-input-status')?.value || 'upcoming';

    if (!competition) {
      if (errorBox && errorText) {
        errorText.textContent = 'Competition / Tournament name is required.';
        errorBox.style.display = 'flex';
      }
      return;
    }
    if (!teamOne) {
      if (errorBox && errorText) {
        errorText.textContent = 'Team One name is required.';
        errorBox.style.display = 'flex';
      }
      return;
    }
    if (!teamTwo) {
      if (errorBox && errorText) {
        errorText.textContent = 'Team Two name is required.';
        errorBox.style.display = 'flex';
      }
      return;
    }
    if (!scheduledTime) {
      if (errorBox && errorText) {
        errorText.textContent = 'Scheduled time is required.';
        errorBox.style.display = 'flex';
      }
      return;
    }

    const submitBtn = document.getElementById('btn-submit-create-match');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Match...';
    }

    try {
      const payload = {
        competition,
        stage,
        team_one: teamOne,
        team_one_abbr: teamOneAbbr,
        team_one_rate: teamOneRate,
        team_two: teamTwo,
        team_two_abbr: teamTwoAbbr,
        team_two_rate: teamTwoRate,
        scheduled_time: scheduledTime,
        venue,
        status
      };

      const res = await apiFetch('/admin/matches', {
        method: 'POST',
        body: payload
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to create match fixture.');
      }

      notify(`Match "${teamOne} vs ${teamTwo}" created and published successfully!`, 'success');
      closeModal('modal-create-match');
      resetCreateMatchForm();
      loadMatches();
    } catch (err) {
      if (errorBox && errorText) {
        errorText.textContent = err.message || 'Error occurred while creating match.';
        errorBox.style.display = 'flex';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Create &amp; Publish Match</span>
        `;
      }
    }
  }

  async function openMatchBetsModal(matchId) {
    const modalStrip = document.getElementById('match-bets-modal-strip');
    const tableBody = document.getElementById('match-bets-table-body');
    const titleEl = document.getElementById('match-bets-modal-title');

    if (titleEl) titleEl.textContent = `Match #${matchId} Bets Inspector`;
    if (modalStrip) modalStrip.innerHTML = '<div class="text-xs text-muted">Loading match metadata...</div>';
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding: 24px;">Loading associated bets from MySQL...</td></tr>';

    openModal('modal-match-bets');

    try {
      const res = await apiFetch(`/admin/matches/${matchId}/bets`);
      const { match, bets, summary } = res.data;

      matchesState.activeMatchForBets = match;
      matchesState.modalBets = bets || [];

      if (titleEl) titleEl.textContent = `${match.match_title} (ID #${match.id})`;

      if (modalStrip) {
        modalStrip.innerHTML = `
          <div class="meta-strip-item">
            <span class="meta-strip-label">Competition</span>
            <span class="meta-strip-value">${escapeHtml(match.competition || 'Cricket')}</span>
          </div>
          <div class="meta-strip-item">
            <span class="meta-strip-label">Teams</span>
            <span class="meta-strip-value">${escapeHtml(match.team_one)} vs ${escapeHtml(match.team_two)}</span>
          </div>
          <div class="meta-strip-item">
            <span class="meta-strip-label">Status</span>
            <span class="meta-strip-value">${escapeHtml(match.status)} ${match.settled ? '(Settled)' : '(Unsettled)'}</span>
          </div>
          <div class="meta-strip-item">
            <span class="meta-strip-label">Rates</span>
            <span class="meta-strip-value">${escapeHtml(match.team_one)}: ${match.rate_team_one || '1.95'} | ${escapeHtml(match.team_two)}: ${match.rate_team_two || '1.95'}</span>
          </div>
          <div class="meta-strip-item">
            <span class="meta-strip-label">Total Stakes</span>
            <span class="meta-strip-value text-primary">${formatMoney(summary.total_stake || 0)}</span>
          </div>
        `;
      }

      filterAndRenderModalBets();
    } catch (err) {
      console.error('[MATCH BETS MODAL ERROR]', err);
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="10" class="text-center text-danger" style="padding: 24px;">Failed to load bets: ${escapeHtml(err.message)}</td></tr>`;
      }
      notify(`Failed to load bets for match #${matchId}: ${err.message}`, 'error');
    }
  }

  function filterAndRenderModalBets() {
    const tableBody = document.getElementById('match-bets-table-body');
    if (!tableBody) return;

    const searchInput = document.getElementById('match-bets-search-input');
    const statusSelect = document.getElementById('match-bets-status-select');
    const settlementSelect = document.getElementById('match-bets-settlement-select');

    const search = (searchInput?.value || '').toLowerCase().trim();
    const status = statusSelect?.value || 'all';
    const settlement = settlementSelect?.value || 'all';

    const filtered = (matchesState.modalBets || []).filter((b) => {
      const matchSearch = !search ||
        (b.username && b.username.toLowerCase().includes(search)) ||
        (b.full_name && b.full_name.toLowerCase().includes(search)) ||
        String(b.id).includes(search);

      const matchStatus = status === 'all' || b.status === status;
      const matchSettlement = settlement === 'all' || b.settlement_status === settlement;

      return matchSearch && matchStatus && matchSettlement;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding: 24px;">No player bets match the criteria.</td></tr>`;
      updateModalFooterSummary(0, 0);
      return;
    }

    let sumStake = 0;
    tableBody.innerHTML = filtered.map((b) => {
      sumStake += parseFloat(b.stake || 0);
      const betStatusBadge = `<span class="badge-status ${b.status}">${escapeHtml(b.status)}</span>`;
      const settlementBadge = `<span class="badge-status ${b.settlement_status}">${escapeHtml(b.settlement_status)}</span>`;

      return `
        <tr>
          <td class="font-bold">#${b.id}</td>
          <td>
            <div class="font-bold">${escapeHtml(b.username || 'User #' + b.user_id)}</div>
            <div class="text-xs text-muted">${escapeHtml(b.full_name || '')}</div>
          </td>
          <td>
            <span class="font-bold text-sm">${escapeHtml(b.selection)}</span>
          </td>
          <td class="text-right font-bold">${formatMoney(b.stake)}</td>
          <td class="text-right text-muted">${parseFloat(b.odds).toFixed(2)}</td>
          <td class="text-right font-bold text-success">${formatMoney(b.potential_return)}</td>
          <td class="text-xs text-muted">${formatDateStr(b.placed_at)}</td>
          <td>${betStatusBadge}</td>
          <td>${settlementBadge}</td>
          <td class="text-right font-bold ${b.payout > 0 ? 'text-success' : 'text-muted'}">
            ${b.payout !== null && b.payout !== undefined ? formatMoney(b.payout) : '--'}
          </td>
        </tr>
      `;
    }).join('');

    updateModalFooterSummary(filtered.length, sumStake);
  }

  function updateModalFooterSummary(count, totalStake) {
    const footerCount = document.getElementById('modal-footer-count');
    const footerStake = document.getElementById('modal-footer-stake');
    if (footerCount) footerCount.textContent = count;
    if (footerStake) footerStake.textContent = formatMoney(totalStake);
  }

  // ===========================================================================
  // 7. BET SETTLEMENT CONTROLLER
  // ===========================================================================
  async function loadSettlement() {
    await loadEligibleMatches();
    await loadSettlementHistory();
  }

  async function loadEligibleMatches() {
    const container = document.getElementById('eligible-matches-container');
    if (!container) return;

    container.innerHTML = '<div class="text-center text-muted" style="padding: 24px; width: 100%;">Searching for matches requiring settlement...</div>';

    try {
      const res = await apiFetch('/admin/settlement/eligible');
      const matches = res.data.eligible_matches || [];
      settlementState.eligibleMatches = matches;

      if (matches.length === 0) {
        container.innerHTML = `
          <div class="alert alert-info" style="grid-column: 1 / -1; width: 100%; margin: 0;">
            <span class="alert-icon">ℹ️</span>
            <span class="alert-text">
              <strong>All clear!</strong> There are currently no matches with unsettled player bets awaiting toss declaration.
            </span>
          </div>
        `;
        return;
      }

      container.innerHTML = matches.map((m) => {
        const isSelected = settlementState.selectedMatch && settlementState.selectedMatch.id === m.id;
        return `
          <div class="eligible-match-card ${isSelected ? 'selected' : ''}" id="eligible-match-card-${m.id}">
            <div>
              <div class="match-card-meta">
                <span>${escapeHtml(m.competition || 'Cricket')}</span>
                <span class="admin-badge role-live">Unsettled</span>
              </div>
              <div class="match-card-title">${escapeHtml(m.match_title)}</div>
              <div class="text-xs text-muted" style="margin-bottom: 8px;">
                ${escapeHtml(m.team_one)} vs ${escapeHtml(m.team_two)}
              </div>
              <div class="match-card-stats">
                <div class="match-card-stat-item">
                  <span class="match-card-stat-label">Pending Bets</span>
                  <span class="match-card-stat-val text-warning">${m.pending_bets_count}</span>
                </div>
                <div class="match-card-stat-item">
                  <span class="match-card-stat-label">Total Stake at Risk</span>
                  <span class="match-card-stat-val text-primary">${formatMoney(m.total_pending_stake)}</span>
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm btn-select-settle-match" data-match-id="${m.id}" style="width: 100%;">
              Select for Settlement →
            </button>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.btn-select-settle-match').forEach((btn) => {
        btn.addEventListener('click', () => {
          const matchId = btn.dataset.matchId;
          selectMatchForSettlement(matchId);
        });
      });
    } catch (err) {
      console.error('[LOAD ELIGIBLE MATCHES ERROR]', err);
      container.innerHTML = `<div class="text-center text-danger" style="padding: 24px; width: 100%;">Failed to load eligible matches: ${escapeHtml(err.message)}</div>`;
      notify(`Failed to load eligible matches: ${err.message}`, 'error');
    }
  }

  async function selectMatchForSettlement(matchId) {
    const workspace = document.getElementById('settlement-workspace');
    if (!workspace) return;

    // Highlight card in grid
    document.querySelectorAll('.eligible-match-card').forEach((c) => c.classList.remove('selected'));
    const activeCard = document.getElementById(`eligible-match-card-${matchId}`);
    if (activeCard) activeCard.classList.add('selected');

    workspace.style.display = 'block';
    workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const titleEl = document.getElementById('workspace-match-title');
    const metaEl = document.getElementById('workspace-match-meta');
    const betsCountEl = document.getElementById('workspace-bets-count');
    const totalStakeEl = document.getElementById('workspace-total-stake');
    const betsTableBody = document.getElementById('workspace-bets-table-body');
    const outcomeOptionsContainer = document.getElementById('outcome-options-container');

    betsTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 16px;">Loading pending wagers...</td></tr>';
    outcomeOptionsContainer.innerHTML = '';

    try {
      const res = await apiFetch(`/admin/matches/${matchId}/bets`);
      const { match, bets } = res.data;

      const pendingBets = (bets || []).filter((b) => b.settlement_status === 'pending');

      settlementState.selectedMatch = match;
      settlementState.selectedOutcome = null;

      if (titleEl) titleEl.textContent = `Settlement: ${match.match_title} (ID #${match.id})`;
      if (metaEl) metaEl.textContent = `${match.competition || 'Cricket'} | ${match.team_one} vs ${match.team_two} | Scheduled: ${formatDateStr(match.start_time || match.created_at)}`;
      if (betsCountEl) betsCountEl.textContent = pendingBets.length;

      const totalStake = pendingBets.reduce((acc, b) => acc + parseFloat(b.stake || 0), 0);
      if (totalStakeEl) totalStakeEl.textContent = formatMoney(totalStake);

      if (pendingBets.length === 0) {
        betsTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 16px;">No pending bets found for this match.</td></tr>';
      } else {
        betsTableBody.innerHTML = pendingBets.map((b) => `
          <tr>
            <td class="font-bold">#${b.id}</td>
            <td>${escapeHtml(b.username || 'User #' + b.user_id)}</td>
            <td><span class="font-bold">${escapeHtml(b.selection)}</span></td>
            <td class="text-right font-bold">${formatMoney(b.stake)}</td>
            <td class="text-right text-muted">${parseFloat(b.odds).toFixed(2)}</td>
            <td class="text-right font-bold text-success">${formatMoney(b.potential_return)}</td>
            <td class="text-xs text-muted">${formatDateStr(b.placed_at)}</td>
          </tr>
        `).join('');
      }

      // Render outcome radio selectors
      const team1 = match.team_one;
      const team2 = match.team_two;

      outcomeOptionsContainer.innerHTML = `
        <label class="outcome-option-card" id="option-card-team1">
          <input type="radio" name="declared_outcome" value="${escapeHtml(team1)}" class="outcome-option-radio">
          <div>
            <div class="outcome-option-label">${escapeHtml(team1)} Won Toss</div>
            <div class="outcome-option-desc">Declare ${escapeHtml(team1)} as official toss winner</div>
          </div>
        </label>

        <label class="outcome-option-card" id="option-card-team2">
          <input type="radio" name="declared_outcome" value="${escapeHtml(team2)}" class="outcome-option-radio">
          <div>
            <div class="outcome-option-label">${escapeHtml(team2)} Won Toss</div>
            <div class="outcome-option-desc">Declare ${escapeHtml(team2)} as official toss winner</div>
          </div>
        </label>

        <label class="outcome-option-card" id="option-card-no-result">
          <input type="radio" name="declared_outcome" value="NO_RESULT" class="outcome-option-radio">
          <div>
            <div class="outcome-option-label">No Result (Refund)</div>
            <div class="outcome-option-desc">Match abandoned/no toss; refund all stakes to players</div>
          </div>
        </label>
      `;

      outcomeOptionsContainer.querySelectorAll('.outcome-option-card').forEach((card) => {
        card.addEventListener('click', () => {
          outcomeOptionsContainer.querySelectorAll('.outcome-option-card').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          const radio = card.querySelector('input[type="radio"]');
          if (radio) {
            radio.checked = true;
            settlementState.selectedOutcome = radio.value;
          }
        });
      });
    } catch (err) {
      console.error('[SELECT SETTLE MATCH ERROR]', err);
      notify(`Failed to load settlement details: ${err.message}`, 'error');
    }
  }

  async function openSettlementPreview() {
    if (!settlementState.selectedMatch) {
      notify('Please select a match to settle first.', 'warning');
      return;
    }

    if (!settlementState.selectedOutcome) {
      notify('Please select the official declared toss outcome (Team 1, Team 2, or No Result).', 'warning');
      return;
    }

    const previewModalContent = document.getElementById('settlement-preview-content');
    const confirmCheckbox = document.getElementById('checkbox-confirm-settlement');
    const executeBtn = document.getElementById('btn-confirm-execute-settlement');
    const errorBox = document.getElementById('settlement-modal-error-box');

    if (errorBox) errorBox.style.display = 'none';
    if (confirmCheckbox) confirmCheckbox.checked = false;
    if (executeBtn) executeBtn.disabled = true;

    if (previewModalContent) {
      previewModalContent.innerHTML = '<div class="text-center text-muted" style="padding: 24px;">Calculating atomic settlement figures...</div>';
    }

    openModal('modal-settlement-preview');

    try {
      const matchId = settlementState.selectedMatch.id;
      const declaredOutcome = settlementState.selectedOutcome;

      const res = await apiFetch('/admin/settlement/preview', {
        method: 'POST',
        body: JSON.stringify({ matchId, declaredOutcome })
      });

      settlementState.previewData = res.data;
      const p = res.data;

      if (previewModalContent) {
        previewModalContent.innerHTML = `
          <div style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--border-radius-md); padding: 14px 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span class="font-bold text-sm">${escapeHtml(p.match_title)} (Match #${p.match_id})</span>
              <span class="badge-status won" style="font-size: 11px;">Declared Winner: ${escapeHtml(p.declared_outcome)}</span>
            </div>
            <div class="text-xs text-muted">
              Total Eligible Bets Pending Settlement: <strong>${p.eligible_bets_count}</strong>
            </div>
          </div>

          <div class="settlement-preview-grid">
            <div class="preview-kpi-card">
              <span class="preview-kpi-title">Winning Bets</span>
              <span class="preview-kpi-val text-success">${p.preview.won_bets_count}</span>
              <span class="text-2xs text-muted">Payout: <strong>${formatMoney(p.preview.total_winning_payout)}</strong></span>
            </div>

            <div class="preview-kpi-card">
              <span class="preview-kpi-title">Losing Bets</span>
              <span class="preview-kpi-val text-danger">${p.preview.lost_bets_count}</span>
              <span class="text-2xs text-muted">Stake Lost: <strong>${formatMoney(p.preview.total_losing_stake)}</strong></span>
            </div>

            <div class="preview-kpi-card">
              <span class="preview-kpi-title">Refunded Bets</span>
              <span class="preview-kpi-val text-info">${p.preview.refund_bets_count}</span>
              <span class="text-2xs text-muted">Refunded: <strong>${formatMoney(p.preview.total_refunded_amount)}</strong></span>
            </div>

            <div class="preview-kpi-card">
              <span class="preview-kpi-title">Net Player Credits</span>
              <span class="preview-kpi-val text-primary">${formatMoney(p.preview.net_balance_impact)}</span>
              <span class="text-2xs text-muted">Credited to player wallets</span>
            </div>
          </div>

          <div class="text-xs text-muted" style="margin-top: 4px;">
            ✓ All locked exposure balances (${formatMoney(p.preview.total_stake_processed)}) will be released automatically upon execution.
          </div>
        `;
      }
    } catch (err) {
      console.error('[SETTLEMENT PREVIEW ERROR]', err);
      if (previewModalContent) {
        previewModalContent.innerHTML = `<div class="text-center text-danger" style="padding: 24px;">Failed to calculate preview: ${escapeHtml(err.message)}</div>`;
      }
      notify(`Preview calculation failed: ${err.message}`, 'error');
    }
  }

  async function executeSettlement() {
    const executeBtn = document.getElementById('btn-confirm-execute-settlement');
    const errorBox = document.getElementById('settlement-modal-error-box');
    const errorText = document.getElementById('settlement-modal-error-text');

    if (!settlementState.selectedMatch || !settlementState.selectedOutcome) {
      notify('Missing match or outcome parameters.', 'error');
      return;
    }

    if (errorBox) errorBox.style.display = 'none';

    if (executeBtn && window.SharedLayout?.setButtonLoading) {
      window.SharedLayout.setButtonLoading(executeBtn, true, 'Settling...');
    } else if (executeBtn) {
      executeBtn.disabled = true;
      executeBtn.textContent = 'Settling...';
    }

    try {
      const matchId = settlementState.selectedMatch.id;
      const declaredOutcome = settlementState.selectedOutcome;
      const notesInput = document.getElementById('settlement-notes-input');
      const notes = notesInput ? notesInput.value.trim() : '';

      const res = await apiFetch('/admin/settlement/process', {
        method: 'POST',
        body: JSON.stringify({ matchId, declaredOutcome, notes })
      });

      notify(`Match settled successfully! ${res.data.bets_settled} bets processed.`, 'success');

      // Close modal
      closeModal('modal-settlement-preview');

      // Hide workspace
      const workspace = document.getElementById('settlement-workspace');
      if (workspace) workspace.style.display = 'none';

      // Reset state
      settlementState.selectedMatch = null;
      settlementState.selectedOutcome = null;
      settlementState.previewData = null;

      // Reload settlement data
      await loadEligibleMatches();
      await loadSettlementHistory();

      // If matches tab is opened, reload matches too
      loadMatches();
    } catch (err) {
      console.error('[EXECUTE SETTLEMENT ERROR]', err);
      if (errorBox && errorText) {
        errorText.textContent = err.message || 'Settlement failed. Database rollback completed.';
        errorBox.style.display = 'flex';
      }
      notify(`Settlement failed: ${err.message}`, 'error');
    } finally {
      if (executeBtn && window.SharedLayout?.setButtonLoading) {
        window.SharedLayout.setButtonLoading(executeBtn, false);
      } else if (executeBtn) {
        executeBtn.disabled = false;
        executeBtn.textContent = 'Execute Settlement';
      }
    }
  }

  async function loadSettlementHistory() {
    const tableBody = document.getElementById('settlement-history-table-body');
    if (!tableBody) return;

    try {
      const res = await apiFetch('/admin/settlement/history?page=1&limit=15');
      const settlements = res.data.settlements || [];

      if (settlements.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center text-muted" style="padding: 24px;">
              No settlements have been recorded yet.
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = settlements.map((s) => `
        <tr>
          <td><code class="text-xs font-mono font-bold">${escapeHtml(s.settlement_uuid.substring(0, 18))}...</code></td>
          <td>
            <div class="font-bold text-sm">${escapeHtml(s.match_title)}</div>
            <div class="text-xs text-muted">ID #${s.match_id}</div>
          </td>
          <td>
            <span class="badge-status won">${escapeHtml(s.declared_outcome)}</span>
          </td>
          <td class="text-right font-bold">${s.bets_settled}</td>
          <td class="text-right text-xs">
            <span class="text-success font-bold">${s.won_count} W</span> / 
            <span class="text-danger font-bold">${s.lost_count} L</span> / 
            <span class="text-info font-bold">${s.refund_count} R</span>
          </td>
          <td class="text-right">${formatMoney(s.total_stake)}</td>
          <td class="text-right font-bold text-success">${formatMoney(s.total_payout)}</td>
          <td>
            <div class="font-semibold text-xs">${escapeHtml(s.settled_by_username || 'Admin #' + s.settled_by_admin_id)}</div>
          </td>
          <td class="text-xs text-muted">${formatDateStr(s.settled_at)}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('[LOAD SETTLEMENT HISTORY ERROR]', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center text-danger" style="padding: 24px;">
            Failed to load settlement history: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  // ===========================================================================
  // 7b. PLAYER COIN MANAGEMENT
  // ===========================================================================

  async function loadCoinsManagement() {
    if (coinsState.selectedPlayer) {
      await refreshSelectedPlayer();
    }
    await loadCoinHistory();
  }

  async function searchPlayerForCoins(rawUsername) {
    const query = (rawUsername || '').trim();
    const feedbackEl = document.getElementById('coin-search-feedback');
    const feedbackText = document.getElementById('coin-search-feedback-text');
    const resultsBox = document.getElementById('coin-search-results-box');
    const matchesList = document.getElementById('coin-matches-list');
    const matchesCount = document.getElementById('coin-matches-count');
    const clearBtn = document.getElementById('btn-clear-player-search');

    if (!query) {
      notify('Please enter a username to search.', 'warning');
      return;
    }

    if (feedbackEl) feedbackEl.style.display = 'none';
    if (resultsBox) resultsBox.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'inline-flex';

    coinsState.searchQuery = query;

    const searchBtn = document.getElementById('btn-search-player-coin');
    if (searchBtn && window.SharedLayout?.setButtonLoading) {
      window.SharedLayout.setButtonLoading(searchBtn, true, 'Searching...');
    } else if (searchBtn) {
      searchBtn.disabled = true;
      searchBtn.textContent = 'Searching...';
    }

    try {
      const res = await apiFetch(`/admin/coins/search?username=${encodeURIComponent(query)}`);
      const players = (res.data && res.data.players) || [];
      coinsState.matchedPlayers = players;

      if (players.length === 0) {
        if (feedbackEl && feedbackText) {
          feedbackEl.className = 'alert alert-warning';
          feedbackText.innerHTML = `No players found matching <strong>"${escapeHtml(query)}"</strong>. Please verify the username.`;
          feedbackEl.style.display = 'flex';
        }
        notify(`No players found matching "${query}".`, 'warning');
        return;
      }

      if (players.length === 1) {
        // Direct match: display match chip and auto-select player
        if (resultsBox && matchesList && matchesCount) {
          matchesCount.textContent = '1';
          matchesList.innerHTML = renderMatchItemHtml(players[0], true);
          resultsBox.style.display = 'block';
        }
        selectPlayerForCoins(players[0]);
        notify(`Found player: ${players[0].username}`, 'success');
      } else {
        // Multiple matches: show list for manual selection
        if (resultsBox && matchesList && matchesCount) {
          matchesCount.textContent = players.length;
          matchesList.innerHTML = players.map(p => renderMatchItemHtml(p, coinsState.selectedPlayer && coinsState.selectedPlayer.id === p.id)).join('');
          resultsBox.style.display = 'block';
        }
        if (feedbackEl && feedbackText) {
          feedbackEl.className = 'alert alert-info';
          feedbackText.innerHTML = `Found <strong>${players.length}</strong> matching accounts. Please select the player you wish to manage.`;
          feedbackEl.style.display = 'flex';
        }
      }
    } catch (err) {
      console.error('[COIN SEARCH ERROR]', err);
      if (feedbackEl && feedbackText) {
        feedbackEl.className = 'alert alert-danger';
        feedbackText.textContent = `Search error: ${err.message}`;
        feedbackEl.style.display = 'flex';
      }
      notify(`Search error: ${err.message}`, 'error');
    } finally {
      if (searchBtn && window.SharedLayout?.setButtonLoading) {
        window.SharedLayout.setButtonLoading(searchBtn, false);
      } else if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search Player';
      }
    }
  }

  function renderMatchItemHtml(player, isSelected) {
    return `
      <div class="coin-match-item ${isSelected ? 'active' : ''}" data-player-id="${player.id}">
        <div>
          <div class="coin-match-user-title">@${escapeHtml(player.username)}</div>
          <div class="coin-match-user-sub">${escapeHtml(player.fullName || player.email)} • ID #${player.id}</div>
        </div>
        <div>
          <div class="coin-match-user-bal">${formatMoney(player.available_balance)}</div>
          <div class="coin-match-user-sub">${player.status}</div>
        </div>
      </div>
    `;
  }

  function selectPlayerForCoins(player) {
    coinsState.selectedPlayer = player;

    // Update active highlight in match list
    document.querySelectorAll('.coin-match-item').forEach(el => {
      if (parseInt(el.dataset.playerId, 10) === player.id) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    const card = document.getElementById('card-selected-player');
    const usernameEl = document.getElementById('selected-player-username');
    const fullnameEl = document.getElementById('selected-player-fullname');
    const idEl = document.getElementById('selected-player-id');
    const uuidEl = document.getElementById('selected-player-uuid');
    const balanceEl = document.getElementById('selected-player-balance');
    const exposureEl = document.getElementById('selected-player-exposure');
    const statusBadgeEl = document.getElementById('selected-player-status-badge');
    const emailEl = document.getElementById('selected-player-email');
    const createdEl = document.getElementById('selected-player-created');
    const roleEl = document.getElementById('selected-player-role');

    if (usernameEl) usernameEl.textContent = `@${player.username}`;
    if (fullnameEl) fullnameEl.textContent = player.fullName || '--';
    if (idEl) idEl.textContent = `Player #${player.id}`;
    if (uuidEl) uuidEl.textContent = player.uuid || '--';
    if (balanceEl) balanceEl.textContent = Number(player.available_balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (exposureEl) exposureEl.textContent = `Locked Exposure: ${formatMoney(player.exposure_balance || 0)}`;
    if (statusBadgeEl) {
      statusBadgeEl.innerHTML = `<span class="badge badge-${player.status === 'active' ? 'success' : 'danger'}">${player.status}</span>`;
    }
    if (emailEl) emailEl.textContent = player.email || '--';
    if (createdEl) createdEl.textContent = formatDateStr(player.createdAt || player.created_at);
    if (roleEl) roleEl.textContent = `Role: ${player.role}`;

    if (card) {
      card.style.display = 'block';
    }
  }

  async function refreshSelectedPlayer() {
    if (!coinsState.selectedPlayer) return;
    try {
      const res = await apiFetch(`/admin/coins/players/${coinsState.selectedPlayer.id}`);
      if (res.data && res.data.player) {
        selectPlayerForCoins(res.data.player);
      }
    } catch (err) {
      console.warn('[REFRESH PLAYER WARN]', err.message);
    }
  }

  function openCoinAdjustModal(actionType) {
    if (!coinsState.selectedPlayer) {
      notify('Please select a player first.', 'warning');
      return;
    }

    coinsState.activeAction = actionType;
    const isCredit = actionType === 'ADMIN_CREDIT';
    const player = coinsState.selectedPlayer;

    const modalTitle = document.getElementById('coin-modal-title');
    const modalSubtitle = document.getElementById('coin-modal-subtitle');
    const modalUsername = document.getElementById('coin-modal-username');
    const modalCurrentBal = document.getElementById('coin-modal-current-balance');
    const labelAmount = document.getElementById('label-coin-amount');
    const calcActionLabel = document.getElementById('calc-action-label');
    const amountInput = document.getElementById('input-coin-amount');
    const reasonInput = document.getElementById('input-coin-reason');
    const errorBox = document.getElementById('coin-modal-error-box');
    const confirmBtn = document.getElementById('btn-confirm-coin-adjustment');

    if (modalTitle) modalTitle.textContent = isCredit ? 'Add Coins to Player' : 'Deduct Coins from Player';
    if (modalSubtitle) modalSubtitle.textContent = isCredit 
      ? 'Credit coins directly to player available wallet balance' 
      : 'Remove coins safely from player available balance (balance cannot go negative)';
    
    if (modalUsername) modalUsername.textContent = `@${player.username} (ID #${player.id})`;
    if (modalCurrentBal) modalCurrentBal.textContent = `${Number(player.available_balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Coins`;
    if (labelAmount) labelAmount.textContent = isCredit ? 'Amount of Coins to Add:' : 'Amount of Coins to Deduct:';
    if (calcActionLabel) calcActionLabel.textContent = isCredit ? 'Coins to Add:' : 'Coins to Deduct:';

    if (amountInput) amountInput.value = '';
    if (reasonInput) reasonInput.value = '';
    if (errorBox) errorBox.style.display = 'none';
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.className = isCredit ? 'btn btn-success btn-sm' : 'btn btn-danger btn-sm';
      confirmBtn.textContent = isCredit ? 'Confirm Coin Addition' : 'Confirm Coin Deduction';
    }

    updateCoinCalculation();
    openModal('modal-coin-adjust');
    if (amountInput) amountInput.focus();
  }

  function updateCoinCalculation() {
    const player = coinsState.selectedPlayer;
    if (!player) return;

    const isCredit = coinsState.activeAction === 'ADMIN_CREDIT';
    const currentBal = Number(player.available_balance) || 0;
    const amountInput = document.getElementById('input-coin-amount');
    const rawVal = amountInput ? parseFloat(amountInput.value) : 0;
    const adjustAmount = (!isNaN(rawVal) && rawVal > 0) ? rawVal : 0;

    let newBal = isCredit ? (currentBal + adjustAmount) : (currentBal - adjustAmount);
    newBal = Math.round(newBal * 100) / 100;

    const calcCurrent = document.getElementById('calc-current-bal');
    const calcAdjust = document.getElementById('calc-adjust-amount');
    const calcNew = document.getElementById('calc-new-balance');
    const errorBox = document.getElementById('coin-modal-error-box');
    const errorText = document.getElementById('coin-modal-error-text');
    const confirmBtn = document.getElementById('btn-confirm-coin-adjustment');

    if (calcCurrent) calcCurrent.textContent = `${currentBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Coins`;
    if (calcAdjust) {
      calcAdjust.textContent = `${isCredit ? '+' : '-'}${adjustAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Coins`;
      calcAdjust.className = `calc-val ${isCredit ? 'text-success' : 'text-danger'}`;
    }
    if (calcNew) {
      calcNew.textContent = `${newBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Coins`;
    }

    // Validation for deduction exceeding balance
    if (!isCredit && adjustAmount > currentBal) {
      if (errorBox && errorText) {
        errorText.textContent = `Insufficient balance: Player only has ${currentBal.toFixed(2)} coins. Cannot deduct ${adjustAmount.toFixed(2)} coins.`;
        errorBox.style.display = 'flex';
      }
      if (confirmBtn) confirmBtn.disabled = true;
    } else {
      if (errorBox) errorBox.style.display = 'none';
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  async function executeCoinAdjustment() {
    if (coinsState.isSubmitting) return;

    const player = coinsState.selectedPlayer;
    const actionType = coinsState.activeAction;
    if (!player || !actionType) {
      notify('Missing player or action selection.', 'error');
      return;
    }

    const amountInput = document.getElementById('input-coin-amount');
    const reasonInput = document.getElementById('input-coin-reason');
    const errorBox = document.getElementById('coin-modal-error-box');
    const errorText = document.getElementById('coin-modal-error-text');
    const confirmBtn = document.getElementById('btn-confirm-coin-adjustment');

    const amount = parseFloat(amountInput ? amountInput.value : 0);
    const reason = (reasonInput ? reasonInput.value : '').trim();

    if (isNaN(amount) || amount <= 0) {
      if (errorBox && errorText) {
        errorText.textContent = 'Please enter a valid positive coin amount greater than 0.';
        errorBox.style.display = 'flex';
      }
      notify('Please enter a valid coin amount.', 'warning');
      return;
    }

    if (!reason || reason.length < 3) {
      if (errorBox && errorText) {
        errorText.textContent = 'A clear reason or note (at least 3 characters) is required.';
        errorBox.style.display = 'flex';
      }
      notify('Please provide a reason for this balance adjustment.', 'warning');
      return;
    }

    if (actionType === 'ADMIN_DEBIT' && amount > Number(player.available_balance)) {
      if (errorBox && errorText) {
        errorText.textContent = `Cannot deduct ${amount.toFixed(2)} coins. Player only has ${Number(player.available_balance).toFixed(2)} coins available.`;
        errorBox.style.display = 'flex';
      }
      notify('Insufficient player balance for deduction.', 'error');
      return;
    }

    coinsState.isSubmitting = true;
    if (confirmBtn && window.SharedLayout?.setButtonLoading) {
      window.SharedLayout.setButtonLoading(confirmBtn, true, 'Processing...');
    } else if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Processing...';
    }

    const idempotencyKey = `coin-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await apiFetch('/admin/coins/adjust', {
        method: 'POST',
        body: {
          userId: player.id,
          actionType,
          amount,
          reason,
          idempotencyKey
        }
      });

      closeModal('modal-coin-adjust');
      notify(res.message || 'Balance adjusted successfully.', 'success');

      // Update selected player balance in memory and UI
      player.available_balance = res.data.balanceAfter;
      selectPlayerForCoins(player);

      // If this adjusted player is currently logged in the active browser tab, update client session
      if (window.ApiClient && typeof window.ApiClient.getUser === 'function') {
        const localUser = window.ApiClient.getUser();
        if (localUser && (localUser.id === player.id || localUser.username === player.username)) {
          if (localUser.wallet) localUser.wallet.available_balance = res.data.balanceAfter;
          localUser.available_balance = res.data.balanceAfter;
          window.ApiClient.setUser(localUser);
          if (typeof window.ApiClient.refreshBalance === 'function') {
            window.ApiClient.refreshBalance(true).catch(() => {});
          }
        }
      }

      // Refresh adjustment history
      await loadCoinHistory();

    } catch (err) {
      console.error('[COIN ADJUST ERROR]', err);
      if (errorBox && errorText) {
        errorText.textContent = err.message || 'Coin adjustment failed.';
        errorBox.style.display = 'flex';
      }
      notify(`Adjustment failed: ${err.message}`, 'error');
    } finally {
      coinsState.isSubmitting = false;
      if (confirmBtn && window.SharedLayout?.setButtonLoading) {
        window.SharedLayout.setButtonLoading(confirmBtn, false);
      } else if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = actionType === 'ADMIN_CREDIT' ? 'Confirm Coin Addition' : 'Confirm Coin Deduction';
      }
    }
  }

  async function loadCoinHistory() {
    const tableBody = document.getElementById('tbody-coin-history');
    if (!tableBody) return;

    const action = coinsState.actionFilter || 'ALL';
    const page = coinsState.historyPage || 1;
    const limit = coinsState.historyLimit || 15;

    let url = `/admin/coins/history?page=${page}&limit=${limit}`;
    if (action && action !== 'ALL') url += `&actionType=${encodeURIComponent(action)}`;
    if (coinsState.selectedPlayer) url += `&userId=${coinsState.selectedPlayer.id}`;

    try {
      const res = await apiFetch(url);
      const data = res.data || {};
      const history = data.history || [];
      const pagination = data.pagination || {};

      coinsState.history = history;
      coinsState.historyTotal = pagination.total || 0;
      coinsState.historyTotalPages = pagination.totalPages || 1;

      renderCoinHistory(history);
      updateCoinPagination(pagination);
    } catch (err) {
      console.error('[COIN HISTORY ERROR]', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center text-danger" style="padding: 24px;">
            Failed to load coin history: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  function renderCoinHistory(history) {
    const tableBody = document.getElementById('tbody-coin-history');
    if (!tableBody) return;

    if (!history || history.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center text-muted" style="padding: 24px;">
            No coin adjustment records found.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = history.map(h => {
      const isCredit = h.action_type === 'ADMIN_CREDIT';
      const badgeClass = isCredit ? 'badge-status won' : 'badge-status lost';
      const actionTitle = isCredit ? '+ CREDIT' : '- DEBIT';
      const amountClass = isCredit ? 'text-success font-bold' : 'text-danger font-bold';

      return `
        <tr>
          <td><code class="text-xs font-mono font-bold">${escapeHtml(h.transaction_uuid.substring(0, 16))}...</code></td>
          <td>
            <strong class="text-primary">@${escapeHtml(h.username)}</strong>
            <span class="text-2xs text-muted block">ID #${h.user_id}</span>
          </td>
          <td>
            <span class="${badgeClass}">${actionTitle}</span>
          </td>
          <td class="text-right ${amountClass}">
            ${isCredit ? '+' : '-'}${formatMoney(h.amount)}
          </td>
          <td class="text-right text-xs text-muted">${formatMoney(h.balance_before)}</td>
          <td class="text-right font-bold">${formatMoney(h.balance_after)}</td>
          <td class="text-xs" style="max-width: 220px; word-break: break-word;">
            ${escapeHtml(h.reason)}
          </td>
          <td class="text-xs">
            <strong>${escapeHtml(h.admin_username)}</strong>
          </td>
          <td class="text-xs text-muted" style="white-space: nowrap;">
            ${formatDateStr(h.created_at)}
          </td>
          <td>
            <span class="badge badge-success">completed</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  function updateCoinPagination(p) {
    const container = document.getElementById('coin-history-pagination');
    const info = document.getElementById('coin-pagination-info');
    const prevBtn = document.getElementById('btn-coin-prev-page');
    const nextBtn = document.getElementById('btn-coin-next-page');

    if (!container) return;
    if (p.totalPages <= 1 && p.total <= p.limit) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    if (info) info.textContent = `Page ${p.page} of ${p.totalPages} (${p.total} records)`;
    if (prevBtn) prevBtn.disabled = p.page <= 1;
    if (nextBtn) nextBtn.disabled = p.page >= p.totalPages;
  }

  // ===========================================================================
  // 8. EVENT LISTENERS SETUP
  // ===========================================================================
  function setupEventListeners() {
    // 1. Refresh stats
    const refreshStatsBtn = document.getElementById('btn-refresh-stats');
    if (refreshStatsBtn) {
      refreshStatsBtn.addEventListener('click', () => {
        loadOverviewStats();
        notify('Dashboard statistics refreshed.', 'info');
      });
    }

    // 2. User search & filters
    const searchInput = document.getElementById('user-search-input');
    let searchDebounce = null;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          usersState.search = e.target.value.trim();
          usersState.page = 1;
          loadUsers();
        }, 300);
      });
    }

    const roleFilter = document.getElementById('filter-user-role');
    if (roleFilter) {
      roleFilter.addEventListener('change', (e) => {
        usersState.role = e.target.value;
        usersState.page = 1;
        loadUsers();
      });
    }

    const statusFilter = document.getElementById('filter-user-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        usersState.status = e.target.value;
        usersState.page = 1;
        loadUsers();
      });
    }

    const refreshUsersBtn = document.getElementById('btn-refresh-users');
    if (refreshUsersBtn) {
      refreshUsersBtn.addEventListener('click', () => {
        loadUsers();
        notify('User directory refreshed.', 'info');
      });
    }

    // Create New User Modal Open
    const openCreateUserBtn = document.getElementById('btn-open-create-user');
    if (openCreateUserBtn) {
      openCreateUserBtn.addEventListener('click', () => {
        resetCreateUserForm();
        openModal('modal-create-user');
        setTimeout(() => {
          const fn = document.getElementById('input-create-displayname') || document.getElementById('input-create-fullname');
          if (fn) fn.focus();
        }, 100);
      });
    }

    // Create New User Form Submit
    const createUserForm = document.getElementById('form-create-user');
    if (createUserForm) {
      createUserForm.addEventListener('submit', handleCreateUserSubmit);
    }

    // Password visibility toggles inside Create User Modal
    const toggleCreatePasswordBtn = document.getElementById('btn-toggle-create-password');
    if (toggleCreatePasswordBtn) {
      toggleCreatePasswordBtn.addEventListener('click', () => {
        const pwdInput = document.getElementById('input-create-password');
        if (pwdInput) {
          const isPassword = pwdInput.type === 'password';
          pwdInput.type = isPassword ? 'text' : 'password';
          toggleCreatePasswordBtn.textContent = isPassword ? '🙈' : '👁️';
        }
      });
    }

    const toggleCreateConfirmBtn = document.getElementById('btn-toggle-create-confirm');
    if (toggleCreateConfirmBtn) {
      toggleCreateConfirmBtn.addEventListener('click', () => {
        const confirmInput = document.getElementById('input-create-confirm');
        if (confirmInput) {
          const isPassword = confirmInput.type === 'password';
          confirmInput.type = isPassword ? 'text' : 'password';
          toggleCreateConfirmBtn.textContent = isPassword ? '🙈' : '👁️';
        }
      });
    }

    // 3. User pagination
    const usersPrevBtn = document.getElementById('btn-users-prev');
    const usersNextBtn = document.getElementById('btn-users-next');
    if (usersPrevBtn) {
      usersPrevBtn.addEventListener('click', () => {
        if (usersState.page > 1) {
          usersState.page--;
          loadUsers();
        }
      });
    }
    if (usersNextBtn) {
      usersNextBtn.addEventListener('click', () => {
        if (usersState.page < usersState.totalPages) {
          usersState.page++;
          loadUsers();
        }
      });
    }

    // 4. Audit search & filter
    const auditSearch = document.getElementById('audit-search-input');
    let auditDebounce = null;
    if (auditSearch) {
      auditSearch.addEventListener('input', (e) => {
        clearTimeout(auditDebounce);
        auditDebounce = setTimeout(() => {
          auditsState.search = e.target.value.trim();
          auditsState.page = 1;
          loadAudits();
        }, 300);
      });
    }

    const auditFilter = document.getElementById('filter-audit-action');
    if (auditFilter) {
      auditFilter.addEventListener('change', (e) => {
        auditsState.actionType = e.target.value;
        auditsState.page = 1;
        loadAudits();
      });
    }

    const refreshAuditsBtn = document.getElementById('btn-refresh-audits');
    if (refreshAuditsBtn) {
      refreshAuditsBtn.addEventListener('click', () => {
        loadAudits();
        notify('Audit logs refreshed.', 'info');
      });
    }

    const auditsPrevBtn = document.getElementById('btn-audits-prev');
    const auditsNextBtn = document.getElementById('btn-audits-next');
    if (auditsPrevBtn) {
      auditsPrevBtn.addEventListener('click', () => {
        if (auditsState.page > 1) {
          auditsState.page--;
          loadAudits();
        }
      });
    }
    if (auditsNextBtn) {
      auditsNextBtn.addEventListener('click', () => {
        if (auditsState.page < auditsState.totalPages) {
          auditsState.page++;
          loadAudits();
        }
      });
    }

    // 5. System run diagnostics
    const runDiagBtn = document.getElementById('btn-run-diag');
    if (runDiagBtn) {
      runDiagBtn.addEventListener('click', () => {
        loadSystemHealth();
      });
    }

    // 6. Modal close buttons
    document.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-modal-overlay.open').forEach((m) => {
          m.classList.remove('open');
          m.setAttribute('aria-hidden', 'true');
        });
        document.body.style.overflow = '';
        deleteUserTarget = null;
      });
    });

    // 7. Status & Role confirm buttons
    const confirmStatusBtn = document.getElementById('btn-confirm-status-change');
    if (confirmStatusBtn) {
      confirmStatusBtn.addEventListener('click', handleConfirmStatusChange);
    }

    const confirmRoleBtn = document.getElementById('btn-confirm-role-change');
    if (confirmRoleBtn) {
      confirmRoleBtn.addEventListener('click', handleConfirmRoleChange);
    }

    // Delete User Confirmation input listener & action button
    const deleteUserConfirmInput = document.getElementById('delete-user-confirm-input');
    if (deleteUserConfirmInput) {
      deleteUserConfirmInput.addEventListener('input', handleDeleteUserConfirmInput);
      deleteUserConfirmInput.addEventListener('keyup', (e) => {
        handleDeleteUserConfirmInput();
        if (e.key === 'Enter') {
          const btn = document.getElementById('btn-confirm-delete-user');
          if (btn && !btn.disabled) handleConfirmDeleteUser();
        }
      });
    }

    const confirmDeleteUserBtn = document.getElementById('btn-confirm-delete-user');
    if (confirmDeleteUserBtn) {
      confirmDeleteUserBtn.addEventListener('click', handleConfirmDeleteUser);
    }

    // 8. Match Monitoring & Creation event listeners
    const openCreateMatchBtn = document.getElementById('btn-open-create-match');
    if (openCreateMatchBtn) {
      openCreateMatchBtn.addEventListener('click', () => {
        resetCreateMatchForm();
        openModal('modal-create-match');
        setTimeout(() => {
          const compInput = document.getElementById('match-input-competition');
          if (compInput) compInput.focus();
        }, 100);
      });
    }

    const createMatchForm = document.getElementById('form-create-match');
    if (createMatchForm) {
      createMatchForm.addEventListener('submit', handleCreateMatchSubmit);
    }

    const refreshMatchesBtn = document.getElementById('btn-refresh-matches');
    if (refreshMatchesBtn) {
      refreshMatchesBtn.addEventListener('click', () => {
        loadMatches();
        notify('Matches and bets refreshed.', 'info');
      });
    }

    const matchesSearch = document.getElementById('matches-search-input');
    let matchDebounce = null;
    if (matchesSearch) {
      matchesSearch.addEventListener('input', (e) => {
        clearTimeout(matchDebounce);
        matchDebounce = setTimeout(() => {
          matchesState.search = e.target.value.trim();
          loadMatches();
        }, 300);
      });
    }

    const matchesStatusSelect = document.getElementById('matches-status-select');
    if (matchesStatusSelect) {
      matchesStatusSelect.addEventListener('change', (e) => {
        matchesState.status = e.target.value;
        loadMatches();
      });
    }

    const matchesHasBetsSelect = document.getElementById('matches-has-bets-select');
    if (matchesHasBetsSelect) {
      matchesHasBetsSelect.addEventListener('change', (e) => {
        matchesState.hasBets = e.target.value;
        loadMatches();
      });
    }

    const matchesSettlementSelect = document.getElementById('matches-settlement-select');
    if (matchesSettlementSelect) {
      matchesSettlementSelect.addEventListener('change', (e) => {
        matchesState.settlement = e.target.value;
        loadMatches();
      });
    }

    // Match bets modal filters
    const matchBetsSearch = document.getElementById('match-bets-search-input');
    if (matchBetsSearch) {
      matchBetsSearch.addEventListener('input', () => {
        filterAndRenderModalBets();
      });
    }

    const matchBetsStatusSelect = document.getElementById('match-bets-status-select');
    if (matchBetsStatusSelect) {
      matchBetsStatusSelect.addEventListener('change', () => {
        filterAndRenderModalBets();
      });
    }

    const matchBetsSettlementSelect = document.getElementById('match-bets-settlement-select');
    if (matchBetsSettlementSelect) {
      matchBetsSettlementSelect.addEventListener('change', () => {
        filterAndRenderModalBets();
      });
    }

    // 9. Bet Settlement event listeners
    const refreshSettlementBtn = document.getElementById('btn-refresh-settlement');
    if (refreshSettlementBtn) {
      refreshSettlementBtn.addEventListener('click', () => {
        loadEligibleMatches();
        loadSettlementHistory();
        notify('Eligible settlement matches refreshed.', 'info');
      });
    }

    const closeWorkspaceBtn = document.getElementById('btn-close-workspace');
    if (closeWorkspaceBtn) {
      closeWorkspaceBtn.addEventListener('click', () => {
        const workspace = document.getElementById('settlement-workspace');
        if (workspace) workspace.style.display = 'none';
        document.querySelectorAll('.eligible-match-card').forEach((c) => c.classList.remove('selected'));
        settlementState.selectedMatch = null;
        settlementState.selectedOutcome = null;
      });
    }

    const openPreviewBtn = document.getElementById('btn-open-settlement-preview');
    if (openPreviewBtn) {
      openPreviewBtn.addEventListener('click', () => {
        openSettlementPreview();
      });
    }

    const confirmSettlementCheckbox = document.getElementById('checkbox-confirm-settlement');
    const executeSettlementBtn = document.getElementById('btn-confirm-execute-settlement');
    if (confirmSettlementCheckbox && executeSettlementBtn) {
      confirmSettlementCheckbox.addEventListener('change', (e) => {
        executeSettlementBtn.disabled = !e.target.checked;
      });
    }

    if (executeSettlementBtn) {
      executeSettlementBtn.addEventListener('click', () => {
        executeSettlement();
      });
    }

    // 10. Player Coin Management Listeners
    const searchCoinBtn = document.getElementById('btn-search-player-coin');
    const searchCoinInput = document.getElementById('input-coin-search-username');
    const clearCoinSearchBtn = document.getElementById('btn-clear-player-search');

    if (searchCoinBtn && searchCoinInput) {
      searchCoinBtn.addEventListener('click', () => {
        searchPlayerForCoins(searchCoinInput.value);
      });
      searchCoinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchPlayerForCoins(searchCoinInput.value);
        }
      });
    }

    if (clearCoinSearchBtn) {
      clearCoinSearchBtn.addEventListener('click', () => {
        if (searchCoinInput) searchCoinInput.value = '';
        const feedbackEl = document.getElementById('coin-search-feedback');
        const resultsBox = document.getElementById('coin-search-results-box');
        if (feedbackEl) feedbackEl.style.display = 'none';
        if (resultsBox) resultsBox.style.display = 'none';
        clearCoinSearchBtn.style.display = 'none';
      });
    }

    // Delegated click for coin match items
    const matchesList = document.getElementById('coin-matches-list');
    if (matchesList) {
      matchesList.addEventListener('click', (e) => {
        const item = e.target.closest('.coin-match-item');
        if (item) {
          const playerId = parseInt(item.dataset.playerId, 10);
          const player = coinsState.matchedPlayers.find(p => p.id === playerId);
          if (player) selectPlayerForCoins(player);
        }
      });
    }

    // Coin Action Buttons
    const addCoinsBtn = document.getElementById('btn-action-add-coins');
    const deductCoinsBtn = document.getElementById('btn-action-deduct-coins');

    if (addCoinsBtn) {
      addCoinsBtn.addEventListener('click', () => {
        openCoinAdjustModal('ADMIN_CREDIT');
      });
    }

    if (deductCoinsBtn) {
      deductCoinsBtn.addEventListener('click', () => {
        openCoinAdjustModal('ADMIN_DEBIT');
      });
    }

    // Live Calculation in Coin Adjustment Modal
    const coinAmountInput = document.getElementById('input-coin-amount');
    if (coinAmountInput) {
      coinAmountInput.addEventListener('input', updateCoinCalculation);
      coinAmountInput.addEventListener('change', updateCoinCalculation);
    }

    // Preset Chips (+100, +500, +1000, +5000)
    const presetContainer = document.getElementById('coin-presets-container');
    if (presetContainer) {
      presetContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.preset-chip');
        if (chip && coinAmountInput) {
          const val = parseFloat(chip.dataset.amount || 0);
          const currentVal = parseFloat(coinAmountInput.value) || 0;
          coinAmountInput.value = (currentVal + val).toString();
          updateCoinCalculation();
        }
      });
    }

    // Confirm Coin Adjustment
    const confirmCoinAdjustBtn = document.getElementById('btn-confirm-coin-adjustment');
    if (confirmCoinAdjustBtn) {
      confirmCoinAdjustBtn.addEventListener('click', () => {
        executeCoinAdjustment();
      });
    }

    // Filter Coin History by Action
    const filterCoinAction = document.getElementById('filter-coin-action');
    if (filterCoinAction) {
      filterCoinAction.addEventListener('change', (e) => {
        coinsState.actionFilter = e.target.value;
        coinsState.historyPage = 1;
        loadCoinHistory();
      });
    }

    // Refresh Coins
    const refreshCoinsBtn = document.getElementById('btn-refresh-coins');
    if (refreshCoinsBtn) {
      refreshCoinsBtn.addEventListener('click', () => {
        loadCoinsManagement();
        notify('Coin management ledger refreshed.', 'info');
      });
    }

    // History Pagination
    const prevCoinBtn = document.getElementById('btn-coin-prev-page');
    const nextCoinBtn = document.getElementById('btn-coin-next-page');
    if (prevCoinBtn) {
      prevCoinBtn.addEventListener('click', () => {
        if (coinsState.historyPage > 1) {
          coinsState.historyPage--;
          loadCoinHistory();
        }
      });
    }
    if (nextCoinBtn) {
      nextCoinBtn.addEventListener('click', () => {
        if (coinsState.historyPage < coinsState.historyTotalPages) {
          coinsState.historyPage++;
          loadCoinHistory();
        }
      });
    }

    // 11. Admin Sign Out
    const logoutBtn = document.getElementById('btn-admin-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await apiFetch('/auth/logout', { method: 'POST' });
        } catch (e) {
          console.warn('[LOGOUT NOTE]', e.message);
        }
        localStorage.removeItem('itb_auth_token');
        sessionStorage.removeItem('itb_auth_token');
        notify('Signed out successfully.', 'info');
        setTimeout(() => {
          window.location.href = '../pages/login.html';
        }, 300);
      });
    }
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================
  async function init() {
    setupTabs();
    setupEventListeners();

    const isAuthed = await verifyAdminAuth();
    if (isAuthed) {
      loadOverviewStats();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
