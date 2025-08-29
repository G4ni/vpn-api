const express = require('express');
const router = express.Router();
const { createOpenVPNForEmail, deleteVpnUserByEmail } = require('../vpnManager');
const { db, admin } = require('../firebase');

router.post('/create', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'email required' });
    const result = await createOpenVPNForEmail(email);
    const now = new Date();
    await db.collection('vpn_users').doc(email).set({
      email,
      password: result.password,
      createdAt: admin.firestore.Timestamp.fromDate(now),
      lastLoginAt: admin.firestore.Timestamp.fromDate(now),
      active: true
    }, { merge: true });
    res.json({ success: true, data: { email, configUrl: `/vpn/config/${encodeURIComponent(email)}` } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/config/:email', (req, res) => {
  const email = req.params.email;
  const filePath = require('path').join(__dirname, '..', 'configs', `${email}.ovpn`);
  if (!require('fs').existsSync(filePath)) return res.status(404).json({ success: false, message: 'config not found' });
  res.download(filePath, `${email}.ovpn`);
});

router.delete('/user/:email', async (req, res) => {
  try {
    const email = req.params.email;
    await deleteVpnUserByEmail(email);
    await db.collection('vpn_users').doc(email).set({ active: false }, { merge: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
