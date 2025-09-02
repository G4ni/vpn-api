// services/metricsPoller.js
const os = require('os');
const cp = require('child_process');
const fs = require('fs');

// ==== helpers ====
const bytesToGb = (b) => Math.round((b / (1024 ** 3)) * 100) / 100;

async function getCpuPercentQuick() {
  const read = () => {
    const line = fs.readFileSync('/proc/stat','utf8').split('\n')[0]; // "cpu  ..."
    const nums = line.trim().split(/\s+/).slice(1).map(n => Number(n)||0);
    // urutan: user nice system idle iowait irq softirq steal guest guest_nice
    const [user,nice,system,idle,iowait,irq,softirq,steal] = nums;
    const Idle = idle + iowait;
    const NonIdle = user + nice + system + irq + softirq + steal;
    const Total = Idle + NonIdle;
    return { Idle, Total };
  };
  
  const a = read();
  await new Promise(r => setTimeout(r, 250)); // 250ms cukup, tidak berat
  const b = read();

  const totald = b.Total - a.Total;
  const idled  = b.Idle  - a.Idle;

  let percent = 0;
  if (totald > 0) percent = (1 - idled / totald) * 100;

  // normalisasi dan pembulatan 2 desimal
  percent = Math.max(0, Math.min(100, Math.round(percent * 100) / 100));
  return { percent };
}

async function getMemUsage() {
  const total = os.totalmem(), free = os.freemem();
  const used = Math.max(0, total - free);
  const percent = total ? Math.round((used / total) * 10000) / 100 : 0;
  return { percent, usedGb: bytesToGb(used), totalGb: bytesToGb(total) };
}

async function getDiskUsage() {
  try {
    const out = cp.execSync('df -kP /', { encoding: 'utf8' }).trim().split('\n')[1];
    const cols = out.trim().split(/\s+/);
    const totalKb = Number(cols[1]) || 0;
    const usedKb  = Number(cols[2]) || 0;
    const percent = totalKb ? Math.round((usedKb / totalKb) * 10000) / 100 : 0;
    return { percent, usedGb: Math.round((usedKb/1024/1024)*100)/100, totalGb: Math.round((totalKb/1024/1024)*100)/100 };
  } catch {
    return { percent: 0, usedGb: 0, totalGb: 0 };
  }
}


function readProcNetDevTotals() {
  // /proc/net/dev berisi akumulasi byte sejak boot per-interface
  const text = fs.readFileSync('/proc/net/dev', 'utf8');
  let rx = 0, tx = 0;
  for (const line of text.split('\n').slice(2)) {
    if (!line.trim()) continue;
    const [ifacePart, rest] = line.split(':');
    const iface = ifacePart.trim();
    if (!iface || iface === 'lo') continue; // skip loopback
    const cols = rest.trim().split(/\s+/).map(n => Number(n) || 0);
    // urutan rx: bytes packets errs drop fifo frame compressed multicast
    // urutan tx: bytes packets errs drop fifo colls carrier compressed
    rx += cols[0];
    tx += cols[8];
  }
  return { rxBytesTotal: rx, txBytesTotal: tx };
}

let lastNet = null;
function sampleNet() {
  const now = Date.now();
  const totals = readProcNetDevTotals();
  if (!lastNet) {
    lastNet = { ...totals, ts: now };
    return { rxBps: 0, txBps: 0, ...totals, ts: now };
  }
  const dt = Math.max(1, (now - lastNet.ts) / 1000);
  const rxBps = (totals.rxBytesTotal - lastNet.rxBytesTotal) / dt;
  const txBps = (totals.txBytesTotal - lastNet.txBytesTotal) / dt;
  lastNet = { ...totals, ts: now };
  return { rxBps, txBps, ...totals, ts: now };
}

// panggil sampleNet() di loop/poller kamu dan taruh ke payload /metrics sebagai:
// net: { rxBps, txBps, rxBytesTotal, txBytesTotal, ts }


function makeSafeTimeout(promise, ms, label) {
  let to;
  const timeout = new Promise((_, rej) => (to = setTimeout(() => rej(new Error(`${label||'op'}_timeout`)), ms)));
  return Promise.race([promise.finally(() => clearTimeout(to)), timeout]);
}

// ===== SoftEther helpers (optional) =====
function tryRequireVpnService() {
  try { const inst = require('./instances'); if (inst?.vpnService) return inst.vpnService; } catch {}
  try { const svc = require('./vpnService'); if (svc?.vpnService) return svc.vpnService; } catch {}
  return null;
}

// ===== Poller state =====
const state = {
  lastGood: {
    success: true,
    cpu: { percent: 0 },
    mem: { percent: 0, usedGb: 0, totalGb: 0 },
    disk: { percent: 0, usedGb: 0, totalGb: 0 },
    net: { rxBps: 0, txBps: 0, ts: Date.now() },
    uptime: { osUptimeSeconds: Math.floor(os.uptime()), softEtherUptimeSeconds: null },
    users: { total: 0, online: 0, offline: 0 },
    ts: Date.now(),
  },
  prevNet: { ts: 0, rx: 0, tx: 0 },
  lastError: null,
  lastRefreshTs: 0,
};

async function refreshOnce() {
  const start = Date.now();

  // System metrics
  const [cpu, mem, disk] = await Promise.all([
    getCpuPercentQuick(),
    getMemUsage(),
    getDiskUsage(),
  ]);

  // Net rates
  const { rx, tx } = readNetTotals();
  let rxBps = 0, txBps = 0, ts = Date.now();
  if (state.prevNet.ts) {
    const dt = (ts - state.prevNet.ts) / 1000;
    if (dt > 0) {
      rxBps = Math.max(0, (rx - state.prevNet.rx) / dt);
      txBps = Math.max(0, (tx - state.prevNet.tx) / dt);
    }
  }
  state.prevNet = { ts, rx, tx };

  // SoftEther (best-effort, 1200ms timeout masing-masing)
  let users = state.lastGood.users;
  let softEtherUptimeSeconds = state.lastGood.uptime.softEtherUptimeSeconds;
  const vpnService = tryRequireVpnService();
  if (vpnService) {
  try {
    const [counts, hub] = await Promise.all([
      makeSafeTimeout(
        vpnService.getUserAndSessionCounts({ exclude: ['serveradmin'] }),
        SE_TIMEOUT_MS,
        'counts'
      ),
      makeSafeTimeout(
        vpnService.hubInfo(),
        SE_TIMEOUT_MS,
        'hubInfo'
      ),
    ]);
    if (counts?.total != null) users = counts;
    if (hub?.softEtherUptimeSeconds != null) softEtherUptimeSeconds = hub.softEtherUptimeSeconds;
  } catch (e) {
    // keep lastGood if timeout/error
  }
}

  state.lastGood = {
    success: true,
    cpu, mem, disk,
    net: { rxBps, txBps, ts },
    uptime: { osUptimeSeconds: Math.floor(os.uptime()), softEtherUptimeSeconds },
    users,
    ts: Date.now(),
  };
  state.lastError = null;
  state.lastRefreshTs = Date.now();

  // Hindari refresh terlalu rapat—biar stabil
  const elapsed = Date.now() - start;
  return elapsed;
}

function startPoller(intervalMs = POLL_MS) {
  refreshOnce().catch(e => { state.lastError = e?.message || 'refresh_failed'; });
  setInterval(() => {
    refreshOnce().catch(e => { state.lastError = e?.message || 'refresh_failed'; });
  }, intervalMs);
}

function getSnapshot() {
  // Kembalikan lastGood saja; cepat & tidak pernah throw
  return { ...state.lastGood, lastError: state.lastError, lastRefreshTs: state.lastRefreshTs };
}

module.exports = { startPoller, getSnapshot };
