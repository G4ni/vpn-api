// routes/hub.js
const express = require('express');
const router = express.Router();
const vpnService = require('../services/vpnService');

// Hub info (status semua hub)
router.get("/info", async (req, res) => {
  try {
    const result = await vpnService.runVpnCmd("HubList");
    res.type('text/plain').send(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List sessions (parsed)
router.get("/sessions", async (req, res) => {
  try {
    const raw = await vpnService.runVpnCmd("SessionList");
    const sessions = vpnService.parseSessionList(raw);
    res.json({ success: true, sessions, raw });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Disconnect specific session
router.post("/disconnect", async (req, res) => {
  const { sessionName } = req.body;
  if (!sessionName) {
    return res.status(400).json({ success: false, error: "sessionName required" });
  }

  try {
    const result = await vpnService.disconnectSession(sessionName);
	res.json(result); // langsung kirim hasil dari service
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || String(err) });

  }
});

// Disconnect semua sesi kecuali SecureNAT (auto)
router.post("/disconnect-all", async (req, res) => {
  try {
    const raw = await vpnService.runVpnCmd("SessionList");
    const lines = raw.split("\n");

    // ambil semua "Session Name" lalu filter SecureNAT
    const sessions = [];
    let currentName = null;
    for (const line of lines) {
      if (line.includes("Session Name")) {
        currentName = line.split("|")[1]?.trim();
      }
      if (line.includes("User Name")) {
        const user = line.split("|")[1]?.trim();
        if (currentName && user && user.toUpperCase() !== "SECURENAT") {
          sessions.push(currentName);
        }
        currentName = null;
      }
    }

    if (sessions.length === 0) {
      return res.json({ success: true, message: "Tidak ada sesi non-SecureNAT" });
    }

    const results = [];
    for (const s of sessions) {
      const out = await vpnService.disconnectSession(s);
      results.push({ session: s, ...out });
    }

    res.json({ success: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});


module.exports = router;
