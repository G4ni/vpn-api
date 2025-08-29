// routes/metrics.js
const express = require("express");
const os = require("os");
const { exec } = require("child_process");
const fs = require("fs");

const router = express.Router();


// --- Helper: system uptime dari /proc/uptime (detik) ---
function getSystemUptimeSec() {
  try {
    const raw = fs.readFileSync("/proc/uptime", "utf8").trim(); // "12345.67 8910.11"
    const first = raw.split(/\s+/)[0];
    const sec = Math.floor(parseFloat(first));
    return Number.isFinite(sec) ? sec : null;
  } catch {
    return null;
  }
}

// ---- Helper: baca RX/TX dari /proc/net/dev (Linux) ----
function getNetBytes() {
  try {
    const raw = fs.readFileSync("/proc/net/dev", "utf8");
    // Format: Inter-|   Receive                                                |  Transmit
    // face:  bytes packets errs drop fifo frame compressed multicast | bytes ...
    let rx = 0, tx = 0;
    raw.split("\n").forEach(line => {
      if (!line.includes(":")) return;
      const [iface, rest] = line.split(":");
      const cols = rest.trim().split(/\s+/).map(Number);
      // cols[0] = rx_bytes, cols[8] = tx_bytes
      if (cols.length >= 9) {
        rx += cols[0] || 0;
        tx += cols[8] || 0;
      }
    });
    return { rx_bytes: rx, tx_bytes: tx };
  } catch {
    return { rx_bytes: null, tx_bytes: null };
  }
}

// ---- Helper: baca Disk via `df -B1 /` ----
function getDiskUsage(cb) {
  exec(`df -B1 / | awk 'NR==2{print $2" "$3" "$4}'`, (err, stdout) => {
    if (err) return cb(null);
    const [total, used, free] = stdout.trim().split(/\s+/).map(n => Number(n));
    if (!total) return cb(null);
    const pct = (used / total) * 100;
    cb({ total, used, free, pct });
  });
}

// ---- GET /metrics ----
router.get("/", (req, res) => {
  const systemUptimeSec = getSystemUptimeSec();
  const processUptimeSec = Math.floor(process.uptime());
  const base = {
    uptime: processUptimeSec,
    processUptimeSec,
    systemUptimeSec,
    loadavg: os.loadavg(),
    freemem: os.freemem(),
    totalmem: os.totalmem(),
    cpus: os.cpus().length,
    timestamp: new Date()
  };
  const net = getNetBytes();

  getDiskUsage((disk) => {
    if (disk) {
      // untuk backward compatibility, kirim juga diskUsage (persen)
      res.json({ ...base, net, disk, diskUsage: disk.pct });
    } else {
      res.json({ ...base, net, disk: null, diskUsage: null });
    }
  });
});

// ---- GET /metrics/disk ----
router.get("/disk", (req, res) => {
  getDiskUsage((disk) => {
    if (!disk) return res.json({});
    res.json(disk);
  });
});

// ---- GET /metrics/net ----
router.get("/net", (req, res) => {
  res.json(getNetBytes());
});

module.exports = router;
