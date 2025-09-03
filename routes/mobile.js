// routes/mobile.js
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch'); // jika belum ada: npm i node-fetch@2
const { upsert, get } = require('../utils/pairStore');
const { ensureAndroidIp } = require('../utils/ipam');

// Ambil config server lokal
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const BASE = `http://127.0.0.1:${PORT}/api`; // panggil endpoint lama di server ini

// Helper panggil endpoint lama (re-use implementasi kamu yang sudah stabil)
// Helper panggil endpoint lama (re-use implementasi kamu yang sudah stabil)
async function callOldAPI(method, path, body) {
  const PORT = process.env.PORT || 3000;
  const API_KEY = process.env.API_KEY || '';
  const ORIG = `http://127.0.0.1:${PORT}`;   // tanpa /api
  const TRY = [
    `${ORIG}/api${path}`,  // coba dengan /api dulu (sesuai README)
    `${ORIG}${path}`       // fallback tanpa /api (kalau server pasang route langsung)
  ];

  let lastErr;
  for (const url of TRY) {
    const res = await fetch(url, {
      method,
      headers: {
        'x-api-key': API_KEY,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    // sukses → kembalikan JSON / text
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (res.ok) return data;

    // kalau jelas 404 / "Cannot ..." → coba prefix berikutnya
    const msg = (data && data.error) ? String(data.error) : String(text);
    if ((res.status === 404) || /Cannot\s+(GET|POST)/i.test(msg)) {
      lastErr = new Error(msg);
      continue; // fallback ke URL berikutnya
    }

    // error lain → hentikan
    throw new Error(msg || `HTTP ${res.status}`);
  }
  throw lastErr || new Error('Upstream route not found (both with and without /api)');
}


/**
 * POST /api/mobile/ensure
 * Body: { email, password }
 * Tujuan: pastikan akun ada (create/set-password), alokasikan IP /32, simpan pair.
 * Return: urls untuk OVPN & Mikrotik script.
 */
router.post('/ensure', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ success: false, error: 'email & password required' });

  try {
    // 1) Buat akun (pakai endpoint lama). Jika sudah ada & error msg, lanjut set-password.
    try {
      await callOldAPI('POST', '/vpn/create', { email, password });
    } catch (e) {
      // kalau error karena sudah ada user, tetap lanjut set-password
      // biarkan error lain tetap dilempar
      const msg = String(e.message || '');
      if (!/exist|already/i.test(msg)) throw e;
    }
    // 2) Set password (idempotent)
    await callOldAPI('POST', '/vpn/set-password', { email, password });

    // 3) Alokasikan IP /32 Android & simpan
    const ip32 = ensureAndroidIp(email);
    const pair = upsert({ email, androidIp: ip32 });

    // 4) Siapkan URL OVPN (wrapper redirect disediakan di /api/mobile/ovpn/:email)
    const ovpnUrl = `/api/mobile/ovpn/${encodeURIComponent(email)}`;
    const mkUrl   = `/api/mobile/mikrotik-script/${encodeURIComponent(email)}`;

    return res.json({
      success: true,
      android: { ip32, ovpnDownloadUrl: ovpnUrl },
      mikrotik: { scriptUrl: mkUrl },
      pair
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err.message || err) });
  }
});

/**
 * GET /api/mobile/ovpn/:email
 * Redirect ke endpoint lama: /api/vpn/ovpn?email=...
 */
router.get('/ovpn/:email', async (req, res) => {
  const email = req.params.email;
  // forward header api-key agar konsisten (meski dipanggil langsung user/app juga boleh)
  res.set('x-proxy-note', 'redirect-to-ovpn-generator');
  return res.redirect(302, `/api/vpn/ovpn?email=${encodeURIComponent(email)}`);
});

/**
 * GET /api/mobile/mikrotik-script/:email?lan=192.168.88.0/24&format=rsc|txt
 * Hasilkan script RouterOS SSTP client + route balik ke Android /32.
 */
router.get('/mikrotik-script/:email', async (req, res) => {
  const email = req.params.email;
  const lan = String(req.query.lan || '').trim();
  const format = (req.query.format || 'txt').toLowerCase();

  const pair = get(email);
  if (!pair?.androidIp) return res.status(404).send('Pair not found or no Android IP assigned');

  const host = process.env.SSTP_SERVER_HOST || process.env.VPN_SERVER || req.hostname || 'vpn.example.com';
  const android32 = pair.androidIp.split('/')[0];

  const lines = [
    `# Mikrotik SSTP client script for ${email}`,
    `:local U "${email}"`,
    `:local P "<PASSWORD-ANDA>"`,
    `:local HOST "${host}"`,
    `:local IF ("sstp-" . $U)`,
    `/interface sstp-client add name=$IF connect-to=$HOST user=$U password=$P profile=default-encryption keepalive-timeout=60 verify-server-certificate=no disabled=no`,
    `/ip route add dst-address=${android32}/32 gateway=$IF comment="return to Android ${email}"`,
    lan ? `/ip firewall filter add chain=forward in-interface=$IF dst-address=${lan} action=accept comment="allow ${email} -> LAN (${lan})"` : `# (optional) add forward allow rule for your LAN`
  ].filter(Boolean);

  const body = lines.join('\n');

  if (format === 'rsc') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=mk-${email.replace(/[^a-zA-Z0-9_.-]/g,'_')}.rsc`);
    return res.send(body);
  }
  res.type('text/plain').send(body);
});

/**
 * (Opsional) GET /api/mobile/status/:email
 * Ringkas: kembalikan IP /32 yang tercatat.
 */
router.get('/status/:email', (req, res) => {
  const email = req.params.email;
  const pair = get(email);
  return res.json({ success: true, email, android: { ip32: pair?.androidIp || null } });
});

module.exports = router;
