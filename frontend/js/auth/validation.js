/**
 * DADDY TOSS BOOK - Authentication Validation & Form Utilities (Day 3)
 * Reusable, accessible client-side validation, password toggles, and strength evaluator.
 */

(function () {
  'use strict';

  // SVGs for Password Toggle
  const EYE_ICONS = {
    show: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    hide: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
  };

  /**
   * Validate Email Address format
   */
  function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    // RFC 5322 compliant practical regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emailRegex.test(trimmed);
  }

  /**
   * Validate Username format (3-20 chars, starts with letter, alphanumeric + underscores)
   */
  function validateUsername(username) {
    if (!username || typeof username !== 'string') return false;
    const trimmed = username.trim();
    const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
    return usernameRegex.test(trimmed);
  }

  /**
   * Validate Full Name (at least 2 chars, letters, spaces, hyphens, apostrophes)
   */
  function validateFullName(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) return false;
    const nameRegex = /^[a-zA-Z\s\-'.]+$/;
    return nameRegex.test(trimmed);
  }

  /**
   * Validate Password against preliminary policy (minimum 12 characters)
   */
  function validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    return password.length >= 12;
  }

  /**
   * Check Password Strength
   * Returns: { score: 1-4, label: 'Too short' | 'Weak' | 'Fair' | 'Strong', class: string }
   */
  function checkPasswordStrength(password) {
    if (!password || password.length === 0) {
      return { score: 0, label: 'Enter a password', class: '' };
    }

    if (password.length < 12) {
      return { score: 1, label: 'Too short (min 12 chars)', class: 'active-weak' };
    }

    let points = 1;

    // Length bonus
    if (password.length >= 16) points += 1;

    // Character variety checks
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSymbol = /[^a-zA-Z0-9]/.test(password);

    const varietyCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
    if (varietyCount >= 3) points += 1;
    if (varietyCount === 4) points += 1;

    // Common patterns penalty
    const lower = password.toLowerCase();
    const commonPatterns = ['password', '123456', 'qwerty', 'admin', 'ironman', 'daddy', 'welcome', 'letmein'];
    const hasCommon = commonPatterns.some(p => lower.includes(p));
    const hasRepeats = /(.)\1{3,}/.test(password);

    if (hasCommon || hasRepeats) {
      points = Math.max(1, points - 1);
    }

    if (points <= 1) {
      return { score: 1, label: 'Weak', class: 'active-weak' };
    } else if (points === 2) {
      return { score: 2, label: 'Fair', class: 'active-fair' };
    } else if (points === 3) {
      return { score: 3, label: 'Good', class: 'active-good' };
    } else {
      return { score: 4, label: 'Strong', class: 'active-strong' };
    }
  }

  /**
   * Display accessible field error
   */
  function setFieldError(inputEl, errorEl, message) {
    if (inputEl) {
      inputEl.classList.add('is-invalid');
      inputEl.setAttribute('aria-invalid', 'true');
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
  }

  /**
   * Clear field error
   */
  function clearFieldError(inputEl, errorEl) {
    if (inputEl) {
      inputEl.classList.remove('is-invalid');
      inputEl.removeAttribute('aria-invalid');
    }
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
    }
  }

  /**
   * Bind Password Visibility Toggle
   */
  function setupPasswordToggle(toggleBtn, passwordInput) {
    if (!toggleBtn || !passwordInput) return;

    toggleBtn.innerHTML = EYE_ICONS.show;
    toggleBtn.setAttribute('aria-label', 'Show password in plain text');

    toggleBtn.addEventListener('click', function (e) {
      e.preventDefault();
      const isPassword = passwordInput.getAttribute('type') === 'password';
      if (isPassword) {
        passwordInput.setAttribute('type', 'text');
        toggleBtn.innerHTML = EYE_ICONS.hide;
        toggleBtn.setAttribute('aria-label', 'Hide password');
      } else {
        passwordInput.setAttribute('type', 'password');
        toggleBtn.innerHTML = EYE_ICONS.show;
        toggleBtn.setAttribute('aria-label', 'Show password in plain text');
      }
      passwordInput.focus();
    });
  }

  /**
   * Bind Password Strength Meter
   */
  function setupPasswordStrengthMeter(passwordInput, segments, labelEl) {
    if (!passwordInput || !segments || !labelEl) return;

    function updateMeter() {
      const val = passwordInput.value;
      const res = checkPasswordStrength(val);

      labelEl.textContent = res.label;

      segments.forEach((seg, idx) => {
        // Reset classes
        seg.className = 'strength-bar-segment';
        if (val.length > 0 && idx < res.score) {
          seg.classList.add(res.class);
        }
      });
    }

    passwordInput.addEventListener('input', updateMeter);
    updateMeter();
  }

  // Export to window.AuthValidation
  window.AuthValidation = {
    validateEmail,
    validateUsername,
    validateFullName,
    validatePassword,
    checkPasswordStrength,
    setFieldError,
    clearFieldError,
    setupPasswordToggle,
    setupPasswordStrengthMeter
  };
})();
