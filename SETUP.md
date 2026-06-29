# NETMON — Real Device Setup Guide

This backend polls your actual routers/switches over SNMP. Nothing here is
simulated — every number comes from the real device. Follow these steps in
order.

## 1. Enable SNMP on each device

SNMP is usually **off by default** for security. Enable it on each device,
using a community string that isn't the default `public` once you're done
testing (treat it like a read-only password — anyone who has it can read
your device stats).

### MikroTik (RouterOS)

**Winbox / WebFig:** `IP -> SNMP`
- Check **Enabled**
- Under **Communities**, edit the default community or add a new one:
  - Name: your chosen string (e.g. `netmon-ro`)
  - Set **Read Access** on, **Write Access** off
- Click Apply/OK

**Terminal (SSH/console):**
```
/snmp set enabled=yes
/snmp community add name=netmon-ro
```

Verify from another machine on the LAN:
```
snmpget -v2c -c netmon-ro <router-ip> 1.3.6.1.2.1.1.5.0
```
You should get back the router's sysName, not a timeout.

### Cisco IOS / IOS-XE switches

Enter config mode via console or SSH:
```
configure terminal
snmp-server community netmon-ro RO
end
write memory
```
`RO` = read-only, which is all this dashboard needs. Never grant `RW` to a
monitoring community string.

If the switch has an SNMP ACL or management VLAN restriction already
configured, make sure the IP of the machine running this backend is allowed
through it.

### TP-Link managed/smart switches

Web UI path varies by model, but generally: **System Tools -> SNMP** (or
**Maintenance -> SNMP**).
- Enable SNMP
- Set the **Read Community** to your chosen string
- Leave **Write Community** disabled/blank if the option exists

### Ubiquiti (UniFi-managed devices)

If devices are under a UniFi Controller: **Settings -> Services -> SNMP**,
enable and set the community string. This applies it fleet-wide to managed
devices.

For standalone EdgeRouter/EdgeSwitch (not under a controller), it's under
**System -> SNMP Agent** in the web UI, or via the EdgeOS CLI:
```
configure
set service snmp community netmon-ro authorization ro
commit
save
```

### Anything else / unknown vendor

Look for "SNMP" under the device's System, Maintenance, or Services menu.
Almost every managed switch from the last 15 years supports SNMP v2c. If
you can't find the setting, check the model's manual for "SNMP" specifically
rather than guessing.

## 2. Decide where this backend runs

Run it on a machine that's on the **same LAN** as your devices: a Raspberry
Pi, an old laptop, a mini PC, or a VM, anything that stays on. This keeps
SNMP traffic (which has no encryption in v2c) inside your local network
instead of crossing the internet.

You do **not** need to expose SNMP itself to the outside world. If you want
to check the dashboard from outside your LAN later, only the web frontend
needs to be reachable, never forward the SNMP port (161/UDP) through your
firewall.

## 3. Configure devices.json

Open `devices.json` (in this same project folder) and replace each placeholder entry with your real
devices:

```json
{
  "id": "core-router-1",        // any short unique slug, used in URLs
  "name": "Core Router",        // display name on the dashboard
  "ip": "10.0.0.1",             // real device IP
  "vendor": "mikrotik",         // mikrotik | cisco | tplink | ubiquiti | generic
  "type": "router",             // router | switch, just affects the icon shown
  "snmpVersion": "2c",
  "snmpCommunity": "netmon-ro", // the community string you set in step 1
  "snmpPort": 161
}
```

Delete the placeholder entries you don't need, or copy the pattern to add
more. There's no hard limit.

**Quick sanity check before running the server:** from the machine that will
run the backend, test each device with the standard `snmpget` tool (install
via `apt install snmp` on Debian/Ubuntu, or equivalent):
```
snmpget -v2c -c netmon-ro 10.0.0.1 1.3.6.1.2.1.1.5.0
```
If this times out, the dashboard will too. Fix connectivity, the community
string, or the firewall here first, before troubleshooting the app.

## 4. Run the backend

```
npm install
npm start
```

You should see:
```
NETMON server listening on http://localhost:4000
Polling N device(s) every 3000ms
```

Check it's working:
```
curl http://localhost:4000/api/devices
```
Each device should show `"online": true` with real `cpuPercent`,
`uptimeSeconds`, and interface data. If a device shows `"online": false`,
the `"error"` field tells you why (timeout = unreachable or wrong
IP/community string; most other errors mean SNMP responded but rejected the
request).

## 5. Open the dashboard

The same program serves the dashboard webpage itself now — there is no
separate frontend step. Just open **http://localhost:4000** in a browser
on the same computer where the server is running.

If you want to view the dashboard from a *different* computer on your
LAN, find this computer's LAN IP (`ipconfig` on Windows, look for "IPv4
Address") and use that instead, e.g. `http://192.168.1.50:4000`.

## Notes on data accuracy

- **CPU/Memory**: SNMP doesn't standardize these across vendors. MikroTik
  exposes CPU via a vendor-specific OID (used here). Many other switches
  don't expose CPU/memory over SNMP at all. In that case the dashboard will
  correctly show those fields as unavailable for that device rather than
  fabricate a number. Interface stats and uptime, by contrast, are fully
  standardized (IF-MIB) and will work on virtually anything.
- **Traffic rates (Mbps)**: SNMP only exposes cumulative byte counters, not
  a live rate. The backend computes real Mbps by diffing counters between
  polls. This is the same method every real monitoring tool (LibreNMS,
  PRTG, Cacti, etc.) uses under the hood.
- **32-bit counter wraparound**: high-traffic 1Gbps+ interfaces can wrap a
  32-bit counter in under an hour. If you see implausible negative-then-spike
  readings on a very busy link, that interface needs 64-bit counters
  (ifHCInOctets/ifHCOutOctets) — let me know and this can be added.
