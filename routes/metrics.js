// routes/metrics.js
const express = require("express");
const os = require("os");
const { exec } = require("child_process");

const router = express.Router();

// system uptime in seconds
function getUptime() {
  return Math.floor(os.uptime());
}

// disk usage via df -kP /
function getDiskUsage(cb) {
  exec("df -kP /", (err, stdout) => {
    if (err) return cb(null);
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) return cb(null);
    const parts = lines[1].trim().split(/\s+/);
    const total = parseInt(parts[1], 10) * 1024;
    const used = parseInt(parts[2], 10) * 1024;
    const free = parseInt(parts[3], 10) * 1024;
    cb({ total, used, free });
  });
}

// GET /metrics
router.get("/", (_req, res) => {
  getDiskUsage((disk) => {
    res.json({
      uptime: getUptime(),
      loadavg: os.loadavg(),
      cpus: os.cpus().length,
      mem: { free: os.freemem(), total: os.totalmem() },
      disk: disk || { used: null, free: null, total: null },
      timestamp: new Date().toISOString()
    });
  });
});

module.exports = router;
