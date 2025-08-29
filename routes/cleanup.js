// routes/cleanup.js
const express = require('express');
const router = express.Router();
const vpn = require('../services/vpnService');

// Hapus user yang tidak login > N hari (default 30)
router.post('/inactive', async (req, res) => {
  const days = Number(req.body?.days) || 30;
  const now = Date.now();
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  try {
    const users = await vpn.listUsers(); // { name, group, ... }
    const checked = [];
    const deleted = [];
    const skipped = [];

    // Lewati user khusus
    const skipNames = new Set(['SecureNAT', 'DEFAULT', 'admin', 'anonymous']);

    for (const u of users) {
      if (!u?.name || skipNames.has(u.name)) { skipped.push({ name: u?.name, reason: 'system/skip' }); continue; }

      try {
        const detail = await vpn.getUserDetail(u.name);
        const last = vpn.parseLastLogin(detail); // Date | null
        let inactiveMs;

        if (last) {
          inactiveMs = now - last.getTime();
        } else {
          // Belum pernah login → anggap sangat lama agar terjaring
          inactiveMs = Number.MAX_SAFE_INTEGER;
        }

        const inactiveDays = Math.floor(inactiveMs / (24*60*60*1000));
        const shouldDelete = inactiveMs >= thresholdMs;

        checked.push({ name: u.name, lastLogin: last ? last.toISOString() : null, inactiveDays, shouldDelete });

        if (shouldDelete) {
          await vpn.deleteUser(u.name);
          deleted.push({ name: u.name, lastLogin: last ? last.toISOString() : null, inactiveDays });
        }
      } catch (e) {
        skipped.push({ name: u.name, reason: e.message || String(e) });
      }
    }

    res.json({
      success: true,
      daysThreshold: days,
      summary: { total: users.length, checked: checked.length, deleted: deleted.length, skipped: skipped.length },
      deleted,
      skipped,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

module.exports = router;
