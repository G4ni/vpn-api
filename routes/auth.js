const express = require('express');
const router = express.Router();
const admin = require('../firebase').admin;

router.post('/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'token required' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    res.json({ success: true, uid: decoded.uid, email: decoded.email });
  } catch (e) {
    res.status(401).json({ success: false, message: 'invalid token' });
  }
});

module.exports = router;
