// routes/user.js
const express = require("express");
const router = express.Router();
const vpnService = require("../services/vpnService");

// helper
function usernameFromEmail(email) {
  return (email || '').split("@")[0];
}

// CREATE: buat 2 akun (Android & Mikrotik)
router.post("/create", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: "Email required" });
  const username = usernameFromEmail(email);
  const password = "asaku123";
  try {
    await vpnService.createUser(username, password);
    res.json({ success: true, message: `User ${username} created`, password });
  } catch (err) {
    console.error("createUser error:", err);
    res.status(503).json({ success: false, error: "SoftEther CLI busy, try again." });
  }
});

// LIST users
router.get("/list", async (_req, res) => {
  try {
    const users = await vpnService.listUsers();
    res.json({ success: true, users });
  } catch (err) {
    console.error("listUsers error:", err);
    res
      .status(503)
      .json({ success: false, error: "SoftEther CLI busy, try again." });
  }
});

// SET PASSWORD untuk kedua akun (opsional bisa satu-satu, di sini sekalian dua)
router.post("/set-password", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ success: false, error: "Email and password required" });
  const username = usernameFromEmail(email);
  try {
    const raw = await vpnService.setPassword(username, password);
    res.json({ success: true, message: `Password updated for ${username}`, raw });
  } catch (err) {
    console.error("setPassword error:", err);
    res.status(503).json({ success: false, error: "SoftEther CLI busy, try again." });
  }
});

// DELETE kedua akun
router.post("/delete", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: "Email required" });
  const username = usernameFromEmail(email);
  try {
    const raw = await vpnService.deleteUser(username);
    res.json({ success: true, message: `User ${username} deleted`, raw });
  } catch (err) {
    console.error("deleteUser error:", err);
    res.status(503).json({ success: false, error: "SoftEther CLI busy, try again." });
  }
});


// GENERATE & DOWNLOAD OVPN untuk Android user
router.post("/ovpn", async (req, res) => {
  try {
    const { email, port, proto } = req.body;
    if (!email) return res.status(400).json({ success:false, error:"Email required" });
    const username = usernameFromEmail(email);

    const serverAddr = process.env.VPN_SERVER || "103.49.239.230";
    const p = Number(port) || 1194;
    const pr = (proto || "udp").toLowerCase() === "tcp" ? "tcp" : "udp";

    const filePath = vpnService.generateOvpn(username, serverAddr, p, pr);
    res.download(filePath, `${username}.ovpn`);
  } catch (e) {
    res.status(500).json({ success:false, error: e.message || String(e) });
  }
});

module.exports = router;