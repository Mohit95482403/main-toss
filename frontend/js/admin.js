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
    if (window.ApiClient && typeof window.ApiClient.request === 'function') {
      return window.ApiClient.request(endpoint, options);
    }
    const token = getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

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
  // 9. EVENT LISTENERS SETUP
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

    // 8. Admin Sign Out
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
