// utils/pairStore.js
const fs = require('fs');
const path = require('path');

const FILE = path.join(process.cwd(), 'data', 'pairs.json');

function ensureFile() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ pairs: [] }, null, 2));
}

function readAll() {
  ensureFile();
  const raw = fs.readFileSync(FILE, 'utf8');
  const data = JSON.parse(raw || '{"pairs":[]}');
  return data.pairs || [];
}

function writeAll(pairs) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify({ pairs }, null, 2));
}

function upsert(entry) {
  const list = readAll();
  const idx = list.findIndex(p => p.email === entry.email);
  const now = new Date().toISOString();
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...entry, updatedAt: now };
  } else {
    list.push({ ...entry, createdAt: now, updatedAt: now });
  }
  writeAll(list);
  return list.find(p => p.email === entry.email);
}

function get(email) {
  const list = readAll();
  return list.find(p => p.email === email) || null;
}

function remove(email) {
  const list = readAll().filter(p => p.email !== email);
  writeAll(list);
}

module.exports = { readAll, writeAll, upsert, get, remove };
