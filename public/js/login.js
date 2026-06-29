/* ============================================================
   NETMON — login.js
   Form validation, password visibility toggle, "remember me"
   via Local Storage, and a simulated authentication flow.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, skip straight to the fleet overview.
  if (Storage.isAuthenticated()) {
    window.location.href = 'fleet.html';
    return;
  }

  Utils.hidePageLoader();

  const form = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const rememberCheckbox = document.getElementById('remember-me');
  const toggleBtn = document.getElementById('password-toggle');
  const submitBtn = document.getElementById('login-submit');
  const loginCard = document.querySelector('.login-card');

  // ---- Pre-fill remembered username ----
  const remembered = Storage.get(Storage.KEYS.REMEMBERED_USER);
  if (remembered) {
    usernameInput.value = remembered;
    rememberCheckbox.checked = true;
  }

  // ---- Show / hide password ----
  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggleBtn.classList.toggle('is-visible', isPassword);
    toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });

  // ---- Field-level validation helpers ----
  function setFieldError(input, errorEl, message) {
    if (message) {
      input.classList.add('has-error');
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    } else {
      input.classList.remove('has-error');
      errorEl.classList.remove('visible');
    }
  }

  function validateUsername() {
    const errorEl = document.getElementById('username-error');
    if (!usernameInput.value.trim()) {
      setFieldError(usernameInput, errorEl, 'Enter your username.');
      return false;
    }
    setFieldError(usernameInput, errorEl, '');
    return true;
  }

  function validatePassword() {
    const errorEl = document.getElementById('password-error');
    if (!passwordInput.value) {
      setFieldError(passwordInput, errorEl, 'Enter your password.');
      return false;
    }
    if (passwordInput.value.length < 4) {
      setFieldError(passwordInput, errorEl, 'Password must be at least 4 characters.');
      return false;
    }
    setFieldError(passwordInput, errorEl, '');
    return true;
  }

  // Validate as the person types, once they've already tried submitting once.
  let attempted = false;
  usernameInput.addEventListener('input', () => attempted && validateUsername());
  passwordInput.addEventListener('input', () => attempted && validatePassword());

  // ---- Submit ----
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    attempted = true;
    const usernameOk = validateUsername();
    const passwordOk = validatePassword();

    if (!usernameOk || !passwordOk) {
      loginCard.classList.remove('shake');
      // restart animation
      requestAnimationFrame(() => loginCard.classList.add('shake'));
      return;
    }

    // Simulated auth — any non-empty credentials succeed, matching the
    // "simulated data" brief. Swap this block for a real fetch() call
    // when wiring up to a backend.
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    setTimeout(() => {
      if (rememberCheckbox.checked) {
        Storage.set(Storage.KEYS.REMEMBERED_USER, usernameInput.value.trim());
      } else {
        Storage.remove(Storage.KEYS.REMEMBERED_USER);
      }
      Storage.setAuthenticated(true);
      window.location.href = 'fleet.html';
    }, 600);
  });

  loginCard.addEventListener('animationend', () => loginCard.classList.remove('shake'));
});
