// services/vpnService.js
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const CACHE_TTL_MS = parseInt(process.env.VPN_CACHE_TTL_MS || '5000', 10); // default 5s
const _cache = {
  users: { data: null, ts: 0 },
  sessions: { data: null, ts: 0 },
};

const CONFIG_DIR = path.join(__dirname, '..', 'configs');

// Pastikan direktori configs ada
function ensureDirs() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('[vpnService] ensureDirs error:', e.message);
  }
}
ensureDirs();

// Konfigurasi SoftEther
const cfg = {
  hub: process.env.VPN_HUB || 'VPN',
  hubPassword: process.env.VPN_HUB_PASS || 'asaku',
  server: process.env.VPN_SERVER || 'localhost',
  vpncmd: process.env.VPNCMD_PATH || '/usr/bin/vpncmd',
  debug: process.env.DEBUG_VPN === 'true' // aktifkan logging jika perlu
};

// Jalankan perintah vpncmd
function runVpnCmd(command) {
  return new Promise((resolve, reject) => {
    const cmd = `${cfg.vpncmd} ${cfg.server} /SERVER /HUB:${cfg.hub} /PASSWORD:${cfg.hubPassword} /CMD ${command}`;
    if (cfg.debug) console.log("[vpnService] exec:", cmd);

    exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (cfg.debug) console.log("[vpnService] stdout:", stdout, "\n[stderr]:", stderr);

      if (err) return reject(stderr || stdout || err.message);
      resolve(stdout.toString().trim());
    });
  });
}

// Buat user baru
async function createUser(username, password = 'asaku123') {
  await runVpnCmd(`UserCreate ${username} /GROUP:none /REALNAME:none /NOTE:none`);
  await runVpnCmd(`UserPasswordSet ${username} /PASSWORD:${password}`);
  return true;
}

// Hapus user
async function deleteUser(username) {
  return runVpnCmd(`UserDelete ${username}`);
}

// Set password user
async function setPassword(username, password) {
  return runVpnCmd(`UserPasswordSet ${username} /PASSWORD:${password}`);
}

// ganti fungsi listUsers() di services/vpnService.js dengan ini
async function listUsers() {
  if (_fresh('users')) return _cache['users'].data;

  const raw = await runVpnCmd('UserList');
  const lines = raw.split('\n').filter(l => l.includes('|'));
  const users = lines.map(line => {
    const parts = line.split('|').map(x => x.trim());
    return { name: parts[0], group: parts[1] || null };
  }).filter(u => u.name && !/^user\s*name$/i.test(u.name));



// List session (raw)
async function listSessionsCached() {
  if (_fresh('sessions')) return _cache['sessions'].data;

  const raw = await runVpnCmd('SessionList');
  const parsed = parseSessionList(raw);

  _cache.sessions = { data: parsed, ts: Date.now() };
  return parsed;
}

// Parse session list (key-value)
function parseSessionList(raw) {
  const lines = raw.split('\n');
  const sessions = [];
  let current = {};
  lines.forEach(line => {
    if (line.includes('|')) {
      const [key, value] = line.split('|').map(s => s.trim());
      if (key === 'Session Name') {
        if (Object.keys(current).length) sessions.push(current);
        current = { name: value };
      } else if (current) {
        current[key] = value;
      }
    }
  });
  if (Object.keys(current).length) sessions.push(current);
  return sessions;
}

// Putuskan session
async function disconnectSession(sessionName) {
  // Ambil daftar session terlebih dahulu
  const rawBefore = await runVpnCmd('SessionList');

  // Periksa keberadaan session menggunakan regex (lebih aman daripada includes)
  const regex = new RegExp(sessionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!regex.test(rawBefore)) {
    return {
      success: false,
      message: `Session ${sessionName} not found`
    };
  }

  // Eksekusi disconnect
  const result = await runVpnCmd(`SessionDisconnect ${sessionName}`);
  const success = result && !/Error code:\s*29/.test(result);

  return {
    success,
    message: success
      ? `Session ${sessionName} disconnected`
      : `Failed to disconnect ${sessionName}`,
    raw: result.toString().trim() // hanya hasil eksekusi yang dikirim
  };
}


// === Interactive ACL (SoftEther v4) ===
const { spawn } = require('child_process');

function vpncmdInteractive(lines = []) {
  return new Promise((resolve, reject) => {
    const args = [
      cfg.server,
      '/SERVER',
      `/HUB:${cfg.hub}`,
      `/PASSWORD:${cfg.hubPassword}`
    ];
    const p = spawn(cfg.vpncmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());

    p.on('error', reject);
    p.on('close', code => {
      // SoftEther kadang exit code 0 walau ada warning — cek teks suksesnya
      if (code === 0 && /The command completed successfully\./i.test(out)) {
        return resolve(out.trim());
      }
      // kalau tidak ada “completed successfully”, tetap kembalikan output utk diagnosa
      if (code === 0) return resolve(out.trim());
      reject(new Error(err || out || `vpncmd exited ${code}`));
    });

    // kirim perintah (tiap elemen = satu ENTER)
    for (const line of lines) p.stdin.write(line + '\n');
    p.stdin.end();
  });
}

// PASS: src -> dst
async function addAclPass(srcUser, dstUser, priority = 10, memo = '') {
  const lines = [
    'AccessAdd',
    memo || `${srcUser}_to_${dstUser}`,
    String(priority),
    'Pass',             // Policy
    srcUser,            // Source User Name
    dstUser,            // Destination User Name
    '',                 // Source MAC (empty)
    '',                 // Destination MAC (empty)
    '0.0.0.0/0',        // Source IP
    '0.0.0.0/0',        // Destination IP
    'any',              // Protocol (any / tcp / udp / icmpv4 / icmpv6 / ip)
    '0',                // Source Port
    '0',                // Destination Port
    ''                  // TCP State
  ];
  return vpncmdInteractive(lines);
}

// DISCARD: blok semua dari src (kecuali rule PASS yg lebih prioritas)
async function addAclDiscard(srcUser, priority = 20, memo = '') {
  const lines = [
    'AccessAdd',
    memo || `drop_${srcUser}`,
    String(priority),
    'Discard',
    srcUser,
    '',                 // Dest User kosong = semua
    '', '',             // MAC kosong
    '0.0.0.0/0',        // Source IP
    '0.0.0.0/0',        // Destination IP
    'any',
    '0',
    '0',
    ''
  ];
  return vpncmdInteractive(lines);
}

// List & Delete ACL (helper)
async function listAclRaw() {
  const lines = ['AccessList'];
  return vpncmdInteractive(lines);
}

async function deleteAclById(id) {
  const lines = ['AccessDelete', String(id)];
  return vpncmdInteractive(lines);
}


// dedup
  const seen = new Set();
  const unique = users.filter(u => !seen.has(u.name) && seen.add(u.name));

  _cache.users = { data: unique, ts: Date.now() };
  return unique;
}



// Generate file OVPN
function generateOvpn(username, serverAddr, port = 1194, proto = 'udp') {
  ensureDirs();
  const config = `
client
dev tun
nobind
persist-key
persist-tun
cipher AES-256-CBC
auth SHA256
remote ${serverAddr} ${port} ${proto}
verb 3
auth-user-pass
  `;
  const filePath = path.join(CONFIG_DIR, `${username}.ovpn`);
  fs.writeFileSync(filePath, config.trim());
  return filePath;
}

// Random password generator
function randPass(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

// Ambil detail user: memakai `UserGet <username>`
async function getUserDetail(username) {
  const raw = await runVpnCmd(`UserGet ${username}`);
  const obj = {};
  raw.split('\n').forEach(line => {
    if (!line.includes('|')) return;
    const [k, v] = line.split('|').map(s => s.trim());
    obj[k] = v;
  });
  return obj; // contoh kunci: 'User Name', 'Num Logins', 'Last Login', dst.
}


// Parse tanggal "Last Login" ke Date (atau null bila "-")
function parseLastLogin(userDetail) {
  const s = userDetail['Last Login'];
  if (!s || s === '-' || s.toLowerCase().includes('none')) return null;
  // Contoh format SoftEther: 2025-08-14 12:47:15
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [_, Y, M, D, h, mnt, sec] = m;
  return new Date(`${Y}-${M}-${D}T${h}:${mnt}:${sec}Z`); // asumsikan UTC (cukup untuk threshold 30 hari)
}

// helper cache
function _fresh(bucket) {
  return _cache[bucket].data && (Date.now() - _cache[bucket].ts) < CACHE_TTL_MS;
}


module.exports.listSessionsCached = {
  listSessionsCached,
  ensureDirs,
  runVpnCmd,
  createUser,
  deleteUser,
  setPassword,
  listUsers,
  sessionListRaw,
  parseSessionList,
  generateOvpn,
  randPass,
  CONFIG_DIR,
  disconnectSession,
  getUserDetail,
  parseLastLogin,
  addAclPass,
  addAclDiscard,
  listAclRaw,
  deleteAclById
};