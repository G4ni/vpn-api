// routes/cleanup.js
const express = require("express");
const apiKey = require("../middleware/apiKey");
const cleanup = require("../services/cleanupService");

const router = express.Router();
router.use(apiKey);

router.get("/cleanup/summary", (req, res) => {
  res.json({ success: true, ...cleanup.getSummary() });
});

router.get("/cleanup/preview", async (req, res) => {
  try {
    const cand = await cleanup.getPreview();
    res.json({ success: true, candidates: cand });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post("/cleanup/config", (req, res) => {
  const out = cleanup.updateConfig(req.body || {});
  res.json({ success: true, ...out });
});

router.post("/cleanup/run", async (req, res) => {
  try {
    const r = await cleanup.runOnce(true);
    res.json({ success: true, ...r, ...cleanup.getSummary() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// routes/cleanup.js (tambahkan DI BAWAH router.use(apiKey))
router.get("/cleanup/debug-exports", (req, res) => {
  try {
    const vpn = require("../services/vpnService");
    res.json({ success: true, exports: Object.keys(vpn) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
