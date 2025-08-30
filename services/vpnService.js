// services/vpnService.js
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const CACHE_TTL_MS = parseInt(process.env.VPN_CACHE_TTL_MS || '5000', 10);
const _cache = {
  users: { data: null, ts: 0 },
  sessions: { data: null, ts: 0 }
};

const CONFIG_DIR = path.join(__dirname, '..', 'configs');

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

const cfg = {
  hub: process.env.VPN_HUB || 'VPN',
  hubPassword: process.env.VPN_HUB_PASS || 'asaku',
  server: process.env.VPN_SERVER || 'localhost',
  vpncmd: process.env.VPNCMD_PATH || '/usr/bin/vpncmd',
  debug: process.env.DEBUG_VPN === 'true'
};

function runVpnCmd(command) {
  return new Promise((resolve, reject) => {
    const cmd = `${cfg.vpncmd} ${cfg.server} /SERVER /HUB:${cfg.hub} /PASSWORD:${cfg.hubPassword} /CMD ${command}`;
    if (cfg.debug) console.log('[vpnService] exec:', cmd);
    exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (cfg.debug) console.log('[vpnService] stdout:', stdout, '\n[stderr]:', stderr);
      if (err) return reject(stderr || stdout || err.message);
      resolve(stdout.toString().trim());
    });
  });
}

async function createUser(username, password = 'asaku123') {
  await runVpnCmd(`UserCreate ${username} /GROUP:none /REALNAME:none /NOTE:none`);
  await runVpnCmd(`UserPasswordSet ${username} /PASSWORD:${password}`);
  return true;
}

async function deleteUser(username) {
  return runVpnCmd(`UserDelete ${username}`);
}

async function setPassword(username, password) {
  return runVpnCmd(`UserPasswordSet ${username} /PASSWORD:${password}`);
}

function _fresh(bucket) {
  return _cache[bucket].data && (Date.now() - _cache[bucket].ts) < CACHE_TTL_MS;
}

/// List user (support format vertikal & horizontal, filter ketat)
async function listUsers() {
  const raw = await runVpnCmd('UserList');
  const lines = raw.split('\n').map(l => l.trim());

  const users = [];

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (!L.includes('|')) continue;
    const [k, v] = L.split('|').map(s => s.trim());

    // format vertikal (key|value)
    if (/^User\s*Name$/i.test(k) && v && v !== '(None)') {
      users.push({ name: v, group: null });
    }
    // format horizontal fallback (User Name | Group Name)
    else if (i > 0 && /user\s*name/i.test(lines[0]) && L.split('|').length >= 2) {
      const cols = L.split('|').map(s => s.trim());
      if (cols[0] && !/^User\s*Name$/i.test(cols[0]) && !/^[-+]+$/.test(cols[0])) {
        users.push({ name: cols[0], group: cols[1] || null });
      }
    }
  }

  // Dedup: buang header/duplikat
  const seen = new Set();
  return users.filter(u => {
    if (seen.has(u.name)) return false;
    seen.add(u.name);
    return true;
  });
}


async function sessionListRaw() {
  return runVpnCmd('SessionList');
}

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

async function listSessionsCached() {
  if (_fresh('sessions')) return _cache.sessions.data;
  const raw = await sessionListRaw();
  const parsed = parseSessionList(raw);
  _cache.sessions = { data: parsed, ts: Date.now() };
  return parsed;
}

async function disconnectSession(sessionName) {
  const rawBefore = await sessionListRaw();
  const regex = new RegExp(sessionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!regex.test(rawBefore)) {
    return { success: false, message: `Session ${sessionName} not found` };
  }
  const result = await runVpnCmd(`SessionDisconnect ${sessionName}`);
  const success = result && !/Error code:\s*29/.test(result);
  return {
    success,
    message: success
      ? `Session ${sessionName} disconnected`
      : `Failed to disconnect ${sessionName}`,
    raw: result.toString().trim()
  };
}

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

function randPass(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

async function getUserDetail(username) {
  const raw = await runVpnCmd(`UserGet ${username}`);
  const obj = {};
  raw.split('\n').forEach(line => {
    if (!line.includes('|')) return;
    const [k, v] = line.split('|').map(s => s.trim());
    obj[k] = v;
  });
  return obj;
}

function parseLastLogin(userDetail) {
  const s = userDetail['Last Login'];
  if (!s || s === '-' || s.toLowerCase().includes('none')) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [_, Y, M, D, h, mnt, sec] = m;
  return new Date(`${Y}-${M}-${D}T${h}:${mnt}:${sec}Z`);
}

// Interactive helpers for ACL
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
      if (code === 0 && /The command completed successfully\./i.test(out)) {
        return resolve(out.trim());
      }
      if (code === 0) return resolve(out.trim());
      reject(new Error(err || out || `vpncmd exited ${code}`));
    });

    for (const line of lines) p.stdin.write(line + '\n');
    p.stdin.end();
  });
}

async function addAclPass(srcUser, dstUser, priority = 10, memo = '') {
  const lines = [
    'AccessAdd',
    memo || `${srcUser}_to_${dstUser}`,
    String(priority),
    'Pass',
    srcUser,
    dstUser,
    '',
    '',
    '0.0.0.0/0',
    '0.0.0.0/0',
    'any',
    '0',
    '0',
    ''
  ];
  return vpncmdInteractive(lines);
}

async function addAclDiscard(srcUser, priority = 20, memo = '') {
  const lines = [
    'AccessAdd',
    memo || `drop_${srcUser}`,
    String(priority),
    'Discard',
    srcUser,
    '',
    '',
    '',
    '0.0.0.0/0',
    '0.0.0.0/0',
    'any',
    '0',
    '0',
    ''
  ];
  return vpncmdInteractive(lines);
}

async function listAclRaw() {
  return vpncmdInteractive(['AccessList']);
}

async function deleteAclById(id) {
  return vpncmdInteractive(['AccessDelete', String(id)]);
}

module.exports = {
  runVpnCmd,
  createUser,
  deleteUser,
  setPassword,
  listUsers,
  sessionListRaw,
  parseSessionList,
  listSessionsCached,
  disconnectSession,
  generateOvpn,
  randPass,
  getUserDetail,
  parseLastLogin,
  addAclPass,
  addAclDiscard,
  listAclRaw,
  deleteAclById,
  ensureDirs
};