/* ============================================================
   NETMON — api.js
   The single place that talks to the real backend. Every other
   script gets device data through this module instead of
   simulating it locally.
   ============================================================ */

const Api = (() => {
  // Since the backend now serves this page itself (you open
  // http://localhost:4000 directly), the API lives at the same address
  // by default — no separate machine/port to configure for normal use.
  // Only change this if you deliberately split frontend and backend onto
  // different machines later.
  const API_BASE_URL = window.NETMON_API_BASE_URL || '';

  async function request(path) {
    const res = await fetch(`${API_BASE_URL}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request to ${path} failed (${res.status})`);
    }
    return res.json();
  }

  /** GET /api/devices — fleet summary for the overview page */
  function getFleetSummary() {
    return request('/api/devices');
  }

  /** GET /api/devices/:id — full detail + history for one device */
  function getDeviceDetail(id) {
    return request(`/api/devices/${encodeURIComponent(id)}`);
  }

  /** GET /api/health — quick check that the backend is reachable at all */
  function checkHealth() {
    return request('/api/health');
  }

  return { getFleetSummary, getDeviceDetail, checkHealth, API_BASE_URL };
})();
