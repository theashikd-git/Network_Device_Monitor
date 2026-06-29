/* ============================================================
   NETMON — storage.js
   A single, namespaced wrapper around LocalStorage, plus the
   default/seed data used the first time the app runs.
   ============================================================ */

const Storage = (() => {

  const KEYS = {
    AUTH: 'netmon_auth',
    REMEMBERED_USER: 'netmon_remembered_user',
    THEME: 'netmon_theme',
    DEVICE_INFO: 'netmon_device_info',
    INTERFACES: 'netmon_interfaces',
    ALERTS: 'netmon_alerts',
    ALERT_STATE: 'netmon_alert_state',
    IGNORED_INTERFACES: 'netmon_ignored_interfaces',
    SIDEBAR_COLLAPSED: 'netmon_sidebar_collapsed',
    SESSION_START: 'netmon_session_start',
  };

  const DEFAULT_DEVICE_INFO = {
    name: 'MikroTik-CCR2004',
    ip: '192.168.88.1',
    type: 'Router (CCR2004-1G-12S+2XS)',
    firmware: 'RouterOS 7.15.2',
    location: 'Server Room — Rack 3',
    model: 'CCR2004-1G-12S+2XS',
    serial: 'A4C19F3E2B01',
  };

  const DEFAULT_INTERFACES = [
    { id: 'ether1', status: 'online', rx: 125, tx: 80 },
    { id: 'ether2', status: 'online', rx: 40, tx: 30 },
    { id: 'ether3', status: 'offline', rx: 0, tx: 0 },
    { id: 'ether4', status: 'online', rx: 8, tx: 4 },
    { id: 'sfp-sfpplus1', status: 'online', rx: 920, tx: 870 },
    { id: 'wlan1', status: 'online', rx: 62, tx: 35 },
  ];

  function get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      console.warn('Storage read failed for', key, e);
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write failed for', key, e);
      return false;
    }
  }

  function remove(key) {
    localStorage.removeItem(key);
  }

  /** Ensure default datasets exist on first run, without clobbering edits */
  function seedIfEmpty() {
    if (get(KEYS.DEVICE_INFO) === null) set(KEYS.DEVICE_INFO, DEFAULT_DEVICE_INFO);
    if (get(KEYS.INTERFACES) === null) set(KEYS.INTERFACES, DEFAULT_INTERFACES);
    if (get(KEYS.ALERTS) === null) set(KEYS.ALERTS, []);
    if (get(KEYS.THEME) === null) set(KEYS.THEME, 'dark');
  }

  function isAuthenticated() {
    return get(KEYS.AUTH) === true;
  }

  function setAuthenticated(value) {
    set(KEYS.AUTH, value);
    if (value) set(KEYS.SESSION_START, Date.now());
  }

  function logout() {
    remove(KEYS.AUTH);
    remove(KEYS.SESSION_START);
  }

  return { KEYS, get, set, remove, seedIfEmpty, isAuthenticated, setAuthenticated, logout, DEFAULT_DEVICE_INFO, DEFAULT_INTERFACES };
})();

// Run seeding immediately on every page load.
Storage.seedIfEmpty();
