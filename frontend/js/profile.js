/**
 * IRONMAN TOSS BOOK - Profile & Account Settings Controller (Day 6)
 * Handles client-side user profile information, edit profile validation,
 * change password dialog, notification toggles, dark mode switch, and modals.
 */

(function () {
  'use strict';

  // SVGs for Icons
  const ICONS = {
    eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`
  };

  /**
   * Default Demonstration User Profile Data
   * Clearly identified fictional demonstration account.
   */
  const DEFAULT_PROFILE = {
    fullName: 'Rahul Sharma',
    username: 'ironman_99',
    userId: 'UID-2026-8842',
    email: 'rahul.sharma@example.com',
    phone: '+91 98765 43210',
    joinedDate: '15 Aug 2026',
    accountStatus: 'Verified Demo Account',
    kycTier: 'KYC Tier 1 (Demo)'
  };

  /**
   * Default Notification Preferences
   */
  const DEFAULT_NOTIFICATIONS = {
    tossAlerts: true,
    matchReminders: true,
    walletNotices: true,
    promoUpdates: false
  };

  // State
  let currentProfile = { ...DEFAULT_PROFILE };
  let currentNotifications = { ...DEFAULT_NOTIFICATIONS };
  let lastFocusedElement = null;

  /**
   * Load stored profile and notification preferences
   */
  function loadPersistedState() {
    try {
      const savedProfile = localStorage.getItem('itb_demo_profile');
      if (savedProfile) {
        currentProfile = Object.assign({}, DEFAULT_PROFILE, JSON.parse(savedProfile));
      }

      const savedPrefs = localStorage.getItem('itb_notification_prefs');
      if (savedPrefs) {
        currentNotifications = Object.assign({}, DEFAULT_NOTIFICATIONS, JSON.parse(savedPrefs));
      }
    } catch (e) {
      console.warn('Could not read demo profile state from localStorage:', e);
    }
  }

  /**
   * Save profile state to localStorage
   */
  function saveProfileState() {
    try {
      localStorage.setItem('itb_demo_profile', JSON.stringify(currentProfile));
    } catch (e) {
      console.warn('Could not save demo profile state to localStorage:', e);
    }
  }

  /**
   * Save notification preferences
   */
  function saveNotificationPrefs() {
    try {
      localStorage.setItem('itb_notification_prefs', JSON.stringify(currentNotifications));
    } catch (e) {
      console.warn('Could not save notification preferences to localStorage:', e);
    }
  }

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
   * Toast notification helper
   */
  function showToast(message, isSuccess = true) {
    let toast = document.getElementById('profile-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'profile-toast';
      toast.className = 'profile-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }

    toast.className = `profile-toast ${isSuccess ? 'profile-toast-success' : ''}`;
    toast.innerHTML = `${ICONS.check} <span>${escapeHtml(message)}</span>`;
    toast.classList.add('show');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  /**
   * Derive user initials from full name
   */
  function getInitials(name) {
    if (!name || typeof name !== 'string') return 'IT';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'IT';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * Profile field validator helper
   */
  function validateProfileFields(name, username, phone) {
    const errors = {};
    const trimmedName = (name || '').trim();
    const trimmedUsername = (username || '').trim();
    const trimmedPhone = (phone || '').trim();

    if (!trimmedName || trimmedName.length < 2) {
      errors.name = 'Please enter a valid full name (at least 2 characters).';
    }

    if (!trimmedUsername || !/^[a-zA-Z0-9_]{3,20}$/.test(trimmedUsername)) {
      errors.username = 'Username must be 3-20 characters (alphanumeric and underscores).';
    }

    const cleanPhone = trimmedPhone.replace(/[\s-]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      errors.phone = 'Please enter a valid phone number (at least 10 digits).';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Password validator helper
   */
  function validatePasswordFields(currVal, newVal, confVal) {
    const errors = {};

    if (!currVal) {
      errors.current = 'Please enter your current password.';
    }

    if (!newVal || newVal.length < 8) {
      errors.newPassword = 'New password must be at least 8 characters.';
    } else if (currVal && newVal && currVal === newVal) {
      errors.newPassword = 'New password cannot be the same as your current password.';
    }

    if (newVal !== confVal) {
      errors.confirmPassword = 'New password and confirmation do not match.';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Render profile data onto DOM elements
   */
  function renderProfileUI() {
    // Hero Card
    const heroName = document.getElementById('hero-profile-name');
    const heroHandle = document.getElementById('hero-profile-handle');
    const heroId = document.getElementById('hero-profile-id');
    const heroStatus = document.getElementById('hero-profile-status');
    const heroInitials = document.getElementById('hero-avatar-initials');

    if (heroName) heroName.textContent = currentProfile.fullName;
    if (heroHandle) heroHandle.textContent = `@${currentProfile.username}`;
    if (heroId) heroId.textContent = currentProfile.userId;
    if (heroStatus) heroStatus.textContent = currentProfile.accountStatus;
    if (heroInitials) heroInitials.textContent = getInitials(currentProfile.fullName);

    // Personal Information Section
    const infoFullName = document.getElementById('info-fullname');
    const infoUsername = document.getElementById('info-username');
    const infoEmail = document.getElementById('info-email');
    const infoPhone = document.getElementById('info-phone');
    const infoJoined = document.getElementById('info-joined');
    const infoKyc = document.getElementById('info-kyc');

    if (infoFullName) infoFullName.textContent = currentProfile.fullName || 'Not provided';
    if (infoUsername) infoUsername.textContent = currentProfile.username ? `@${currentProfile.username}` : 'Not provided';
    if (infoEmail) infoEmail.textContent = currentProfile.email || 'Not provided';
    if (infoPhone) infoPhone.textContent = currentProfile.phone || 'Not provided';
    if (infoJoined) infoJoined.textContent = currentProfile.joinedDate || 'Not provided';
    if (infoKyc) infoKyc.textContent = currentProfile.kycTier || 'Tier 1 (Demo)';
  }

  /**
   * Modal Management Functions
   */
  function openModal(modal, triggerBtn) {
    if (!modal) return;
    lastFocusedElement = triggerBtn || document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus first focusable interactive element in modal
    const focusable = modal.querySelector('input:not([disabled]), button:not([disabled])');
    if (focusable) {
      focusable.focus();
    }
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  /**
   * Setup Edit Profile Modal and Validation
   */
  function setupEditProfile() {
    const editBtn = document.getElementById('edit-profile-btn');
    const editMenuBtn = document.getElementById('menu-edit-profile-btn');
    const modal = document.getElementById('edit-profile-modal');
    const form = document.getElementById('edit-profile-form');

    const nameInput = document.getElementById('edit-name-input');
    const usernameInput = document.getElementById('edit-username-input');
    const phoneInput = document.getElementById('edit-phone-input');
    const emailInput = document.getElementById('edit-email-input');

    const nameError = document.getElementById('edit-name-error');
    const usernameError = document.getElementById('edit-username-error');
    const phoneError = document.getElementById('edit-phone-error');

    function populateForm() {
      if (nameInput) nameInput.value = currentProfile.fullName;
      if (usernameInput) usernameInput.value = currentProfile.username;
      if (phoneInput) phoneInput.value = currentProfile.phone;
      if (emailInput) emailInput.value = currentProfile.email;

      clearErrors();
    }

    function clearErrors() {
      if (nameError) nameError.classList.remove('visible');
      if (usernameError) usernameError.classList.remove('visible');
      if (phoneError) phoneError.classList.remove('visible');
    }

    // Real-time input clearing
    if (nameInput && nameError) {
      nameInput.addEventListener('input', () => nameError.classList.remove('visible'));
    }
    if (usernameInput && usernameError) {
      usernameInput.addEventListener('input', () => usernameError.classList.remove('visible'));
    }
    if (phoneInput && phoneError) {
      phoneInput.addEventListener('input', () => phoneError.classList.remove('visible'));
    }

    if (editBtn && modal) {
      editBtn.addEventListener('click', () => {
        populateForm();
        openModal(modal, editBtn);
      });
    }

    if (editMenuBtn && modal) {
      editMenuBtn.addEventListener('click', (e) => {
        e.preventDefault();
        populateForm();
        openModal(modal, editMenuBtn);
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        clearErrors();

        const newName = nameInput ? nameInput.value.trim() : '';
        const newUsername = usernameInput ? usernameInput.value.trim() : '';
        const newPhone = phoneInput ? phoneInput.value.trim() : '';

        const validation = validateProfileFields(newName, newUsername, newPhone);

        if (!validation.isValid) {
          if (validation.errors.name && nameError) {
            nameError.textContent = validation.errors.name;
            nameError.classList.add('visible');
          }
          if (validation.errors.username && usernameError) {
            usernameError.textContent = validation.errors.username;
            usernameError.classList.add('visible');
          }
          if (validation.errors.phone && phoneError) {
            phoneError.textContent = validation.errors.phone;
            phoneError.classList.add('visible');
          }
          return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const origText = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';
        }

        setTimeout(() => {
          // Apply changes to in-memory state
          currentProfile.fullName = newName;
          currentProfile.username = newUsername;
          currentProfile.phone = newPhone;

          saveProfileState();
          renderProfileUI();

          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
          }

          closeModal(modal);
          showToast('Profile updated successfully (local development state)');
        }, 200);
      });
    }
  }

  /**
   * Setup Change Password Modal
   */
  function setupChangePassword() {
    const trigger = document.getElementById('menu-change-password-btn');
    const modal = document.getElementById('change-password-modal');
    const form = document.getElementById('change-password-form');

    const currInput = document.getElementById('curr-password-input');
    const newInput = document.getElementById('new-password-input');
    const confInput = document.getElementById('conf-password-input');

    const currError = document.getElementById('curr-password-error');
    const newError = document.getElementById('new-password-error');
    const confError = document.getElementById('conf-password-error');

    function clearForm() {
      if (currInput) currInput.value = '';
      if (newInput) newInput.value = '';
      if (confInput) confInput.value = '';
      if (currError) currError.classList.remove('visible');
      if (newError) newError.classList.remove('visible');
      if (confError) confError.classList.remove('visible');
    }

    // Real-time input error clearing
    if (currInput && currError) {
      currInput.addEventListener('input', () => currError.classList.remove('visible'));
    }
    if (newInput && newError) {
      newInput.addEventListener('input', () => newError.classList.remove('visible'));
    }
    if (confInput && confError) {
      confInput.addEventListener('input', () => confError.classList.remove('visible'));
    }

    if (trigger && modal) {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        clearForm();
        openModal(modal, trigger);
      });
    }

    // Password visibility eye toggles
    const eyeBtns = modal ? modal.querySelectorAll('.password-toggle-eye') : [];
    eyeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const targetInput = document.getElementById(targetId);
        if (!targetInput) return;

        const isPassword = targetInput.type === 'password';
        targetInput.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword ? ICONS.eyeOff : ICONS.eye;
        btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      });
    });

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (currError) currError.classList.remove('visible');
        if (newError) newError.classList.remove('visible');
        if (confError) confError.classList.remove('visible');

        const currVal = currInput ? currInput.value : '';
        const newVal = newInput ? newInput.value : '';
        const confVal = confInput ? confInput.value : '';

        const validation = validatePasswordFields(currVal, newVal, confVal);

        if (!validation.isValid) {
          if (validation.errors.current && currError) {
            currError.textContent = validation.errors.current;
            currError.classList.add('visible');
          }
          if (validation.errors.newPassword && newError) {
            newError.textContent = validation.errors.newPassword;
            newError.classList.add('visible');
          }
          if (validation.errors.confirmPassword && confError) {
            confError.textContent = validation.errors.confirmPassword;
            confError.classList.add('visible');
          }
          return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const origText = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Updating...';
        }

        setTimeout(() => {
          clearForm();
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
          }
          closeModal(modal);
          showToast('Password updated successfully (local development state)');
        }, 200);
      });
    }
  }

  /**
   * Setup Notification Preferences Modal
   */
  function setupNotificationPreferences() {
    const trigger = document.getElementById('menu-notifications-btn');
    const modal = document.getElementById('notifications-modal');

    const tossAlertsSwitch = document.getElementById('pref-toss-alerts');
    const matchRemindersSwitch = document.getElementById('pref-match-reminders');
    const walletNoticesSwitch = document.getElementById('pref-wallet-notices');
    const promoUpdatesSwitch = document.getElementById('pref-promo-updates');

    function syncSwitches() {
      if (tossAlertsSwitch) tossAlertsSwitch.checked = currentNotifications.tossAlerts;
      if (matchRemindersSwitch) matchRemindersSwitch.checked = currentNotifications.matchReminders;
      if (walletNoticesSwitch) walletNoticesSwitch.checked = currentNotifications.walletNotices;
      if (promoUpdatesSwitch) promoUpdatesSwitch.checked = currentNotifications.promoUpdates;
    }

    if (trigger && modal) {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        syncSwitches();
        openModal(modal, trigger);
      });
    }

    [
      { el: tossAlertsSwitch, key: 'tossAlerts' },
      { el: matchRemindersSwitch, key: 'matchReminders' },
      { el: walletNoticesSwitch, key: 'walletNotices' },
      { el: promoUpdatesSwitch, key: 'promoUpdates' }
    ].forEach(({ el, key }) => {
      if (el) {
        el.addEventListener('change', () => {
          currentNotifications[key] = el.checked;
          saveNotificationPrefs();
          showToast(`Preference updated: ${el.checked ? 'Enabled' : 'Disabled'}`);
        });
      }
    });
  }

  /**
   * Setup Dark Mode Switch in Settings List
   */
  function setupDarkModeSwitch() {
    const switchInput = document.getElementById('dark-mode-switch-input');
    if (!switchInput) return;

    // Initialize state from document data-theme
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    switchInput.checked = currentTheme === 'dark';

    switchInput.addEventListener('change', () => {
      const nextTheme = switchInput.checked ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('itb_theme', nextTheme);

      // Synchronize button in app.js if present
      const themeBtn = document.getElementById('theme-toggle-btn');
      if (themeBtn) {
        themeBtn.textContent = nextTheme === 'dark' ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode';
      }

      showToast(`Switched to ${nextTheme === 'dark' ? 'Dark' : 'Light'} Mode`);
    });
  }

  /**
   * Setup Informational Modals (App Rules, Privacy, Support, Logout)
   */
  function setupInformationalModals() {
    const rulesTrigger = document.getElementById('menu-rules-btn');
    const rulesModal = document.getElementById('app-rules-modal');

    const privacyTrigger = document.getElementById('menu-privacy-btn');
    const privacyModal = document.getElementById('privacy-modal');

    const supportTrigger = document.getElementById('menu-support-btn');
    const supportModal = document.getElementById('support-modal');

    const logoutTrigger = document.getElementById('menu-logout-btn');
    const logoutModal = document.getElementById('logout-modal');
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');

    if (rulesTrigger && rulesModal) {
      rulesTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(rulesModal, rulesTrigger);
      });
    }

    if (privacyTrigger && privacyModal) {
      privacyTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(privacyModal, privacyTrigger);
      });
    }

    if (supportTrigger && supportModal) {
      supportTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(supportModal, supportTrigger);
      });
    }

    if (logoutTrigger && logoutModal) {
      logoutTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(logoutModal, logoutTrigger);
      });
    }

    // Confirm Logout action
    if (confirmLogoutBtn) {
      confirmLogoutBtn.addEventListener('click', () => {
        closeModal(logoutModal);
        try {
          localStorage.removeItem('itb_auth_token');
          localStorage.removeItem('itb_user_session');
          sessionStorage.clear();
        } catch (e) {
          console.warn('Session clearance error:', e);
        }
        showToast('Signed out of session. Redirecting to Login...', true);
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 800);
      });
    }
  }

  /**
   * Setup Global Modal Dismissals (Click backdrop, data-modal-close, Escape key)
   */
  function setupGlobalModalListeners() {
    const allModals = document.querySelectorAll('.profile-modal-overlay');

    allModals.forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-modal-close]')) {
          closeModal(modal);
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        allModals.forEach(modal => {
          if (modal.classList.contains('open')) {
            closeModal(modal);
          }
        });
      }
    });
  }

  /**
   * Main Initialization
   */
  function initProfilePage() {
    loadPersistedState();
    renderProfileUI();

    setupEditProfile();
    setupChangePassword();
    setupNotificationPreferences();
    setupDarkModeSwitch();
    setupInformationalModals();
    setupGlobalModalListeners();
  }

  // Bind to DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfilePage);
  } else {
    initProfilePage();
  }

  // Export controller for automated testing
  window.ProfileController = {
    init: initProfilePage,
    getProfile: () => currentProfile,
    getNotifications: () => currentNotifications,
    setProfile: (data) => {
      currentProfile = { ...currentProfile, ...data };
      saveProfileState();
      renderProfileUI();
    },
    getInitials: getInitials,
    validateProfileFields: validateProfileFields,
    validatePasswordFields: validatePasswordFields,
    logout: () => {
      try {
        localStorage.removeItem('itb_auth_token');
        localStorage.removeItem('itb_user_session');
        sessionStorage.clear();
      } catch (e) {
        console.warn('Session clearance warning:', e);
      }
      return true;
    }
  };
})();
