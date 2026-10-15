/**
 * IRONMAN TOSS BOOK - Login Form Controller (Day 3)
 * Handles client-side validation, password toggle, accessible feedback, and honest API boundary notice.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('login-form');
    if (!form) return;

    const identifierInput = document.getElementById('login-identifier');
    const identifierError = document.getElementById('identifier-error');

    const passwordInput = document.getElementById('login-password');
    const passwordError = document.getElementById('password-error');
    const toggleBtn = document.getElementById('password-toggle-btn');

    const submitBtn = document.getElementById('login-submit-btn');
    const devAlert = document.getElementById('login-dev-alert');
    const errorAlert = document.getElementById('login-error-alert');

    const { validateEmail, validateUsername, setFieldError, clearFieldError, setupPasswordToggle } = window.AuthValidation;

    // 1. Setup Password Visibility Toggle
    if (toggleBtn && passwordInput) {
      setupPasswordToggle(toggleBtn, passwordInput);
    }

    // 2. Real-time Clear on input
    if (identifierInput) {
      identifierInput.addEventListener('input', () => {
        clearFieldError(identifierInput, identifierError);
        hideAlerts();
      });
    }

    if (passwordInput) {
      passwordInput.addEventListener('input', () => {
        clearFieldError(passwordInput, passwordError);
        hideAlerts();
      });
    }

    function hideAlerts() {
      if (devAlert) devAlert.classList.remove('visible');
      if (errorAlert) errorAlert.classList.remove('visible');
    }

    // 3. Form Submission Validation
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideAlerts();

      let isValid = true;
      const identifierVal = identifierInput ? identifierInput.value.trim() : '';
      const passwordVal = passwordInput ? passwordInput.value : '';

      // Validate Identifier (Email or Username)
      if (!identifierVal) {
        setFieldError(identifierInput, identifierError, 'Please enter your email address or username.');
        isValid = false;
      } else {
        const isEmail = identifierVal.includes('@');
        if (isEmail && !validateEmail(identifierVal)) {
          setFieldError(identifierInput, identifierError, 'Please enter a valid email address (e.g., user@example.com).');
          isValid = false;
        } else if (!isEmail && !validateUsername(identifierVal)) {
          setFieldError(identifierInput, identifierError, 'Username must be 3–20 characters, starting with a letter.');
          isValid = false;
        } else {
          clearFieldError(identifierInput, identifierError);
        }
      }

      // Validate Password
      if (!passwordVal) {
        setFieldError(passwordInput, passwordError, 'Please enter your password.');
        isValid = false;
      } else if (passwordVal.length < 1) {
        setFieldError(passwordInput, passwordError, 'Password cannot be empty.');
        isValid = false;
      } else {
        clearFieldError(passwordInput, passwordError);
      }

      if (!isValid) {
        // Focus first invalid element for keyboard accessibility
        const firstInvalid = form.querySelector('.is-invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      // Submitting State
      submitBtn.classList.add('is-submitting');
      submitBtn.disabled = true;

      // Real backend authentication request via ApiClient
      const rememberCheckbox = document.getElementById('login-remember');
      const persistSession = rememberCheckbox ? rememberCheckbox.checked : true;

      const apiClient = window.ApiClient;
      const apiPromise = apiClient
        ? apiClient.post('/auth/login', { identifier: identifierVal, password: passwordVal })
        : fetch(`${(window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || 'http://localhost:5000/api'}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: identifierVal, password: passwordVal })
          }).then(r => r.json().then(d => r.ok ? d : Promise.reject(d)));

      apiPromise
        .then((res) => {
          submitBtn.classList.remove('is-submitting');
          submitBtn.disabled = false;

          const token = res.token || (res.data && res.data.token);
          const user = res.user || (res.data && res.data.user);

          if (token) {
            if (window.ApiClient) {
              window.ApiClient.setToken(token, persistSession);
              window.ApiClient.setUser(user);
            } else {
              localStorage.setItem('itb_auth_token', token);
              if (user) localStorage.setItem('itb_auth_user', JSON.stringify(user));
            }
          }

          if (devAlert) {
            devAlert.innerHTML = `
              <strong>Signed In Successfully:</strong><br>
              Welcome back, <strong>${user ? (user.username || user.fullName || 'Player') : 'User'}</strong>!<br>
              <small class="text-muted">Redirecting to your dashboard...</small>
            `;
            devAlert.classList.add('visible');
          }

          setTimeout(() => {
            if (user && (user.role === 'admin' || user.role === 'super_admin')) {
              window.location.href = '../pages/admin.html';
            } else {
              window.location.href = '../index.html';
            }
          }, 600);
        })
        .catch((err) => {
          submitBtn.classList.remove('is-submitting');
          submitBtn.disabled = false;

          const errorMsg = (err.error && err.error.message) || err.message || 'Invalid credentials or server unavailable. Please try again.';

          if (errorAlert) {
            errorAlert.innerHTML = `
              <strong>Sign In Failed:</strong><br>
              ${errorMsg}
            `;
            errorAlert.classList.add('visible');
            errorAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else if (devAlert) {
            devAlert.innerHTML = `<strong>Error:</strong> ${errorMsg}`;
            devAlert.classList.add('visible');
          }
        });
    });
  });
})();
