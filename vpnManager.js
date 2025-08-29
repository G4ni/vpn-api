const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createUser, deleteUser, sessionList } = require('./softether');

const CONFIG_DIR = path.join(__dirname, 'configs');
const TPL = path.join(__dirname, 'templates', 'base.ovpn');

function ensureDirs() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(path.dirname(TPL))) fs.mkdirSync(path.dirname(TPL), { recursive: true });
}

function randPass() {
  return Math.random().toString(36).slice(2, 10);
}

function buildOvpn(email, password) {
  if (!fs.existsSync(TPL)) throw new Error('Template not found: ' + TPL);
  let tpl = fs.readFileSync(TPL, 'utf-8');
  tpl = tpl
    .replace(/{{SERVER_HOST}}/g, process.env.OVPN_SERVER_HOST || '127.0.0.1')
    .replace(/{{SERVER_PORT}}/g, process.env.OVPN_SERVER_PORT || '1194')
    .replace(/{{PROTO}}/g, process.env.OVPN_PROTO || 'udp');

  const inline = `\n<auth-user-pass>\n${email}\n${password}\n</auth-user-pass>\n`;
  return tpl + inline;
}

async function createOpenVPNForEmail(email) {
  ensureDirs();
  const password = randPass();
  await createUser(email, password);
  const content = buildOvpn(email, password);
  const cfgPath = path.join(CONFIG_DIR, `${email}.ovpn`);
  fs.writeFileSync(cfgPath, content, 'utf-8');
  return { username: email, password, configPath: cfgPath };
}

async function deleteVpnUserByEmail(email) {
  try { await deleteUser(email); } catch(e) {}
  const cfgPath = path.join(CONFIG_DIR, `${email}.ovpn`);
  if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
  return true;
}

function parseSession(raw) {
  const lines = raw.split(/\r?\n/);
  const sessions = [];
  let cur = null;
  for (const line of lines) {
    const mu = line.match(/User Name\s*:\s*(.+)$/i);
    if (mu) { if (cur) sessions.push(cur); cur = { username: mu[1].trim() }; }
    const ip = line.match(/Client IP Address\s*:\s*(.+)$/i);
    if (ip && cur) cur.ip = ip[1].trim();
    const started = line.match(/Connection Started at\s*:\s*(.+)$/i);
    if (started && cur) cur.connectedAt = started[1].trim();
  }
  if (cur) sessions.push(cur);
  return sessions;
}

async function listSessions() {
  const raw = await sessionList();
  return parseSession(raw);
}

module.exports = { ensureDirs, createOpenVPNForEmail, deleteVpnUserByEmail, listSessions };
