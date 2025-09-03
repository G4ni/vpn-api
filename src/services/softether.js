// src/services/softether.js
const { queuedVpncmd } = require('../../utils/softetherExec');

const SE_HOST = process.env.VPN_SERVER || process.env.SOFTETHER_HOST || '127.0.0.1';
const SE_HUB  = process.env.VPN_HUB    || process.env.SOFTETHER_HUB  || 'DEFAULT';
const SE_PASS = process.env.VPN_HUB_PASS || process.env.SOFTETHER_PASSWORD || '';

function seArgs(cmd, extra = []) {
  const base = ['/SERVER', SE_HOST, '/CMD'];
  if (SE_PASS) base.splice(2, 0, `/PASSWORD:${SE_PASS}`);
  if (SE_HUB)  base.splice(2, 0, `/HUB:${SE_HUB}`);
  return [...base, cmd, ...extra];
}

async function runVpnCmd(cmd, extra = [], opts) {
  const args = seArgs(cmd, extra);
  return queuedVpncmd(args, opts);
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
