/**
 * DADDY TOSS BOOK - Registration Form Controller (Day 3)
 * Handles input validation, password strength meter, confirm password matching, and submission.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('register-form');
    if (!form) return;

    // Field references
    const nameInput = document.getElementById('register-name');
    const nameError = document.getElementById('name-error');

    const usernameInput = document.getElementById('register-username');
    const usernameError = document.getElementById('username-error');

    const emailInput = document.getElementById('register-email');
    const emailError = document.getElementById('email-error');

    const passwordInput = document.getElementById('register-password');
    const passwordError = document.getElementById('password-error');
    const passwordToggleBtn = document.getElementById('password-toggle-btn');

    const confirmInput = document.getElementById('register-confirm');
    const confirmError = document.getElementById('confirm-error');
    const confirmToggleBtn = document.getElementById('confirm-toggle-btn');

    const phoneInput = document.getElementById('register-phone');
    const termsCheckbox = document.getElementById('register-terms');
    const termsError = document.getElementById('terms-error');

    const submitBtn = document.getElementById('register-submit-btn');
    const devAlert = document.getElementById('register-dev-alert');
    const errorAlert = document.getElementById('register-error-alert');

    function hideAlerts() {
      if (devAlert) devAlert.classList.remove('visible');
      if (errorAlert) errorAlert.classList.remove('visible');
    }

    // Strength elements
    const strengthSegments = form.querySelectorAll('.strength-bar-segment');
    const strengthLabel = document.getElementById('strength-label');

    const {
      validateEmail,
      validateUsername,
      validateFullName,
      validatePassword,
      setFieldError,
      clearFieldError,
      setupPasswordToggle,
      setupPasswordStrengthMeter
    } = window.AuthValidation;

    // 1. Password Visibility Toggles
    if (passwordToggleBtn && passwordInput) {
      setupPasswordToggle(passwordToggleBtn, passwordInput);
    }
    if (confirmToggleBtn && confirmInput) {
      setupPasswordToggle(confirmToggleBtn, confirmInput);
    }

    // 2. Real-time Password Strength Meter
    if (passwordInput && strengthSegments.length && strengthLabel) {
      setupPasswordStrengthMeter(passwordInput, strengthSegments, strengthLabel);
    }

    // 3. Real-time Confirm Password Matching
    if (confirmInput && passwordInput) {
      confirmInput.addEventListener('input', function () {
        if (confirmInput.value.length > 0 && confirmInput.value !== passwordInput.value) {
          setFieldError(confirmInput, confirmError, 'Passwords do not match.');
        } else {
          clearFieldError(confirmInput, confirmError);
        }
      });

      passwordInput.addEventListener('input', function () {
        if (confirmInput.value.length > 0) {
          if (confirmInput.value !== passwordInput.value) {
            setFieldError(confirmInput, confirmError, 'Passwords do not match.');
          } else {
            clearFieldError(confirmInput, confirmError);
          }
        }
      });
    }

    // Clear individual field errors on input
    [nameInput, usernameInput, emailInput, passwordInput, confirmInput].forEach(inp => {
      if (inp) {
        inp.addEventListener('input', () => {
          hideAlerts();
        });
      }
    });

    if (nameInput) {
      nameInput.addEventListener('input', () => clearFieldError(nameInput, nameError));
    }
    if (usernameInput) {
      usernameInput.addEventListener('input', () => clearFieldError(usernameInput, usernameError));
    }
    if (emailInput) {
      emailInput.addEventListener('input', () => clearFieldError(emailInput, emailError));
    }
    if (termsCheckbox) {
      termsCheckbox.addEventListener('change', () => clearFieldError(termsCheckbox, termsError));
    }

    // 4. Form Submission Handling
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideAlerts();

      let isValid = true;

      // Full Name Validation
      const nameVal = nameInput ? nameInput.value.trim() : '';
      if (!nameVal) {
        setFieldError(nameInput, nameError, 'Full Name is required.');
        isValid = false;
      } else if (!validateFullName(nameVal)) {
        setFieldError(nameInput, nameError, 'Please enter a valid full name (minimum 2 characters, letters only).');
        isValid = false;
      } else {
        clearFieldError(nameInput, nameError);
      }

      // Username Validation
      const usernameVal = usernameInput ? usernameInput.value.trim() : '';
      if (!usernameVal) {
        setFieldError(usernameInput, usernameError, 'Username is required.');
        isValid = false;
      } else if (!validateUsername(usernameVal)) {
        setFieldError(usernameInput, usernameError, 'Username must be 3–20 characters, begin with a letter, and contain only letters, numbers, and underscores.');
        isValid = false;
      } else {
        clearFieldError(usernameInput, usernameError);
      }

      // Email Validation
      const emailVal = emailInput ? emailInput.value.trim() : '';
      if (!emailVal) {
        setFieldError(emailInput, emailError, 'Email address is required.');
        isValid = false;
      } else if (!validateEmail(emailVal)) {
        setFieldError(emailInput, emailError, 'Please enter a valid email address (e.g., user@example.com).');
        isValid = false;
      } else {
        clearFieldError(emailInput, emailError);
      }

      // Password Policy Validation (Minimum 12 characters)
      const passwordVal = passwordInput ? passwordInput.value : '';
      if (!passwordVal) {
        setFieldError(passwordInput, passwordError, 'Password is required.');
        isValid = false;
      } else if (!validatePassword(passwordVal)) {
        setFieldError(passwordInput, passwordError, 'Password must be at least 12 characters long according to platform policy.');
        isValid = false;
      } else {
        clearFieldError(passwordInput, passwordError);
      }

      // Confirm Password Matching Validation
      const confirmVal = confirmInput ? confirmInput.value : '';
      if (!confirmVal) {
        setFieldError(confirmInput, confirmError, 'Please confirm your password.');
        isValid = false;
      } else if (confirmVal !== passwordVal) {
        setFieldError(confirmInput, confirmError, 'Passwords do not match.');
        isValid = false;
      } else {
        clearFieldError(confirmInput, confirmError);
      }

      // Terms Acknowledgement Validation
      if (termsCheckbox && !termsCheckbox.checked) {
        setFieldError(termsCheckbox, termsError, 'You must agree to the Terms & Conditions and App Rules.');
        isValid = false;
      } else {
        clearFieldError(termsCheckbox, termsError);
      }

      if (!isValid) {
        const firstInvalid = form.querySelector('.is-invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      // Submitting State
      submitBtn.classList.add('is-submitting');
      submitBtn.disabled = true;

      const phoneVal = phoneInput ? phoneInput.value.trim() : null;
      const registerPayload = {
        fullName: nameVal,
        username: usernameVal,
        email: emailVal,
        phone: phoneVal || undefined,
        password: passwordVal
      };

      const apiClient = window.ApiClient;
      const apiPromise = apiClient
        ? apiClient.post('/auth/register', registerPayload)
        : fetch(`${(window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || 'http://localhost:5000/api'}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registerPayload)
          }).then(r => r.json().then(d => r.ok ? d : Promise.reject(d)));

      apiPromise
        .then((res) => {
          submitBtn.classList.remove('is-submitting');
          submitBtn.disabled = false;

          const token = res.token || (res.data && res.data.token);
          const user = res.user || (res.data && res.data.user);

          if (token) {
            if (window.ApiClient) {
              window.ApiClient.setToken(token);
              window.ApiClient.setUser(user);
            } else {
              localStorage.setItem('itb_auth_token', token);
              if (user) localStorage.setItem('itb_auth_user', JSON.stringify(user));
            }
          }

          if (devAlert) {
            devAlert.innerHTML = `
              <strong>Account Created Successfully!</strong><br>
              Welcome to DADDY TOSS BOOK, <strong>${user ? (user.username || user.fullName || 'Player') : 'User'}</strong>!<br>
              <small class="text-muted">Account verified. Redirecting to home dashboard...</small>
            `;
            devAlert.classList.add('visible');
            devAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }

          setTimeout(() => {
            window.location.href = '../index.html';
          }, 800);
        })
        .catch((err) => {
          submitBtn.classList.remove('is-submitting');
          submitBtn.disabled = false;

          const errorMsg = (err.error && err.error.message) || err.message || 'Registration failed. Please check your information.';

          if (errorAlert) {
            errorAlert.innerHTML = `
              <strong>Registration Failed:</strong><br>
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
