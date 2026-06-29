/* ============================================================
   NETMON — interfaces.js (real-data version)
   Same InterfaceTable class shape as before (dynamic rendering,
   search, sort, filter) but now fed by real RX/TX Mbps computed
   server-side from actual SNMP counter deltas.
   ============================================================ */

class InterfaceTable {
  constructor(tbodyEl, footEl, deviceId) {
    this.tbodyEl = tbodyEl;
    this.footEl = footEl;
    this.deviceId = deviceId;
    this.data = [];
    this.searchTerm = '';
    this.statusFilter = 'all';
    this.sortKey = 'id';
    this.sortDir = 'asc';
  }

  _getIgnoredSet() {
    const all = Storage.get(Storage.KEYS.IGNORED_INTERFACES, {});
    return new Set(all[this.deviceId] || []);
  }

  _toggleIgnored(ifaceId) {
    const all = Storage.get(Storage.KEYS.IGNORED_INTERFACES, {});
    const current = new Set(all[this.deviceId] || []);
    if (current.has(ifaceId)) {
      current.delete(ifaceId);
      Utils.toast(`Alerts re-enabled for ${ifaceId}.`, 'info');
    } else {
      current.add(ifaceId);
      Utils.toast(`Alerts muted for ${ifaceId}. It won't trigger "interface down" alerts anymore.`, 'info');
    }
    all[this.deviceId] = Array.from(current);
    Storage.set(Storage.KEYS.IGNORED_INTERFACES, all);
    this.render();
  }

  setData(interfaces) {
    this.data = interfaces;
    this.render();
  }

  setSearch(term) {
    this.searchTerm = term.trim().toLowerCase();
    this.render();
  }

  setFilter(filter) {
    this.statusFilter = filter;
    this.render();
  }

  setSort(key) {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = 'asc';
    }
    this.render();
  }

  _getFiltered() {
    return this.data
      .filter((i) => (this.statusFilter === 'all' ? true : i.status === this.statusFilter))
      .filter((i) => (this.searchTerm ? i.id.toLowerCase().includes(this.searchTerm) : true));
  }

  _getSorted(rows) {
    return [...rows].sort((a, b) => {
      let av = a[this.sortKey];
      let bv = b[this.sortKey];
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return this.sortDir === 'asc' ? -1 : 1;
      if (av > bv) return this.sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  render() {
    const rows = this._getSorted(this._getFiltered());
    const ignored = this._getIgnoredSet();

    if (this.data.length === 0) {
      this.tbodyEl.innerHTML = `
        <tr><td colspan="5" style="padding:0;">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2v4m0 12v4m10-10h-4M6 12H2"/></svg>
            <div class="empty-title">Waiting for first poll…</div>
            <div class="empty-sub">Interface data will appear here once the backend completes its first SNMP poll of this device.</div>
          </div>
        </td></tr>`;
    } else if (rows.length === 0) {
      this.tbodyEl.innerHTML = `
        <tr><td colspan="5" style="padding:0;">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 17a4 4 0 100-8 4 4 0 000 8zM21 21l-4.35-4.35"/></svg>
            <div class="empty-title">No interfaces match</div>
            <div class="empty-sub">Try a different search term or clear the active filter.</div>
          </div>
        </td></tr>`;
    } else {
      this.tbodyEl.innerHTML = rows.map((iface) => {
        const isIgnored = ignored.has(iface.id);
        return `
        <tr class="${iface.status === 'offline' ? 'iface-row-offline' : ''}">
          <td class="iface-name">${Utils.escapeHtml(iface.id)}</td>
          <td><span class="tag ${iface.status === 'online' ? 'tag-good' : 'tag-crit'}">${iface.status}</span></td>
          <td class="num-cell col-optional">${iface.rx} Mbps</td>
          <td class="num-cell col-optional">${iface.tx} Mbps</td>
          <td>
            <button class="iface-mute-btn ${isIgnored ? 'muted' : ''}" data-toggle-ignore="${Utils.escapeHtml(iface.id)}" title="${isIgnored ? 'Alerts muted — click to re-enable' : 'Mute down-alerts for this interface'}">
              ${isIgnored
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v3M8 22h8M1 1l22 22"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 9v3a3 3 0 003 3 3 3 0 003-3V9a3 3 0 10-6 0z"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/></svg>'}
              ${isIgnored ? 'Muted' : ''}
            </button>
          </td>
        </tr>
      `;
      }).join('');

      this.tbodyEl.querySelectorAll('[data-toggle-ignore]').forEach((btn) => {
        btn.addEventListener('click', () => this._toggleIgnored(btn.dataset.toggleIgnore));
      });
    }

    if (this.footEl) {
      const total = this.data.length;
      const shown = rows.length;
      const onlineCount = this.data.filter((i) => i.status === 'online').length;
      this.footEl.innerHTML = total === 0 ? '' : `
        <span>Showing ${shown} of ${total} interfaces</span>
        <span>${onlineCount} online · ${total - onlineCount} offline</span>
      `;
    }

    document.querySelectorAll('[data-sort-key]').forEach((th) => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.sortKey === this.sortKey) {
        th.classList.add(this.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const deviceId = params.get('device');
  if (!deviceId) { window.location.href = 'fleet.html'; return; }

  const tbody = document.getElementById('interface-tbody');
  const foot = document.getElementById('interface-table-foot');
  if (!tbody) return;

  const table = new InterfaceTable(tbody, foot, deviceId);
  table.render();

  const searchInput = document.getElementById('interface-search');
  if (searchInput) {
    searchInput.addEventListener('input', Utils.debounce((e) => table.setSearch(e.target.value), 150));
  }

  document.querySelectorAll('[data-filter]').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      table.setFilter(pill.dataset.filter);
    });
  });

  document.querySelectorAll('[data-sort-key]').forEach((th) => {
    th.addEventListener('click', () => table.setSort(th.dataset.sortKey));
  });

  const deviceNameEl = document.querySelector('.device-identity .name');
  const deviceIpEl = document.querySelector('.device-identity .ip');
  const pageTitleEl = document.querySelector('.page-title');

  async function tick() {
    try {
      const snap = await Api.getDeviceDetail(deviceId);
      if (deviceNameEl) deviceNameEl.textContent = snap.name;
      if (deviceIpEl) deviceIpEl.textContent = snap.ip;
      if (pageTitleEl) pageTitleEl.textContent = `${snap.name} — Interfaces`;
      table.setData(snap.interfaces || []);
      Utils.hideBackendErrorBanner();
    } catch (err) {
      Utils.showBackendErrorBanner(`Can't reach the NETMON backend at ${Api.API_BASE_URL} — ${err.message}.`);
    }
    Utils.hidePageLoader();
  }

  tick();
  setInterval(tick, 3000);

  document.querySelectorAll('a[href="dashboard.html"], a[href="device.html"], a[href="traffic.html"]').forEach((a) => {
    const url = new URL(a.href);
    url.searchParams.set('device', deviceId);
    a.href = url.toString();
  });
});
