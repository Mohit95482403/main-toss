/**
 * IRONMAN TOSS BOOK - Forgot Password Controller (Day 3)
 * Handles email validation, submission states, and honest API boundary messaging.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('forgot-form');
    if (!form) return;

    const emailInput = document.getElementById('forgot-email');
    const emailError = document.getElementById('email-error');
    const submitBtn = document.getElementById('forgot-submit-btn');
    const devAlert = document.getElementById('forgot-dev-alert');

    const { validateEmail, setFieldError, clearFieldError } = window.AuthValidation;

    if (emailInput) {
      emailInput.addEventListener('input', () => {
        clearFieldError(emailInput, emailError);
        if (devAlert) devAlert.classList.remove('visible');
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (devAlert) devAlert.classList.remove('visible');

      const emailVal = emailInput ? emailInput.value.trim() : '';

      if (!emailVal) {
        setFieldError(emailInput, emailError, 'Please enter your registered email address.');
        emailInput.focus();
        return;
      }

      if (!validateEmail(emailVal)) {
        setFieldError(emailInput, emailError, 'Please enter a valid email address (e.g., user@example.com).');
        emailInput.focus();
        return;
      }

      clearFieldError(emailInput, emailError);

      // Submitting State
      submitBtn.classList.add('is-submitting');
      submitBtn.disabled = true;

      // Honest simulation
      setTimeout(() => {
        submitBtn.classList.remove('is-submitting');
        submitBtn.disabled = false;

        if (devAlert) {
          devAlert.innerHTML = `
            <strong>Email Syntax Validated:</strong><br>
            Backend password reset dispatch endpoint (<code>POST /api/auth/forgot-password</code>) and SMTP delivery service are scheduled for <strong>Day 11</strong>.<br>
            <small class="text-muted">In accordance with security best practices, user enumeration is prevented and no mock dispatch was triggered.</small>
          `;
          devAlert.classList.add('visible');
          devAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 600);
    });
  });
})();
