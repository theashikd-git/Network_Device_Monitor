/* ============================================================
   NETMON — app-shell.js
   Logic shared by every authenticated page: route guard, sidebar
   navigation, topbar (theme toggle, pulse strip, user menu),
   and the alert badge count. Include AFTER storage.js + utils.js.
   ============================================================ */

(function () {
  // ---- Route guard: bounce to login if not authenticated ----
  if (!Storage.isAuthenticated()) {
    window.location.href = 'index.html';
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSidebar();
    initMobileNav();
    initUserMenu();
    initPulseStrip();
    initLogout();
    AlertBadge.refresh();
    Utils.hidePageLoader();
  });

  // ---- Theme ----
  function initTheme() {
    const saved = Storage.get(Storage.KEYS.THEME, 'dark');
    document.documentElement.setAttribute('data-theme', saved);
    const toggle = document.querySelector('.theme-toggle-switch');
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', saved === 'light' ? 'true' : 'false');
    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      Storage.set(Storage.KEYS.THEME, next);
      toggle.setAttribute('aria-pressed', next === 'light' ? 'true' : 'false');
    });
  }

  // ---- Sidebar collapse (desktop) ----
  function initSidebar() {
    const shell = document.querySelector('.app-shell');
    const btn = document.querySelector('.sidebar-collapse-btn');
    if (!shell || !btn) return;
    const collapsed = Storage.get(Storage.KEYS.SIDEBAR_COLLAPSED, false);
    if (collapsed) shell.classList.add('sidebar-collapsed');
    btn.addEventListener('click', () => {
      shell.classList.toggle('sidebar-collapsed');
      Storage.set(Storage.KEYS.SIDEBAR_COLLAPSED, shell.classList.contains('sidebar-collapsed'));
    });
  }

  // ---- Mobile nav drawer ----
  function initMobileNav() {
    const shell = document.querySelector('.app-shell');
    const toggle = document.querySelector('.mobile-nav-toggle');
    const overlay = document.querySelector('.nav-overlay');
    if (!shell || !toggle) return;
    const close = () => shell.classList.remove('mobile-nav-open');
    toggle.addEventListener('click', () => shell.classList.toggle('mobile-nav-open'));
    if (overlay) overlay.addEventListener('click', close);
    document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', close));
  }

  // ---- User menu / logout ----
  function initUserMenu() {
    const chip = document.querySelector('.user-chip');
    if (!chip) return;
    chip.addEventListener('click', () => {
      const ok = window.confirm('Log out of NETMON?');
      if (ok) doLogout();
    });
  }

  function initLogout() {
    document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
      btn.addEventListener('click', doLogout);
    });
  }

  function doLogout() {
    Storage.logout();
    window.location.href = 'index.html';
  }

  // ---- Signature element: live pulse strip in topbar ----
  function initPulseStrip() {
    const svg = document.querySelector('.pulse-strip svg');
    if (!svg) return;
    const path = svg.querySelector('.pulse-line');
    const dot = svg.querySelector('.pulse-dot');
    if (!path || !dot) return;

    // Heartbeat-style waveform, redrawn with slight jitter each poll cycle
    // to visually communicate "live polling," tied to the 3s refresh cadence.
    function drawBeat() {
      const w = 120, h = 28, mid = h / 2;
      const jitter = () => Utils.randFloat(-2, 2, 1);
      const d = `M0,${mid} L${20 + jitter()},${mid} L${30 + jitter()},${4 + jitter()} L${38},${h - 2} L${46},${mid} L${70 + jitter()},${mid} L${80 + jitter()},${6} L${88},${h - 4} L${96},${mid} L120,${mid}`;
      path.setAttribute('d', d);
      dot.setAttribute('cx', 116);
      dot.setAttribute('cy', mid);
    }
    drawBeat();
    setInterval(drawBeat, 3000);
  }

  // ---- Alert badge count (shared across pages via storage) ----
  window.AlertBadge = {
    refresh() {
      const alerts = Storage.get(Storage.KEYS.ALERTS, []);
      const count = alerts.length;
      document.querySelectorAll('[data-alert-badge]').forEach((el) => {
        if (count > 0) {
          el.textContent = count > 99 ? '99+' : String(count);
          el.style.display = '';
        } else {
          el.style.display = 'none';
        }
      });
    },
  };
})();
