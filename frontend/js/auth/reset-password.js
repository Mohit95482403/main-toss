/**
 * DADDY TOSS BOOK - Reset Password Controller (Day 3)
 * Handles reset token detection, new password validation, strength feedback, and submission.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('reset-form');
    if (!form) return;

    const passwordInput = document.getElementById('reset-password');
    const passwordError = document.getElementById('password-error');
    const passwordToggleBtn = document.getElementById('password-toggle-btn');

    const confirmInput = document.getElementById('reset-confirm');
    const confirmError = document.getElementById('confirm-error');
    const confirmToggleBtn = document.getElementById('confirm-toggle-btn');

    const submitBtn = document.getElementById('reset-submit-btn');
    const devAlert = document.getElementById('reset-dev-alert');
    const tokenNotice = document.getElementById('token-status-notice');

    const strengthSegments = form.querySelectorAll('.strength-bar-segment');
    const strengthLabel = document.getElementById('strength-label');

    const {
      validatePassword,
      setFieldError,
      clearFieldError,
      setupPasswordToggle,
      setupPasswordStrengthMeter
    } = window.AuthValidation;

    // 1. Detect Token from URL query
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token && tokenNotice) {
      tokenNotice.innerHTML = `
        <strong>Development Notice:</strong> No reset token detected in URL query (e.g., <code>?token=xyz123</code>). 
        In production, a time-limited single-use cryptographic token is provided in the reset email. 
        You can test the form validation interface below.
      `;
      tokenNotice.classList.add('visible');
    }

    // 2. Setup Password Toggles
    if (passwordToggleBtn && passwordInput) {
      setupPasswordToggle(passwordToggleBtn, passwordInput);
    }
    if (confirmToggleBtn && confirmInput) {
      setupPasswordToggle(confirmToggleBtn, confirmInput);
    }

    // 3. Setup Strength Meter
    if (passwordInput && strengthSegments.length && strengthLabel) {
      setupPasswordStrengthMeter(passwordInput, strengthSegments, strengthLabel);
    }

    // 4. Real-time matching validation
    if (confirmInput && passwordInput) {
      confirmInput.addEventListener('input', function () {
        if (confirmInput.value.length > 0 && confirmInput.value !== passwordInput.value) {
          setFieldError(confirmInput, confirmError, 'Passwords do not match.');
        } else {
          clearFieldError(confirmInput, confirmError);
        }
      });

      passwordInput.addEventListener('input', function () {
        clearFieldError(passwordInput, passwordError);
        if (confirmInput.value.length > 0) {
          if (confirmInput.value !== passwordInput.value) {
            setFieldError(confirmInput, confirmError, 'Passwords do not match.');
          } else {
            clearFieldError(confirmInput, confirmError);
          }
        }
      });
    }

    // 5. Form Submission
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (devAlert) devAlert.classList.remove('visible');

      let isValid = true;
      const passwordVal = passwordInput ? passwordInput.value : '';
      const confirmVal = confirmInput ? confirmInput.value : '';

      // Validate New Password (minimum 12 characters)
      if (!passwordVal) {
        setFieldError(passwordInput, passwordError, 'New password is required.');
        isValid = false;
      } else if (!validatePassword(passwordVal)) {
        setFieldError(passwordInput, passwordError, 'Password must be at least 12 characters long according to platform policy.');
        isValid = false;
      } else {
        clearFieldError(passwordInput, passwordError);
      }

      // Validate Confirm Password
      if (!confirmVal) {
        setFieldError(confirmInput, confirmError, 'Please confirm your new password.');
        isValid = false;
      } else if (confirmVal !== passwordVal) {
        setFieldError(confirmInput, confirmError, 'Passwords do not match.');
        isValid = false;
      } else {
        clearFieldError(confirmInput, confirmError);
      }

      if (!isValid) {
        const firstInvalid = form.querySelector('.is-invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      // Submitting State
      submitBtn.classList.add('is-submitting');
      submitBtn.disabled = true;

      setTimeout(() => {
        submitBtn.classList.remove('is-submitting');
        submitBtn.disabled = false;

        if (devAlert) {
          devAlert.innerHTML = `
            <strong>New Password Policy Satisfied:</strong><br>
            Backend password update endpoint (<code>POST /api/auth/reset-password</code>) and cryptographic token validation are scheduled for <strong>Day 11</strong>.<br>
            <small class="text-muted">No mock password mutations were made to authoritative state.</small>
          `;
          devAlert.classList.add('visible');
          devAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 700);
    });
  });
})();
