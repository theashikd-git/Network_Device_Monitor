/* ============================================================
   NETMON SERVER — device-store.js
   Reads and writes devices.json safely. Writes go to a temp
   file first, then rename over the original — this means a
   crash or power loss mid-save can't leave devices.json half
   written / corrupted, which a naive overwrite could.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'devices.json');

function load() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { pollIntervalMs: 3000, devices: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return {
      pollIntervalMs: parsed.pollIntervalMs || 3000,
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
    };
  } catch (err) {
    throw new Error(`devices.json is not valid JSON (${err.message}). Fix or restore it before adding devices through the page.`);
  }
}

/** Persist the full device list, preserving the helpful comment fields. */
function save(devicesConfig) {
  const payload = {
    _readme: "Devices can be added/removed from the Settings page in the app, or edited here directly. If you edit this file by hand while the server is running, restart the server to pick up the change.",
    pollIntervalMs: devicesConfig.pollIntervalMs || 3000,
    devices: devicesConfig.devices,
  };
  const tmpPath = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
  fs.renameSync(tmpPath, CONFIG_PATH); // atomic on the same filesystem
}

module.exports = { load, save, CONFIG_PATH };
