const express = require('express');
const router = express.Router();
const vpn = require('../services/vpnService');

router.post('/cleanup', async (req, res) => {
  try {
    const days = Number(req.body.days || 30);
    const cutoff = Date.now() - days * 86400000;

    const users = await vpn.listUsers();
    const deleted = [];
    const skipped = [];

    for (const u of users) {
      const detail = await vpn.getUserDetail(u.name);
      const last = vpn.parseLastLogin(detail); // Date | null
      const lastMs = last ? last.getTime() : 0;

      if (!last || lastMs < cutoff) {
        await vpn.deleteUser(u.name);
        deleted.push(u.name);
      } else {
        skipped.push(u.name);
      }
    }

    res.json({ success:true, days, deleted, skipped });
  } catch (e) {
    res.status(500).json({ success:false, error: e.message || String(e) });
  }
});

module.exports = router;
