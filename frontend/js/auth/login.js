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

      // Simulate boundary contact with honest development report (No fake session)
      setTimeout(() => {
        submitBtn.classList.remove('is-submitting');
        submitBtn.disabled = false;

        if (devAlert) {
          devAlert.innerHTML = `
            <strong>Client-Side Validation Passed:</strong><br>
            Backend authentication endpoint (<code>POST /api/auth/login</code>) is scheduled for implementation on <strong>Day 11</strong>.<br>
            <small class="text-muted">No fake sessions or tokens have been stored in browser storage.</small>
          `;
          devAlert.classList.add('visible');
          devAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 600);
    });
  });
})();
