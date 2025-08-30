const express = require("express");
const os = require("os");
const fs = require("fs");
const { execSync } = require("child_process");
const vpnService = require("../services/vpnService");

const router = express.Router();

/* ---------- Helpers ---------- */
function readNetTotals() {
  try {
    const raw = fs.readFileSync("/proc/net/dev", "utf8");
    let rx = 0, tx = 0;
    raw.split("\n").forEach(line => {
      const [ifc, rest] = line.split(":");
      if (!rest) return;
      const nums = rest.trim().split(/\s+/).map(Number);
      if (nums.length >= 16) {
        rx += nums[0] || 0;   // rx_bytes
        tx += nums[8] || 0;   // tx_bytes
      }
    });
    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

function readDisk() {
  try {
    const out = execSync("df -kP /").toString().trim().split("\n");
    if (out.length >= 2) {
      const cols = out[1].split(/\s+/);
      const total = Number(cols[1]) * 1024;
      const used  = Number(cols[2]) * 1024;
      const free  = Number(cols[3]) * 1024;
      const pct   = total > 0 ? Math.round((used / total) * 100) : 0;
      return { total, used, free, pct };
    }
  } catch {}
  return { total: 0, used: 0, free: 0, pct: 0 };
}

/* ---------- Sampler (5s) untuk RATE ---------- */
let LAST = null; // { t, rx, tx }
const RATE_HISTORY = []; // { t, rx_bps, tx_bps }
const MAX_POINTS = 600;  // ~50 menit @5s

function sampleRate() {
  const now = Date.now();
  const tot = readNetTotals(); // bytes total
  if (!LAST) {
    LAST = { t: now, rx: tot.rx, tx: tot.tx };
    return { rx_bps: 0, tx_bps: 0, totals: tot };
  }
  const dt = (now - LAST.t) / 1000; // detik
  let dRx = tot.rx - LAST.rx;
  let dTx = tot.tx - LAST.tx;
  // handle reset/overflow
  if (dRx < 0) dRx = 0;
  if (dTx < 0) dTx = 0;
  const rx_bps = dt > 0 ? Math.round((dRx * 8) / dt) : 0; // bits/s
  const tx_bps = dt > 0 ? Math.round((dTx * 8) / dt) : 0;

  LAST = { t: now, rx: tot.rx, tx: tot.tx };

  RATE_HISTORY.push({ t: now, rx_bps, tx_bps });
  while (RATE_HISTORY.length > MAX_POINTS) RATE_HISTORY.shift();

  return { rx_bps, tx_bps, totals: tot };
}

// inisialisasi & interval
sampleRate();
setInterval(sampleRate, 5000);

/* ---------- Route ---------- */
router.get("/", async (req, res) => {
  try {
    // ambil snapshot rate terbaru (juga mengembalikan totals)
    const snap = sampleRate();

    const uptimeSystem = Math.round(os.uptime());
    const loadavg = os.loadavg();
    const cpus = os.cpus()?.length || 1;

    const freemem = os.freemem();
    const totalmem = os.totalmem();
    const memory = totalmem > 0 ? Math.round(100 - (freemem / totalmem) * 100) : 0;

    const disk = readDisk();

    // users/sessions
    const [usersList, sessionsRaw] = await Promise.all([
      vpnService.listUsers().catch(() => []),
      vpnService.sessionListRaw().catch(() => ""),
    ]);
    const nameSet = new Set((Array.isArray(usersList) ? usersList : []).map(u => u && u.name).filter(Boolean));
    const totalUsers = nameSet.size;

    let onlineUsers = 0;
    if (sessionsRaw) {
      const sessions = vpnService.parseSessionList(sessionsRaw);
      const onlineSet = new Set();
      for (const s of sessions) {
        const u = (s["User Name"] || s.user || s.name || "").trim();
        if (u && u.toLowerCase() !== "securenat") onlineSet.add(u);
      }
      onlineUsers = onlineSet.size;
    }
    const offlineUsers = Math.max(0, totalUsers - onlineUsers);

    res.json({
      // kompat lama
      uptime: uptimeSystem,
      loadavg, freemem, totalmem, cpus,
      timestamp: new Date().toISOString(),

      // baru
      uptimeSystem,
      memory,
      disk,

      net: {
        // rate sekarang (bits/s)
        rx_bps: snap.rx_bps,
        tx_bps: snap.tx_bps,

        // total bytes kumulatif (kalau perlu)
        rx_total: snap.totals.rx,
        tx_total: snap.totals.tx,

        // riwayat rate (bukan total)
        history: RATE_HISTORY.slice(-288) // ~24 menit terakhir @5s
      },

      users: { total: totalUsers, online: onlineUsers, offline: offlineUsers },
      totalUsers, onlineUsers, offlineUsers,
    });
  } catch (e) {
    res.status(503).json({ success: false, error: e.message || String(e) });
  }
});

module.exports = router;
