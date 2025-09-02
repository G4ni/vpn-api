const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const vpn = require("./vpnService");

// ====== ADAPTER FUNGSI DARI vpnService ======
function pickFunction(obj, names = []) {
  for (const n of names) {
    if (n && typeof obj[n] === "function") return obj[n].bind(obj);
  }
  return null;
}
function keysOf(o) { try { return Object.keys(o); } catch { return []; } }

// users
const userListFn = pickFunction(vpn, [
  "listUsers", "getUsers", "UserList", "userList", "Users", "ListUsers",
]);
// delete user
const userDeleteFn = pickFunction(vpn, [
  "deleteUser", "UserDelete", "userDelete", "removeUser", "DelUser", "DeleteUser",
]);

// sessions (prioritas: listSessionsCached → sessionListRaw+parseSessionList → lainnya)
const listSessionsCachedFn = pickFunction(vpn, ["listSessionsCached"]);
const sessionListRawFn     = pickFunction(vpn, ["sessionListRaw"]);
const parseSessionListFn   = pickFunction(vpn, ["parseSessionList"]);

// cadangan nama lain (jarang, tapi jaga-jaga)
const genericSessionListFn = pickFunction(vpn, [
  "listSessions", "getSessions", "SessionList", "sessionList",
  "HubSessionList", "hubSessionList", "listHubSessions", "getHubSessions",
  "sessions",
]);

async function getUsersFromVpn() {
  if (!userListFn) throw new Error("vpn.listUsers/UserList tidak ditemukan");
  const r = await userListFn();
  return Array.isArray(r) ? r : r?.users || r || [];
}

async function getSessionsFromVpn() {
  // 1) pakai listSessionsCached kalau ada
  if (listSessionsCachedFn) {
    const r = await listSessionsCachedFn();
    return Array.isArray(r) ? r : r?.sessions || r || [];
  }
  // 2) kalau ada raw+parse → gunakan itu
  if (sessionListRawFn && parseSessionListFn) {
    const raw = await sessionListRawFn();
    const arr = await parseSessionListFn(raw);
    return Array.isArray(arr) ? arr : arr?.sessions || arr || [];
  }
  // 3) fallback generic
  if (genericSessionListFn) {
    const r = await genericSessionListFn();
    return Array.isArray(r) ? r : r?.sessions || r || [];
  }
  const e = new Error("vpn.*Session* function tidak ditemukan");
  e.exports = keysOf(vpn);
  throw e;
}

async function deleteUserOnVpn(username) {
  if (!userDeleteFn) throw new Error("vpn.deleteUser/UserDelete tidak ditemukan");
  return await userDeleteFn(username);
}

// ====== STATE & UTIL ======
const DATA_DIR = path.join(__dirname, "../data");
const CLEANUP_STORE = path.join(DATA_DIR, "cleanup.json");
const LASTSEEN_STORE = path.join(DATA_DIR, "lastSeen.json");

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function loadJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function saveJSON(file, obj) { ensureDir(); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

const state = loadJSON(CLEANUP_STORE, {
  thresholdDays: 30,
  auto: true,
  scheduleCron: "0 2 * * *", // 02:00 setiap hari
  exclusions: [],
  totalRemoved: 0,
  lastCleanupTs: null,
  history: [],
});

let lastSeen = loadJSON(LASTSEEN_STORE, {}); // { baseUser: ts }

const now = () => Date.now();
function normalizeName(u) {
  return String(u || "")
    .trim()
    .replace(/@.*$/i, "")
    .replace(/[\\/].*$/i, "")
    .toLowerCase();
}
function baseName(name) {
  const n = normalizeName(name);
  return n.replace(/-(android|mikrotik)$/i, "");
}
function pairVariants(base) {
  // sesuaikan pola pasangan akun di sini jika perlu
  return [base, `${base}-android`, `${base}-mikrotik`];
}
function saveState() { saveJSON(CLEANUP_STORE, state); }
function saveLastSeen() { saveJSON(LASTSEEN_STORE, lastSeen); }

// ====== POLLER lastSeen dari SessionList ======
async function pollSessions() {
  try {
    const sessions = await getSessionsFromVpn();
    const arr = Array.isArray(sessions) ? sessions : sessions?.sessions || [];
    const ts = now();
    for (const s of arr) {
      const raw =
        s?.UserName ?? s?.username ?? s?.user ?? s?.User ?? s?.["User Name"] ?? "";
      const user = normalizeName(raw);
      if (!user || user === "securenat") continue;
      const base = baseName(user);
      lastSeen[base] = ts;
    }
    saveLastSeen();
  } catch {
    // diam; coba lagi berikutnya
  }
}
setInterval(pollSessions, 60_000);
pollSessions();

// ====== CORE ======
async function listUsers()   { return await getUsersFromVpn(); }
async function listSessions() { return await getSessionsFromVpn(); }

function computeCandidates(allUsers, currentSessions) {
  const cutoff = now() - state.thresholdDays * 86400_000;

  const online = new Set(
    (Array.isArray(currentSessions) ? currentSessions : [])
      .map((s) => {
        const raw = s?.UserName ?? s?.username ?? s?.user ?? s?.User ?? s?.["User Name"];
        return baseName(raw);
      })
      .filter((n) => n && n !== "securenat")
  );

  const bases = new Set(
    (Array.isArray(allUsers) ? allUsers : [])
      .map((u) => {
        const raw = u?.UserName ?? u?.name ?? u?.user ?? u?.User;
        return baseName(raw);
      })
      .filter(Boolean)
  );

  const candidates = [...bases].filter((b) => {
    if (!b || b === "securenat") return false;
    if (state.exclusions?.includes(b)) return false;
    const seen = lastSeen[b];
    if (!seen) return false;          // tanpa lastSeen, aman: jangan hapus
    if (online.has(b)) return false;  // sedang online → jangan hapus
    return seen < cutoff;
  });

  return candidates.map((b) => ({
    base: b,
    lastSeenTs: lastSeen[b] || null,
    variants: pairVariants(b),
  }));
}

async function preview() {
  const [users, sessions] = await Promise.all([listUsers(), listSessions()]);
  return computeCandidates(users, sessions);
}

async function runOnce(manual = false) {
  const cand = await preview();
  let removed = 0;
  for (const c of cand) {
    for (const name of c.variants) {
      try { await deleteUserOnVpn(name); removed++; } catch { /* lanjut */ }
    }
  }
  state.totalRemoved += removed;
  state.lastCleanupTs = now();
  state.history.push({
    ts: state.lastCleanupTs,
    type: manual ? "Manual" : "Auto",
    removed,
    criteria: `Inactive > ${state.thresholdDays} days`,
    by: manual ? "Admin" : "System",
  });
  saveState();
  return { removed, candidates: cand };
}

// ====== SCHEDULER ======
let task = null;
function reschedule() {
  if (task) { task.stop(); task = null; }
  if (state.auto && state.scheduleCron) {
    task = cron.schedule(state.scheduleCron, () => runOnce(false));
  }
}
reschedule();

// ====== PUBLIC API ======
module.exports = {
  getSummary() {
    return {
      thresholdDays: state.thresholdDays,
      auto: !!state.auto,
      scheduleCron: state.scheduleCron,
      exclusions: state.exclusions || [],
      lastCleanupTs: state.lastCleanupTs,
      totalRemoved: state.totalRemoved,
      history: state.history,
      _vpnExports: keysOf(vpn),
    };
  },
  async getPreview() { return await preview(); },
  updateConfig({ thresholdDays, auto, scheduleCron, exclusions }) {
    if (typeof thresholdDays === "number") state.thresholdDays = Math.max(1, thresholdDays);
    if (typeof auto === "boolean") state.auto = auto;
    if (typeof scheduleCron === "string") state.scheduleCron = scheduleCron;
    if (Array.isArray(exclusions)) state.exclusions = exclusions.map(normalizeName);
    saveState(); reschedule();
    return module.exports.getSummary();
  },
  runOnce,
};
