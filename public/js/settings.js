/* ============================================================
   NETMON — settings.js
   The Settings / Manage Devices page: lists currently configured
   devices with a remove button, and an Add Device form with a
   Test Connection step before saving. No more manual JSON editing
   needed for normal use.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('device-manage-list');
  const form = document.getElementById('add-device-form');
  const testBtn = document.getElementById('test-connection-btn');
  const addBtn = document.getElementById('add-device-btn');
  const resultEl = document.getElementById('test-connection-result');

  let lastTestedSucceeded = false;

  async function loadDevices() {
    try {
      const devices = await Api.getFleetSummary();
      renderList(devices);
      Utils.hideBackendErrorBanner();
    } catch (err) {
      Utils.showBackendErrorBanner(`Can't reach the NETMON backend — ${err.message}.`);
    }
  }

  function renderList(devices) {
    if (devices.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 11h.01M10 11h.01"/></svg>
          <div class="empty-title">No devices yet</div>
          <div class="empty-sub">Use the form to add your first router or switch.</div>
        </div>`;
      return;
    }
    listEl.innerHTML = devices.map((d) => `
      <div class="device-list-row">
        <div class="device-list-info">
          <span class="device-list-name">${Utils.escapeHtml(d.name)}</span>
          <span class="device-list-meta">${Utils.escapeHtml(d.ip)} · ${d.online ? 'online' : 'offline'}</span>
        </div>
        <button class="device-list-remove" data-remove-id="${Utils.escapeHtml(d.id)}" aria-label="Remove ${Utils.escapeHtml(d.name)}" title="Remove device">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-remove-id]').forEach((btn) => {
      btn.addEventListener('click', () => removeDevice(btn.dataset.removeId, btn));
    });
  }

  async function removeDevice(id, btn) {
    const row = btn.closest('.device-list-row');
    const name = row.querySelector('.device-list-name').textContent;
    if (!window.confirm(`Remove "${name}"? This stops monitoring it immediately. You can add it back later.`)) return;

    btn.disabled = true;
    try {
      const res = await fetch(`${Api.API_BASE_URL}/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      Utils.toast(`${name} removed.`, 'good');
      loadDevices();
    } catch (err) {
      Utils.toast(`Couldn't remove device: ${err.message}`, 'crit');
      btn.disabled = false;
    }
  }

  function setResult(success, message) {
    resultEl.textContent = message;
    resultEl.className = `test-connection-result visible ${success ? 'success' : 'failure'}`;
  }

  function clearResult() {
    resultEl.className = 'test-connection-result';
  }

  function getFormValues() {
    return {
      id: document.getElementById('field-id').value.trim(),
      name: document.getElementById('field-name').value.trim(),
      ip: document.getElementById('field-ip').value.trim(),
      vendor: document.getElementById('field-vendor').value,
      type: document.getElementById('field-type').value,
      snmpVersion: document.getElementById('field-snmp-version').value,
      snmpCommunity: document.getElementById('field-community').value.trim(),
      snmpPort: document.getElementById('field-port').value.trim() || '161',
    };
  }

  function setButtonLoading(btn, loading, idleLabel) {
    btn.disabled = loading;
    btn.innerHTML = loading ? `<span class="btn-spinner"></span> Testing…` : idleLabel;
  }

  testBtn.addEventListener('click', async () => {
    const values = getFormValues();
    if (!values.ip || !values.snmpCommunity) {
      setResult(false, 'Enter at least an IP address and community string before testing.');
      return;
    }
    setButtonLoading(testBtn, true, 'Test Connection');
    clearResult();
    try {
      const res = await fetch(`${Api.API_BASE_URL}/api/devices/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (body.ok) {
        lastTestedSucceeded = true;
        setResult(true, `Connected. Device responded as "${body.sysName}"${body.sysDescr ? ` — ${body.sysDescr}` : ''}.`);
        addBtn.disabled = false;
      } else {
        lastTestedSucceeded = false;
        setResult(false, `Could not connect: ${body.error}. Check the IP, community string, and that SNMP is enabled on the device (see SETUP.md).`);
      }
    } catch (err) {
      lastTestedSucceeded = false;
      setResult(false, `Request failed: ${err.message}`);
    } finally {
      setButtonLoading(testBtn, false, 'Test Connection');
    }
  });

  // Any edit after a successful test invalidates that test — require
  // re-testing rather than letting a stale "success" justify saving
  // different details than what was actually tested.
  form.addEventListener('input', () => {
    if (lastTestedSucceeded) {
      lastTestedSucceeded = false;
      addBtn.disabled = true;
      clearResult();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = getFormValues();

    if (!values.id || !values.name || !values.ip || !values.snmpCommunity) {
      Utils.toast('Fill in ID, name, IP, and community string.', 'warn');
      return;
    }
    if (!/^[a-z0-9-_]+$/i.test(values.id)) {
      Utils.toast('Device ID can only contain letters, numbers, hyphens, and underscores.', 'warn');
      return;
    }

    addBtn.disabled = true;
    addBtn.innerHTML = `<span class="btn-spinner"></span> Adding…`;
    try {
      const res = await fetch(`${Api.API_BASE_URL}/api/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);

      Utils.toast(`${values.name} added, polling started.`, 'good');
      form.reset();
      clearResult();
      lastTestedSucceeded = false;
      loadDevices();
    } catch (err) {
      Utils.toast(`Couldn't add device: ${err.message}`, 'crit');
    } finally {
      addBtn.disabled = !lastTestedSucceeded;
      addBtn.textContent = 'Add Device';
    }
  });

  loadDevices();
  setInterval(loadDevices, 5000);
});
