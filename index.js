/* ============================================================
   NETMON SERVER — index.js
   One single program that does two jobs:
     1. Polls your real devices over SNMP (same as before)
     2. Serves the dashboard webpage itself (NEW — so you only
        ever need to run ONE thing, in ONE window)

   Run with: npm install, then npm start
   Then open: http://localhost:4000  in any browser

   It is completely fine to start this with ZERO devices
   configured in devices.json — the dashboard will just show
   "no devices yet" until you add one. Nothing crashes.
   ============================================================ */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { PollManager } = require('./poll-manager');
const deviceStore = require('./device-store');
const { testConnection } = require('./snmp-poller');

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');

let devicesConfig;
try {
  devicesConfig = deviceStore.load();
} catch (err) {
  console.error(err.message);
  devicesConfig = { pollIntervalMs: 3000, devices: [] };
}

if (devicesConfig.devices.length === 0) {
  console.log('Starting with 0 devices configured. This is fine — the dashboard will run normally and show "no devices yet".');
}

const poller = new PollManager(devicesConfig);
poller.start();

const app = express();
app.use(cors());
app.use(express.json());

// ---- Serve the dashboard webpage itself ----
// This is what lets you open http://localhost:4000 directly, with no
// second program and no separate web server needed.
app.use(express.static(PUBLIC_DIR));

// ---- API endpoints (unchanged) ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, devicesConfigured: devicesConfig.devices.length, pollIntervalMs: poller.intervalMs });
});

app.get('/api/devices', (req, res) => {
  res.json(poller.getFleetSummary());
});

app.get('/api/devices/:id', (req, res) => {
  const detail = poller.getDeviceDetail(req.params.id);
  if (!detail) {
    return res.status(404).json({ error: `No device with id "${req.params.id}". It may not have completed its first poll yet, or does not exist in devices.json.` });
  }
  res.json(detail);
});

// ---- Device management (used by the Settings page) ----

/** Try an SNMP connection with the given details, without saving anything. */
app.post('/api/devices/test', async (req, res) => {
  const { ip, snmpVersion, snmpCommunity, snmpPort } = req.body || {};
  if (!ip || !snmpCommunity) {
    return res.status(400).json({ ok: false, error: 'ip and snmpCommunity are both required to test a connection.' });
  }
  const result = await testConnection({ ip, snmpVersion, snmpCommunity, snmpPort });
  res.json(result);
});

/** Add a new device: validates, persists to devices.json, starts polling immediately. */
app.post('/api/devices', (req, res) => {
  const { id, name, ip, vendor, type, snmpVersion, snmpCommunity, snmpPort } = req.body || {};

  if (!id || !name || !ip || !snmpCommunity) {
    return res.status(400).json({ error: 'id, name, ip, and snmpCommunity are required.' });
  }
  if (!/^[a-z0-9-_]+$/i.test(id)) {
    return res.status(400).json({ error: 'id can only contain letters, numbers, hyphens, and underscores (no spaces).' });
  }
  if (poller.hasDevice(id)) {
    return res.status(409).json({ error: `A device with id "${id}" already exists. Choose a different id.` });
  }

  const newDevice = {
    id,
    name,
    ip,
    vendor: vendor || 'generic',
    type: type === 'switch' ? 'switch' : 'router',
    snmpVersion: snmpVersion === '1' ? '1' : '2c',
    snmpCommunity,
    snmpPort: Number(snmpPort) || 161,
  };

  try {
    const current = deviceStore.load();
    current.devices.push(newDevice);
    deviceStore.save(current);
  } catch (err) {
    return res.status(500).json({ error: `Could not save devices.json: ${err.message}` });
  }

  poller.addDevice(newDevice);
  res.status(201).json(newDevice);
});

/** Remove a device: persists removal to devices.json, stops polling immediately. */
app.delete('/api/devices/:id', (req, res) => {
  const { id } = req.params;
  if (!poller.hasDevice(id)) {
    return res.status(404).json({ error: `No device with id "${id}".` });
  }

  try {
    const current = deviceStore.load();
    current.devices = current.devices.filter((d) => d.id !== id);
    deviceStore.save(current);
  } catch (err) {
    return res.status(500).json({ error: `Could not save devices.json: ${err.message}` });
  }

  poller.removeDevice(id);
  res.json({ ok: true, removed: id });
});

app.listen(PORT, () => {
  console.log('');
  console.log(`NETMON is running. Open this in your browser:`);
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log(`Polling ${devicesConfig.devices.length} device(s) every ${poller.intervalMs}ms`);
});

process.on('SIGINT', () => {
  poller.stop();
  process.exit(0);
});
