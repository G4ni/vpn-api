// src/services/softether.js
const { execFile } = require('child_process');
const { promisify } = require('util');
const exec = promisify(execFile);

const SE_HOST = process.env.VPN_SERVER || process.env.SOFTETHER_HOST || '127.0.0.1';
const SE_HUB  = process.env.VPN_HUB    || process.env.SOFTETHER_HUB  || 'DEFAULT';
const SE_PASS = process.env.VPN_HUB_PASS || process.env.SOFTETHER_PASSWORD || '';

function seArgs(cmd, extra = []) {
  const base = ['/SERVER', SE_HOST, '/CMD'];
  if (SE_PASS) base.splice(2, 0, `/PASSWORD:${SE_PASS}`);
  if (SE_HUB)  base.splice(2, 0, `/HUB:${SE_HUB}`);
  return [...base, cmd, ...extra];
}

// helper retry dengan backoff
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runVpnCmd(cmd, extra = [], { retries = 4, backoffMs = 250 } = {}) {
  const args = seArgs(cmd, extra);

  // Gunakan flock agar hanya satu vpncmd jalan bersamaan.
  // Catatan: jalankan vpncmd lewat bash -lc supaya flock tersedia.
  const flocked = [
    '-lc',
    `flock -w 5 /tmp/vpncmd.lock vpncmd ${args.map(a => `'${a.replace(/'/g, `'\\''`)}'`).join(' ')}`
  ];

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { stdout } = await exec('/bin/bash', flocked, { maxBuffer: 1024 * 1024 });
      return stdout;
    } catch (err) {
      const msg = String(err?.stdout || err?.stderr || err?.message || err);
      // Kalau busy / lock / timeout —> retry dengan backoff
      if (/busy|locked|try again|timeout/i.test(msg) && attempt < retries) {
        await sleep(backoffMs * Math.pow(2, attempt)); // backoff eksponensial
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('vpncmd failed after retries');
}

// Contoh API yang dipakai route lama kamu:
async function createUser(username, password) {
  await runVpnCmd('UserCreate', [username, '/GROUP:none', '/REALNAME:none', '/NOTE:none']);
  await runVpnCmd('UserPasswordSet', [username, `/PASSWORD:${password}`]);
}

async function setPassword(username, password) {
  await runVpnCmd('UserPasswordSet', [username, `/PASSWORD:${password}`]);
}

async function deleteUser(username) {
  await runVpnCmd('UserDelete', [username]);
}

async function getUser(username) {
  const out = await runVpnCmd('UserGet', [username]);
  // ... parsing sama seperti sebelumnya
  return { /* lastLoginRaw, numLogins, etc. */ };
}

module.exports = { createUser, setPassword, deleteUser, getUser, runVpnCmd };
