/* ============================================================
   NETMON SERVER — snmp-poller.js
   Polls real devices over SNMP using standard MIBs (IF-MIB for
   interfaces/uptime, which works on essentially everything) plus
   a best-effort vendor-specific lookup for CPU/memory, since that
   part of SNMP is NOT standardized across vendors.
   ============================================================ */

const snmp = require('net-snmp');

// ---- Standard OIDs (IF-MIB / SNMPv2-MIB — universal across vendors) ----
const OID = {
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysDescr: '1.3.6.1.2.1.1.1.0',
  ifNumber: '1.3.6.1.2.1.2.1.0',
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',
  ifSpeed: '1.3.6.1.2.1.2.2.1.5',
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',
  hrMemorySize: '1.3.6.1.2.1.25.2.2.0',
  mtxrHlMemoryUsage: '1.3.6.1.4.1.14988.1.1.3.10.0',
  mtxrHlCpuLoad: '1.3.6.1.4.1.14988.1.1.3.14.0',
};

function openSession(device) {
  const version = device.snmpVersion === '1' ? snmp.Version1 : snmp.Version2c;
  return snmp.createSession(device.ip, device.snmpCommunity, {
    port: device.snmpPort || 161,
    version,
    // Keep this well under the poll interval. On a real LAN, SNMP replies
    // come back in single-digit milliseconds — this timeout only matters
    // for genuinely unreachable devices, so it shouldn't eat into the next
    // poll cycle. With pollIntervalMs around 3000, 1500ms + 0 retries means
    // a dead device is detected and reported well before the next tick.
    timeout: 1500,
    retries: 0,
  });
}

function getAsync(session, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, varbinds) => {
      if (error) return reject(error);
      resolve(varbinds);
    });
  });
}

function tableAsync(session, oid) {
  return new Promise((resolve, reject) => {
    session.table(oid, 20, (error, table) => {
      if (error) return reject(error);
      resolve(table);
    });
  });
}

/**
 * Poll a single device. Returns a normalized snapshot, or throws if the
 * device is unreachable (caller should mark it offline rather than crash).
 */
async function pollDevice(device) {
  const session = openSession(device);

  try {
    const sysVarbinds = await getAsync(session, [OID.sysUpTime, OID.sysName]);
    if (snmp.isVarbindError(sysVarbinds[0])) {
      throw new Error(snmp.varbindError(sysVarbinds[0]));
    }
    const uptimeTicks = sysVarbinds[0].value;
    const uptimeSeconds = Math.floor(Number(uptimeTicks) / 100);

    const ifTable = await tableAsync(session, '1.3.6.1.2.1.2.2');
    const interfaces = Object.keys(ifTable).map((idx) => {
      const row = ifTable[idx];
      const descr = (row[2] || `if${idx}`).toString();
      const operStatus = Number(row[8]);
      const inOctets = Number(row[10] || 0);
      const outOctets = Number(row[16] || 0);
      const speedBps = Number(row[5] || 0);
      return {
        id: descr,
        status: operStatus === 1 ? 'online' : 'offline',
        inOctets,
        outOctets,
        speedBps,
      };
    }).filter((i) => !/loopback|lo0/i.test(i.id));

    // ---- CPU: prefer the standard per-core table, average across cores ----
    // On multi-core MikroTik devices (CCR series), the vendor-specific
    // scalar OID (mtxrHlCpuLoad) has been observed returning a sum across
    // all cores rather than a single 0-100% figure (e.g. 1200% on a 12-core
    // router idling at ~1-2% per core). The standard HOST-RESOURCES-MIB
    // per-core table does not have this problem, so it's used as the
    // primary source whenever a device exposes it — which is most devices,
    // MikroTik included. The MikroTik-specific OID is only used as a
    // fallback for devices that don't expose the standard table at all.
    let cpuPercent = null;
    let memoryPercent = null;

    try {
      const cpuTable = await tableAsync(session, '1.3.6.1.2.1.25.3.3');
      const loads = Object.values(cpuTable).map((row) => Number(row[2])).filter((n) => !isNaN(n));
      if (loads.length) cpuPercent = loads.reduce((a, b) => a + b, 0) / loads.length;
    } catch (e) { /* device doesn't expose HOST-RESOURCES-MIB; try vendor fallback below */ }

    if (cpuPercent === null && device.vendor === 'mikrotik') {
      try {
        const vb = await getAsync(session, [OID.mtxrHlCpuLoad, OID.mtxrHlMemoryUsage]);
        if (!snmp.isVarbindError(vb[0])) cpuPercent = Number(vb[0].value);
      } catch (e) { /* neither source available; leave null rather than guess */ }
    }

    return {
      id: device.id,
      online: true,
      uptimeSeconds,
      cpuPercent,
      memoryPercent,
      interfaces,
      polledAt: Date.now(),
    };
  } finally {
    session.close();
  }
}

/**
 * Quick one-off check used by the "Test Connection" button when adding a
 * device through the Settings page. Uses a slightly longer timeout than
 * the recurring poller, since this runs once interactively rather than
 * every few seconds — we can afford to wait a bit longer for a slow or
 * distant device here. Never throws; always resolves with a result object
 * so the API layer can return a clean success/failure response.
 */
async function testConnection(deviceInput) {
  const session = snmp.createSession(deviceInput.ip, deviceInput.snmpCommunity, {
    port: deviceInput.snmpPort || 161,
    version: deviceInput.snmpVersion === '1' ? snmp.Version1 : snmp.Version2c,
    timeout: 3000,
    retries: 0,
  });

  try {
    const varbinds = await getAsync(session, [OID.sysName, OID.sysDescr]);
    if (snmp.isVarbindError(varbinds[0])) {
      return { ok: false, error: snmp.varbindError(varbinds[0]) };
    }
    return {
      ok: true,
      sysName: varbinds[0].value.toString(),
      sysDescr: varbinds[1] ? varbinds[1].value.toString() : null,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    session.close();
  }
}

module.exports = { pollDevice, testConnection, OID };
