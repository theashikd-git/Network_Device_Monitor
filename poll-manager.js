/* ============================================================
   NETMON SERVER — poll-manager.js
   Runs the poll loop for every configured device, keeps the
   latest snapshot in memory, and converts SNMP's cumulative
   octet counters into real instantaneous Mbps by diffing against
   the previous poll (this is how real-world SNMP traffic graphs
   are always built — there is no "current rate" OID, only totals).
   ============================================================ */

const { pollDevice } = require('./snmp-poller');

class PollManager {
  constructor(devicesConfig) {
    this.devices = devicesConfig.devices;
    this.intervalMs = devicesConfig.pollIntervalMs || 3000;
    this.latest = new Map();
    this.prevCounters = new Map();
    this.history = new Map();
    this._inFlight = new Set(); // device IDs currently being polled
    this._timer = null;
  }

  start() {
    this.devices.forEach((d) => this._pollOne(d));
    this._timer = setInterval(() => {
      this.devices.forEach((d) => this._pollOne(d));
    }, this.intervalMs);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }

  /**
   * Add a device to the live poll loop immediately — no restart needed.
   * Assumes the caller has already persisted it to devices.json; this
   * only affects in-memory polling state.
   */
  addDevice(device) {
    this.devices.push(device);
    this._pollOne(device); // poll it right away rather than waiting for the next tick
  }

  /** Remove a device from the live poll loop and clear its cached state. */
  removeDevice(deviceId) {
    this.devices = this.devices.filter((d) => d.id !== deviceId);
    this.latest.delete(deviceId);
    this.prevCounters.delete(deviceId);
    this.history.delete(deviceId);
  }

  hasDevice(deviceId) {
    return this.devices.some((d) => d.id === deviceId);
  }

  async _pollOne(device) {
    if (this._inFlight.has(device.id)) return; // previous poll for this device hasn't finished
    this._inFlight.add(device.id);
    try {
      const snapshot = await pollDevice(device);
      const withRates = this._computeRates(device.id, snapshot);
      this.latest.set(device.id, { ...withRates, name: device.name, vendor: device.vendor, type: device.type, ip: device.ip });
      this._pushHistory(device.id, withRates);
    } catch (err) {
      const prev = this.latest.get(device.id);
      this.latest.set(device.id, {
        id: device.id,
        name: device.name,
        vendor: device.vendor,
        type: device.type,
        ip: device.ip,
        online: false,
        error: err.message,
        interfaces: prev ? prev.interfaces.map((i) => ({ ...i, status: 'offline' })) : [],
        cpuPercent: null,
        memoryPercent: null,
        uptimeSeconds: 0,
        polledAt: Date.now(),
      });
    } finally {
      this._inFlight.delete(device.id);
    }
  }

  _computeRates(deviceId, snapshot) {
    const prevSet = this.prevCounters.get(deviceId) || {};
    const nextSet = {};
    const now = snapshot.polledAt;

    const interfacesWithRates = snapshot.interfaces.map((iface) => {
      const prev = prevSet[iface.id];
      let rxMbps = 0, txMbps = 0;
      if (prev) {
        const dtSeconds = (now - prev.ts) / 1000;
        if (dtSeconds > 0) {
          const inDelta = Math.max(0, iface.inOctets - prev.inOctets);
          const outDelta = Math.max(0, iface.outOctets - prev.outOctets);
          rxMbps = (inDelta * 8) / dtSeconds / 1000000;
          txMbps = (outDelta * 8) / dtSeconds / 1000000;
        }
      }
      nextSet[iface.id] = { inOctets: iface.inOctets, outOctets: iface.outOctets, ts: now };
      return {
        id: iface.id,
        status: iface.status,
        rx: Math.round(rxMbps * 10) / 10,
        tx: Math.round(txMbps * 10) / 10,
      };
    });

    this.prevCounters.set(deviceId, nextSet);
    return { ...snapshot, interfaces: interfacesWithRates };
  }

  _pushHistory(deviceId, snapshot) {
    const hist = this.history.get(deviceId) || [];
    hist.push({ cpu: snapshot.cpuPercent, memory: snapshot.memoryPercent, ts: snapshot.polledAt });
    while (hist.length > 60) hist.shift();
    this.history.set(deviceId, hist);
  }

  getFleetSummary() {
    return this.devices.map((d) => {
      const snap = this.latest.get(d.id);
      if (!snap) return { id: d.id, name: d.name, type: d.type, ip: d.ip, online: false, pending: true };
      const onlineIfaces = (snap.interfaces || []).filter((i) => i.status === 'online').length;
      return {
        id: snap.id,
        name: snap.name,
        type: snap.type,
        ip: snap.ip,
        online: snap.online,
        cpuPercent: snap.cpuPercent,
        memoryPercent: snap.memoryPercent,
        uptimeSeconds: snap.uptimeSeconds,
        interfaceCount: (snap.interfaces || []).length,
        interfacesOnline: onlineIfaces,
        error: snap.error || null,
        polledAt: snap.polledAt,
      };
    });
  }

  getDeviceDetail(deviceId) {
    const snap = this.latest.get(deviceId);
    if (!snap) return null;
    return { ...snap, history: this.history.get(deviceId) || [] };
  }
}

module.exports = { PollManager };
