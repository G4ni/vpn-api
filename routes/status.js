const express = require('express');
const router = express.Router();
const { listSessions } = require('../vpnManager');

router.get('/sessions', async (req, res) => {
  try {
    const sessions = await listSessions();
    res.json({ success: true, data: sessions });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/users', async (req, res) => {
  // convenience route to list vpn_users from firestore
  const { db } = require('../firebase');
  try {
    const snap = await db.collection('vpn_users').get();
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, data: users });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
