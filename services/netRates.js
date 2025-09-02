// services/netRates.js
const fs = require('fs');

let prev = { ts: 0, rx: 0, tx: 0 };

function readTotals() {
  const txt = fs.readFileSync('/proc/net/dev', 'utf8');
  let rx = 0, tx = 0;
  txt.split('\n').forEach(line => {
    if (!line.includes(':')) return;
    const [ifn, rest] = line.split(':');
    const name = ifn.trim();
    if (!name || name === 'lo') return;
    const cols = rest.trim().split(/\s+/).map(Number);
    rx += cols[0] || 0;      // rx bytes
    tx += cols[8] || 0;      // tx bytes
  });
  return { rx, tx };
}

function getNetRates() {
  const now = Date.now();
  const { rx, tx } = readTotals();
  if (!prev.ts) {
    prev = { ts: now, rx, tx };
    return { rxBps: 0, txBps: 0, ts: now };
  }
  const dt = (now - prev.ts) / 1000;
  const rxBps = dt > 0 ? Math.max(0, (rx - prev.rx) / dt) : 0;
  const txBps = dt > 0 ? Math.max(0, (tx - prev.tx) / dt) : 0;
  prev = { ts: now, rx, tx };
  return { rxBps, txBps, ts: now };
}

module.exports = { getNetRates };
