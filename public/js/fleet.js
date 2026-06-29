/* ============================================================
   NETMON — fleet.js
   Drives the Fleet Overview page: a grid of real devices pulled
   from the backend every 3 seconds, color-coded by status, each
   one linking into the per-device detail dashboard.
   ============================================================ */

class FleetMonitor {
  constructor(gridEl) {
    this.gridEl = gridEl;
    this.devices = [];
  }

  async poll() {
    const devices = await Api.getFleetSummary();
    this.devices = devices;
    this.render();
    return devices;
  }

  render() {
    if (this.devices.length === 0) {
      this.gridEl.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 11h.01M10 11h.01"/></svg>
          <div class="empty-title">No devices added yet</div>
          <div class="empty-sub">That's expected on a fresh install — nothing is broken. Open devices.json in the project folder, add your first real router or switch, then restart the server. See SETUP.md for exact steps per device brand.</div>
        </div>`;
      return;
    }

    this.gridEl.innerHTML = this.devices.map((d) => {
      const state = !d.online ? 'crit' : Utils.thresholdState(d.cpuPercent ?? 0);
      const cpuDisplay = d.cpuPercent === null || d.cpuPercent === undefined ? '—' : `${Math.round(d.cpuPercent)}%`;
      const memDisplay = d.memoryPercent === null || d.memoryPercent === undefined ? '—' : `${Math.round(d.memoryPercent)}%`;
      const statusLabel = d.pending ? 'Polling…' : d.online ? 'Online' : 'Offline';
      const typeIcon = d.type === 'router'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v4M16 3v4M3 11h18M5 7h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z"/></svg>';

      return `
        <a class="fleet-card" data-state="${state}" href="dashboard.html?device=${encodeURIComponent(d.id)}">
          <div class="fleet-card-head">
            <span class="fleet-card-icon">${typeIcon}</span>
            <span class="tag ${d.online ? 'tag-good' : 'tag-crit'}">${statusLabel}</span>
          </div>
          <div class="fleet-card-name">${Utils.escapeHtml(d.name)}</div>
          <div class="fleet-card-ip mono">${Utils.escapeHtml(d.ip)}</div>
          <div class="fleet-card-metrics">
            <div class="fleet-metric"><span class="fleet-metric-label">CPU</span><span class="fleet-metric-value">${cpuDisplay}</span></div>
            <div class="fleet-metric"><span class="fleet-metric-label">MEM</span><span class="fleet-metric-value">${memDisplay}</span></div>
            <div class="fleet-metric"><span class="fleet-metric-label">IFACES</span><span class="fleet-metric-value">${d.interfacesOnline ?? 0}/${d.interfaceCount ?? 0}</span></div>
          </div>
          ${d.error ? `<div class="fleet-card-error">${Utils.escapeHtml(d.error)}</div>` : ''}
        </a>
      `;
    }).join('');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const gridEl = document.getElementById('fleet-grid');
  if (!gridEl) return;
  const fleet = new FleetMonitor(gridEl);

  async function tick() {
    try {
      await fleet.poll();
      Utils.hideBackendErrorBanner();
    } catch (err) {
      Utils.showBackendErrorBanner(`Can't reach the NETMON backend at ${Api.API_BASE_URL} — ${err.message}. Is the server running? See server/SETUP.md.`);
    }
    Utils.hidePageLoader();
  }

  tick();
  setInterval(tick, 3000);
});
