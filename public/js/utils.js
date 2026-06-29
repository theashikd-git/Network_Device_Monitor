/* ============================================================
   NETMON — utils.js
   Small, dependency-free helper functions shared across pages.
   ============================================================ */

const Utils = (() => {

  /** Clamp a number between min and max */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /** Random integer between min and max (inclusive) */
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Random float between min and max, fixed to `decimals` places */
  function randFloat(min, max, decimals = 1) {
    const val = Math.random() * (max - min) + min;
    return parseFloat(val.toFixed(decimals));
  }

  /**
   * Walk a value toward a target by a random-ish step, so metrics drift
   * smoothly instead of jumping wildly between polls.
   */
  function drift(current, target, maxStep, min = 0, max = 100) {
    const delta = target - current;
    const step = clamp(delta, -maxStep, maxStep) + randFloat(-maxStep / 3, maxStep / 3, 2);
    return clamp(parseFloat((current + step).toFixed(1)), min, max);
  }

  /** Format seconds as "Xd Yh Zm" uptime string */
  function formatUptime(totalSeconds) {
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h || d) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  }

  /** Format a timestamp as a relative "Xs/m/h ago" string */
  function timeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  /** Format a number with thousands separators */
  function formatNumber(num) {
    return num.toLocaleString('en-US');
  }

  /** Debounce a function call */
  function debounce(fn, wait = 250) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  /** Escape a string for safe HTML text insertion */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /** Basic IPv4 validation */
  function isValidIPv4(ip) {
    const re = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(re);
    if (!match) return false;
    return match.slice(1).every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
  }

  /** Determine threshold state ('good' | 'warn' | 'crit') for a percentage metric */
  function thresholdState(value, warnAt = 70, critAt = 90) {
    if (value >= critAt) return 'crit';
    if (value >= warnAt) return 'warn';
    return 'good';
  }

  /** Create a DOM element from an HTML string (single root element) */
  function elFromHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  /** Show a toast notification. type: 'good' | 'warn' | 'crit' | 'info' */
  function toast(message, type = 'info', duration = 4000) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const toastEl = elFromHTML(`
      <div class="toast toast-${type}" role="status">
        <span class="toast-msg">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Dismiss notification">✕</button>
      </div>
    `);
    stack.appendChild(toastEl);
    const remove = () => {
      toastEl.style.animation = 'toast-out 200ms ease-in forwards';
      setTimeout(() => toastEl.remove(), 200);
    };
    toastEl.querySelector('.toast-close').addEventListener('click', remove);
    if (duration > 0) setTimeout(remove, duration);
    return toastEl;
  }

  /** Hide the full-page loader, if present */
  function hidePageLoader() {
    const loader = document.querySelector('.page-loader');
    if (loader) {
      setTimeout(() => loader.classList.add('hidden'), 250);
    }
  }

  /** Show/update a persistent banner when the backend can't be reached */
  function showBackendErrorBanner(message) {
    let el = document.getElementById('backend-error-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'backend-error-banner';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:1500;background:var(--accent-crit-dim);color:var(--accent-crit);font-family:var(--font-mono);font-size:12.5px;text-align:center;padding:8px;border-bottom:1px solid var(--accent-crit);';
      document.body.prepend(el);
    }
    el.textContent = message;
  }

  function hideBackendErrorBanner() {
    const el = document.getElementById('backend-error-banner');
    if (el) el.remove();
  }

  return {
    clamp, randInt, randFloat, drift,
    formatUptime, timeAgo, formatNumber,
    debounce, escapeHtml, isValidIPv4, thresholdState,
    elFromHTML, toast, hidePageLoader,
    showBackendErrorBanner, hideBackendErrorBanner,
  };
})();
