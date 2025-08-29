// routes/acl.js
const express = require('express');
const router = express.Router();
const vpn = require('../services/vpnService');

// email -> username (ambil bagian sebelum '@')
const U = e => String(e).split('@')[0];

router.post('/apply', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success:false, error:'Email required' });

    const u = U(email);
    const mt = `${u}-mt`;

    // PASS dua arah + DISCARD default
    await vpn.addAclPass(u,  mt, 10, `${u}_to_${mt}`);
    await vpn.addAclPass(mt, u,  10, `${mt}_to_${u}`);
    await vpn.addAclDiscard(u,  20, `drop_${u}`);
    await vpn.addAclDiscard(mt, 20, `drop_${mt}`);

    res.json({ success:true, message:`ACL applied for ${u} <-> ${mt}` });
  } catch (e) {
    res.status(500).json({ success:false, error: e.message || String(e) });
  }
});

router.get('/list', async (_req, res) => {
  try {
    const out = await vpn.listAclRaw();
    res.type('text/plain').send(out);
  } catch (e) {
    res.status(500).json({ success:false, error: e.message || String(e) });
  }
});

// Hapus semua rule yg menyebut username (src/dst mengandung teks tsb)
router.post('/clear', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success:false, error:'username required' });

    const out = await vpn.listAclRaw();
    const ids = [];
    let currentId = null, hit = false;

    for (const line of out.split('\n')) {
      const m = line.match(/^ID\s*\|\s*(\d+)/i);
      if (m) { // mulai blok rule baru
        if (currentId && hit) ids.push(currentId);
        currentId = m[1];
        hit = false;
        continue;
      }
      if (/^-+\+-+/.test(line)) continue;
      if (currentId && line.includes('|') && line.toLowerCase().includes(username.toLowerCase())) {
        hit = true;
      }
    }
    if (currentId && hit) ids.push(currentId);

    for (const id of ids) {
      await vpn.deleteAclById(id);
    }
    res.json({ success:true, deleted: ids });
  } catch (e) {
    res.status(500).json({ success:false, error: e.message || String(e) });
  }
});

module.exports = router;
