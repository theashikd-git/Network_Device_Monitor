/* ============================================================
   NETMON — dashboard.js (real-data version)
   Drives the per-device detail dashboard: reads ?device=<id>
   from the URL, polls the real backend every 3 seconds, and
   renders the same cards/charts/alerts UI with real numbers.
   ============================================================ */

class AlertCenter {
  constructor(listEl) {
    this.listEl = listEl;
    this.alerts = Storage.get(Storage.KEYS.ALERTS, []);
    // Tracks the last known state per alert "kind" (e.g. a specific
    // interface, or "cpu-high" for a device) so an alert only fires on
    // an actual transition (good -> bad), not on every poll while a
    // problem remains unchanged. Persisted so a page reload doesn't
    // forget what was already alerted and re-fire everything.
    this._lastState = Storage.get(Storage.KEYS.ALERT_STATE, {});
    this.render();
  }

  _save() {
    Storage.set(Storage.KEYS.ALERTS, this.alerts);
    Storage.set(Storage.KEYS.ALERT_STATE, this._lastState);
    if (window.AlertBadge) window.AlertBadge.refresh();
  }

  /**
   * Fire an alert only when `isBad` transitions from false -> true for
   * this `kind`. Staying bad across many polls fires nothing further;
   * recovering (isBad: false) clears the state so the next time it goes
   * bad again, it alerts again. This replaces the old cooldown-timer
   * approach, which re-fired the same alert every time the cooldown
   * elapsed even if nothing had actually changed.
   */
  reportState(kind, isBad, severity, message) {
    const wasBad = this._lastState[kind] === true;
    this._lastState[kind] = isBad;

    if (isBad && !wasBad) {
      this.add(severity, message);
    }
    // Save on every call (not just when firing) so a recovery is
    // remembered even if the user never sees a "recovered" alert for it.
    Storage.set(Storage.KEYS.ALERT_STATE, this._lastState);
  }

  add(severity, message) {
    const alert = { id: `a_${Date.now()}_${Utils.randInt(100, 999)}`, severity, message, ts: Date.now() };
    this.alerts.unshift(alert);
    this.alerts = this.alerts.slice(0, 50);
    this._save();
    this.render();
    Utils.toast(message, severity === 'critical' ? 'crit' : severity === 'warning' ? 'warn' : 'info');
  }

  dismiss(id) {
    const el = this.listEl.querySelector(`[data-alert-id="${id}"]`);
    const finish = () => {
      this.alerts = this.alerts.filter((a) => a.id !== id);
      this._save();
      this.render();
    };
    if (el) {
      el.classList.add('dismissing');
      setTimeout(finish, 190);
    } else {
      finish();
    }
  }

  clearAll() {
    this.alerts = [];
    this._save();
    this.render();
  }

  render() {
    if (!this.listEl) return;
    if (this.alerts.length === 0) {
      this.listEl.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <div class="empty-title">No active alerts</div>
          <div class="empty-sub">Everything is within normal thresholds. New alerts will appear here automatically.</div>
        </div>`;
      return;
    }
    const icons = {
      critical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    };
    this.listEl.innerHTML = this.alerts.map((a) => `
      <div class="alert-item" data-severity="${a.severity}" data-alert-id="${a.id}">
        <div class="alert-icon">${icons[a.severity] || icons.info}</div>
        <div class="alert-body">
          <div class="alert-msg">${Utils.escapeHtml(a.message)}</div>
          <div class="alert-meta">${Utils.timeAgo(a.ts)}</div>
        </div>
        <button class="alert-dismiss" aria-label="Dismiss alert" data-dismiss="${a.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('');

    this.listEl.querySelectorAll('[data-dismiss]').forEach((btn) => {
      btn.addEventListener('click', () => this.dismiss(btn.dataset.dismiss));
    });
  }

  refreshTimestamps() {
    this.listEl.querySelectorAll('[data-alert-id]').forEach((el) => {
      const alert = this.alerts.find((a) => a.id === el.dataset.alertId);
      const metaEl = el.querySelector('.alert-meta');
      if (alert && metaEl) metaEl.textContent = Utils.timeAgo(alert.ts);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const deviceId = params.get('device');

  if (!deviceId) {
    window.location.href = 'fleet.html';
    return;
  }

  const alertCenter = new AlertCenter(document.getElementById('alert-list'));

  const cpuCard = document.getElementById('card-cpu');
  const memCard = document.getElementById('card-memory');
  const uptimeCard = document.getElementById('card-uptime');
  const statusCard = document.getElementById('card-status');
  const deviceNameEl = document.querySelector('.device-identity .name');
  const deviceIpEl = document.querySelector('.device-identity .ip');
  const pageTitleEl = document.querySelector('.page-title');

  const cpuChart = new LiveLineChart(document.getElementById('cpu-chart'), { color: '#5FA8E8', maxPoints: 30, max: 100 });
  const memChart = new LiveLineChart(document.getElementById('memory-chart'), { color: '#5EE6A6', maxPoints: 30, max: 100 });
  let chartsSeeded = false;

  function updateCard(cardEl, percent) {
    if (!cardEl) return;
    if (percent === null || percent === undefined) {
      cardEl.dataset.state = 'good';
      cardEl.querySelector('.metric-value').textContent = '—';
      const fill = cardEl.querySelector('.metric-bar-fill');
      if (fill) fill.style.width = '0%';
      const trendEl = cardEl.querySelector('.metric-trend');
      if (trendEl) trendEl.textContent = 'not exposed via SNMP';
      return;
    }
    const state = Utils.thresholdState(percent);
    cardEl.dataset.state = state;
    cardEl.querySelector('.metric-value').textContent = Math.round(percent);
    const fill = cardEl.querySelector('.metric-bar-fill');
    if (fill) fill.style.width = `${percent}%`;
    const trendEl = cardEl.querySelector('.metric-trend');
    if (trendEl) {
      const prev = parseFloat(cardEl.dataset.prevValue ?? percent);
      const up = percent > prev;
      trendEl.textContent = `${up ? '▲' : '▼'} ${Math.abs(percent - prev).toFixed(1)}%`;
      trendEl.className = `metric-trend ${up ? 'trend-up' : 'trend-down'}`;
      cardEl.dataset.prevValue = percent;
    }
  }

  function renderSnapshot(snap) {
    if (deviceNameEl) deviceNameEl.textContent = snap.name;
    if (deviceIpEl) deviceIpEl.textContent = snap.ip;
    if (pageTitleEl) pageTitleEl.textContent = snap.name;

    updateCard(cpuCard, snap.cpuPercent);
    updateCard(memCard, snap.memoryPercent);

    if (uptimeCard) {
      uptimeCard.querySelector('.metric-value').textContent = snap.online ? Utils.formatUptime(snap.uptimeSeconds) : '—';
    }
    if (statusCard) {
      const dot = statusCard.querySelector('.status-dot');
      const label = statusCard.querySelector('.status-label');
      if (dot) dot.style.background = snap.online ? 'var(--accent-good)' : 'var(--accent-crit)';
      if (label) label.textContent = snap.online ? 'Online' : 'Offline';
      statusCard.dataset.state = snap.online ? 'good' : 'crit';
    }

    if (!chartsSeeded && snap.history && snap.history.length > 0) {
      snap.history.forEach((point) => {
        if (point.cpu !== null && point.cpu !== undefined) cpuChart.push(point.cpu);
        if (point.memory !== null && point.memory !== undefined) memChart.push(point.memory);
      });
      chartsSeeded = true;
    } else {
      if (snap.cpuPercent !== null && snap.cpuPercent !== undefined) cpuChart.push(snap.cpuPercent);
      if (snap.memoryPercent !== null && snap.memoryPercent !== undefined) memChart.push(snap.memoryPercent);
    }

    alertCenter.reportState(`${snap.id}-offline`, !snap.online, 'critical', `${snap.name} is unreachable (${snap.error || 'no response'})`);

    alertCenter.reportState(
      `${snap.id}-cpu-high`,
      snap.cpuPercent !== null && snap.cpuPercent > 80,
      snap.cpuPercent > 90 ? 'critical' : 'warning',
      `${snap.name}: CPU usage above 80% (currently ${snap.cpuPercent != null ? snap.cpuPercent.toFixed(0) : '?'}%)`
    );

    alertCenter.reportState(
      `${snap.id}-mem-high`,
      snap.memoryPercent !== null && snap.memoryPercent > 90,
      'critical',
      `${snap.name}: Memory usage above 90% (currently ${snap.memoryPercent != null ? snap.memoryPercent.toFixed(0) : '?'}%)`
    );

    const ignoredIfaces = new Set(Storage.get(Storage.KEYS.IGNORED_INTERFACES, {})[snap.id] || []);
    (snap.interfaces || []).forEach((iface) => {
      if (ignoredIfaces.has(iface.id)) return; // permanently silenced by the user — never alert
      alertCenter.reportState(
        `${snap.id}-iface-${iface.id}`,
        iface.status === 'offline',
        'critical',
        `${snap.name}: interface ${iface.id} is down`
      );
    });

    sessionStorage.setItem(`netmon_last_snapshot_${snap.id}`, JSON.stringify(snap));
  }

  async function tick() {
    try {
      const snap = await Api.getDeviceDetail(deviceId);
      renderSnapshot(snap);
      Utils.hideBackendErrorBanner();
    } catch (err) {
      Utils.showBackendErrorBanner(`Can't reach the NETMON backend at ${Api.API_BASE_URL} — ${err.message}.`);
    }
    Utils.hidePageLoader();
  }

  tick();
  setInterval(tick, 3000);
  setInterval(() => alertCenter.refreshTimestamps(), 10000);

  const clearBtn = document.getElementById('clear-alerts-btn');
  if (clearBtn) clearBtn.addEventListener('click', () => alertCenter.clearAll());

  document.querySelectorAll('a[href="interfaces.html"], a[href="traffic.html"], a[href="device.html"]').forEach((a) => {
    const url = new URL(a.href);
    url.searchParams.set('device', deviceId);
    a.href = url.toString();
  });
});
