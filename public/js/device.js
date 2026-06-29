/* ============================================================
   NETMON — device.js (real-data version)
   Some fields here are real and read-only (IP, identity string,
   live uptime — all come straight from the device over SNMP).
   Others (a friendly location note, asset tag, etc.) aren't
   something SNMP can give us, so those stay locally editable
   and are layered on top of the real data, keyed by device id.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const deviceId = params.get('device');
  if (!deviceId) { window.location.href = 'fleet.html'; return; }

  const readonlyEl = document.getElementById('device-readonly-fields');
  const editableEl = document.getElementById('device-editable-fields');
  const editBtn = document.getElementById('edit-device-btn');
  const saveBtn = document.getElementById('save-device-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  const exportBtn = document.getElementById('export-json-btn');
  const banner = document.getElementById('save-confirm-banner');
  const pageTitleEl = document.querySelector('.page-title');
  const deviceNameEl = document.querySelector('.device-identity .name');
  const deviceIpEl = document.querySelector('.device-identity .ip');

  const ANNOTATION_KEY = `netmon_annotations_${deviceId}`;
  const EDITABLE_FIELDS = {
    location: 'Location',
    assetTag: 'Asset Tag',
    notes: 'Notes',
  };

  let latestSnapshot = null;
  let annotations = Storage.get(ANNOTATION_KEY, { location: '', assetTag: '', notes: '' });
  let editing = false;

  function renderReadonly(snap) {
    const rows = [
      ['Device Name', snap.name],
      ['IP Address', snap.ip],
      ['Vendor', snap.vendor],
      ['Device Type', snap.type],
      ['Connection', snap.online ? 'Online' : 'Offline'],
      ['Uptime', snap.online ? Utils.formatUptime(snap.uptimeSeconds) : '—'],
      ['Interfaces', `${(snap.interfaces || []).filter((i) => i.status === 'online').length} / ${(snap.interfaces || []).length} online`],
    ];
    readonlyEl.innerHTML = rows.map(([label, value]) => `
      <div class="info-row">
        <span class="info-label">${label}</span>
        <span class="info-value mono">${Utils.escapeHtml(String(value))}</span>
      </div>
    `).join('');
  }

  function renderEditable() {
    editableEl.innerHTML = Object.entries(EDITABLE_FIELDS).map(([key, label]) => `
      <div class="info-row" data-field="${key}">
        <span class="info-label">${label}</span>
        <span class="info-value">${Utils.escapeHtml(annotations[key] || '—')}</span>
        <input class="info-value-input" type="text" value="${Utils.escapeHtml(annotations[key] || '')}" data-field-input="${key}" />
      </div>
    `).join('');
  }

  function setEditing(on) {
    editing = on;
    editableEl.querySelectorAll('.info-row').forEach((row) => row.classList.toggle('editing', on));
    editBtn.style.display = on ? 'none' : '';
    saveBtn.style.display = on ? '' : 'none';
    cancelBtn.style.display = on ? '' : 'none';
  }

  function showSavedBanner() {
    banner.classList.add('visible');
    setTimeout(() => banner.classList.remove('visible'), 2500);
  }

  editBtn.addEventListener('click', () => setEditing(true));
  cancelBtn.addEventListener('click', () => { renderEditable(); setEditing(false); });

  saveBtn.addEventListener('click', () => {
    const updated = { ...annotations };
    editableEl.querySelectorAll('[data-field-input]').forEach((input) => {
      updated[input.dataset.fieldInput] = input.value.trim();
    });
    annotations = updated;
    Storage.set(ANNOTATION_KEY, annotations);
    renderEditable();
    setEditing(false);
    showSavedBanner();
  });

  exportBtn.addEventListener('click', () => {
    if (!latestSnapshot) { Utils.toast('No device data yet, wait for the next poll.', 'warn'); return; }
    const payload = {
      ...latestSnapshot,
      annotations,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(latestSnapshot.name || deviceId).replace(/\s+/g, '_').toLowerCase()}_info.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    Utils.toast('Device info exported as JSON.', 'good');
  });

  async function tick() {
    try {
      const snap = await Api.getDeviceDetail(deviceId);
      latestSnapshot = snap;
      if (deviceNameEl) deviceNameEl.textContent = snap.name;
      if (deviceIpEl) deviceIpEl.textContent = snap.ip;
      if (pageTitleEl) pageTitleEl.textContent = `${snap.name} — Device Info`;
      renderReadonly(snap);
      Utils.hideBackendErrorBanner();
    } catch (err) {
      Utils.showBackendErrorBanner(`Can't reach the NETMON backend at ${Api.API_BASE_URL} — ${err.message}.`);
    }
    Utils.hidePageLoader();
  }

  renderEditable();
  tick();
  setInterval(tick, 3000);

  document.querySelectorAll('a[href="dashboard.html"], a[href="interfaces.html"], a[href="traffic.html"]').forEach((a) => {
    const url = new URL(a.href);
    url.searchParams.set('device', deviceId);
    a.href = url.toString();
  });
});
