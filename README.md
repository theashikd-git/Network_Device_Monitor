# NETMON — Network Device Monitoring Dashboard

A self-hosted dashboard for monitoring routers and switches (MikroTik, Cisco, TP-Link, Ubiquiti, and most other SNMP-capable devices) in real time, CPU, memory, uptime, interface status, and live traffic, with automatic threshold alerts.

Built with plain HTML/CSS/JavaScript on the frontend and Node.js + SNMP on the backend. No database, no cloud dependency, runs entirely on your own machine or LAN.

## Features

- **Live fleet overview** — see every monitored device's status at a glance
- **Per-device dashboard** — CPU, memory, uptime, and online/offline status, updated every 3 seconds
- **Interface table** — real RX/TX throughput per port, computed from actual SNMP counters (not estimated)
- **Traffic graphs** — CPU/memory history charts
- **Smart alerts** — fires once when something goes wrong (not repeatedly every poll), with a mute option per interface for ports you know are intentionally unused
- **Add devices from the UI** — a Settings page with a "Test Connection" button before saving, no manual config file editing required
- **Dark/light theme**, responsive layout, no external services or accounts needed

## Requirements

- [Node.js](https://nodejs.org) (v18 or newer recommended)
- One or more SNMP-capable network devices, with SNMP enabled (see SETUP.md)

## Quick start

```bash
git clone https://github.com/YOUR-USERNAME/netmon-snmp-dashboard.git
cd netmon-snmp-dashboard
npm install
npm start
```

Then open **http://localhost:4000** in your browser. Log in with any username and password (4+ characters, this is a local demo login, not a real account system).

You'll land on the Fleet Overview page with **zero devices configured**, that's the normal starting state. Click **Settings** in the sidebar to add your first device.

## Adding a device

1. Enable SNMP on the device first, see SETUP.md for exact steps per brand (MikroTik, Cisco, TP-Link, Ubiquiti).
2. In the dashboard, go to **Settings**.
3. Fill in the device's name, ID, IP, vendor, and SNMP community string.
4. Click **Test Connection** to confirm it works before saving.
5. Click **Add Device**, monitoring starts immediately, no restart needed.

## Project structure

```
├── index.js            Backend entry point (Express + SNMP polling)
├── poll-manager.js      Schedules polling, computes traffic rates
├── snmp-poller.js        Talks to devices over SNMP
├── device-store.js        Reads/writes devices.json safely
├── devices.json             Your device list (gitignored, see below)
├── SETUP.md                  SNMP setup guide per vendor
└── public/                    Frontend (HTML/CSS/JS, served by the backend)
```

## A note on devices.json

This file holds your real device IPs and SNMP community strings, so it's excluded from version control via `.gitignore`, it will not be in this repository. A `devices.example.json` is included as a template; copy it to `devices.json` and fill in your real values to get started.

## What's simulated vs real

Everything except the login system is real, live data read directly from your devices over SNMP. The login is a simple local gate (Local Storage-based), not a multi-user account system, fine for personal/home-lab use, not intended for multi-tenant or internet-facing deployment as-is.

## License

MIT, do whatever you'd like with this.
