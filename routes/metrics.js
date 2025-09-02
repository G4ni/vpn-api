// routes/metrics.js
const express = require('express');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const router = express.Router();

// Ambil vpnService (nama fungsi bisa beda antar repo, jadi kita adaptif)
const vpnService = require('../services/vpnService');

// ---------- Helpers: pemanggil adaptif ke vpnService ----------
async function callListUsers() {
  const fn =
    vpnService.listUsers ||
    vpnService.userList ||
    vpnService.UserList ||
    vpnService.getUsers;
  if (!fn) return [];
  const out = await fn();
  // normalisasi: array of objects
  if (Array.isArray(out)) return out;
  if (out && Array.isArray(out.users)) return out.users;
  return [];
}

async function callListSessions() {
  const fn =
    vpnService.listSessions ||
    vpnService.sessionList ||
    vpnService.SessionList ||
    vpnService.getSessions;
  if (!fn) return [];
  const out = await fn();
  if (Array.isArray(out)) return out;
  if (out && Array.isArray(out.sessions)) return out.sessions;
  return [];
}

// ---------- CPU usage via /proc/stat delta ----------
let lastCpuTimes = null;
function readProcStat() {
  // baris pertama 'cpu  user nice system idle iowait irq softirq steal guest guest_nice'
  const text = fs.readFileSync('/proc/stat', 'utf8');
  const line = text.split('\n')[0];
  const parts = line.trim().split(/\s+/).slice(1).map(n => Number(n) || 0);
  const [user, nice, system, idle, iowait, irq, softirq, steal] = parts;
  const idleTotal = idle + iowait;
  const nonIdle = user + nice + system + irq + softirq + steal;
  const total = idleTotal + nonIdle;
  return { idleTotal, total };
}

function sampleCpuPercent() {
  try {
    const cur = readProcStat();
    if (!lastCpuTimes) {
      lastCpuTimes = cur;
      return 0; // first sample
    }
    const totald = cur.total - lastCpuTimes.total;
    const idled = cur.idleTotal - lastCpuTimes.idleTotal;
    lastCpuTimes = cur;
    if (totald <= 0) return 0;
    const usage = (1 - idled / totald) * 100;
    // clamp
    return Math.max(0, Math.min(100, usage));
  } catch {
    // fallback loadavg
    const load1 = os.loadavg()[0];
    const cores = os.cpus()?.length || 1;
    return Math.max(0, Math.min(100, (load1 / cores) * 100));
  }
}

// ---------- Mem ----------
function getMem() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const percent = (used / total) * 100;
  return {
    percent: +percent.toFixed(2),
    usedGb: +(used / 1_000_000_000).toFixed(2),
    totalGb: +(total / 1_000_000_000).toFixed(2),
  };
}

// ---------- Disk (root filesystem) ----------
function getDisk() {
  try {
    // gunakan df -k / untuk cross-distro
    const out = execSync('df -k /').toString().split('\n')[1].trim().split(/\s+/);
    const blocks = Number(out[1]) || 0; // 1K-blocks
    const used = Number(out[2]) || 0;
    const totalBytes = blocks * 1024;
    const usedBytes = used * 1024;
    const percent = totalBytes ? (usedBytes / totalBytes) * 100 : 0;
    return {
      percent: +percent.toFixed(2),
      usedGb: +(usedBytes / 1_000_000_000).toFixed(2),
      totalGb: +(totalBytes / 1_000_000_000).toFixed(2),
    };
  } catch {
    return { percent: 0, usedGb: 0, totalGb: 0 };
  }
}

// ---------- Net totals & rates dari /proc/net/dev ----------
let lastNet = null;

function readProcNetDevTotals() {
  const text = fs.readFileSync('/proc/net/dev', 'utf8');
  let rx = 0, tx = 0;
  for (const line of text.split('\n').slice(2)) {
    if (!line.trim()) continue;
    const [ifacePart, rest] = line.split(':');
    const iface = (ifacePart || '').trim();
    if (!iface || iface === 'lo') continue; // skip loopback
    const cols = (rest || '').trim().split(/\s+/).map(n => Number(n) || 0);
    // urutan rx: bytes packets errs drop fifo frame compressed multicast
    // urutan tx: bytes packets errs drop fifo colls carrier compressed
    rx += (cols[0] || 0);
    tx += (cols[8] || 0);
  }
  return { rxBytesTotal: rx, txBytesTotal: tx };
}

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

// ---------- Uptime ----------
function getUptime() {
  return {
    osUptimeSeconds: Math.floor(os.uptime()),
    softEtherUptimeSeconds: null, // opsional: bisa diisi dari CLI vpncmd jika mau
  };
}

// ---------- Username sanitizer (exclude securenat) ----------
function normUser(u) {
  if (!u) return '';
  let s = String(u).trim().toLowerCase();
  s = s.replace(/@.*$/i, '');   // user@hub -> user
  s = s.replace(/[\\/].*$/i, ''); // DOMAIN\user atau user/... -> user/domain
  if (s === 'securenat') return ''; // EXCLUDE
  return s;
}

// ---------- Route ----------
router.get('/', async (req, res) => {
  const tsStart = Date.now();
  try {
    // CPU sample dulu agar delta valid
    const cpuPercent = sampleCpuPercent();

    // Paralel: users & sessions
    const [usersArr, sessionsArr] = await Promise.all([
      callListUsers(),
      callListSessions(),
    ]);

    const totalUsers = Array.isArray(usersArr) ? usersArr.length : 0;

    const onlineSet = new Set(
      (Array.isArray(sessionsArr) ? sessionsArr : [])
        .map(s => normUser(s?.username || s?.UserName || s?.user || s?.User || s?.['User Name']))
        .filter(Boolean)
    );

    const online = onlineSet.size;
    const offline = Math.max(0, totalUsers - online);

    const mem = getMem();
    const disk = getDisk();
    const net = sampleNet();
    const uptime = getUptime();

    res.json({
      success: true,
      cpu: { percent: +cpuPercent.toFixed(2) },
      mem,
      disk,
      net, // { rxBps, txBps, rxBytesTotal, txBytesTotal, ts }
      uptime,
      users: { total: totalUsers, online, offline },
      ts: Date.now(),
      lastError: null,
      lastRefreshTs: Date.now(),
      durationMs: Date.now() - tsStart,
    });
  } catch (err) {
    console.error('metrics error:', err?.stack || err);
    res.status(503).json({
      success: false,
      message: 'metrics_unavailable',
      ts: Date.now(),
      error: String(err && err.message || err),
    });
  }
});

module.exports = router;
