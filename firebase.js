// firebase.js
const admin = require('firebase-admin');
const fs = require('fs');
const cfg = require('./config');

const svc = cfg.paths.serviceAccount;
let db = null;

if (fs.existsSync(svc)) {
  admin.initializeApp({
    credential: admin.credential.cert(require(svc))
  });
  db = admin.firestore();
} else {
  console.warn('serviceAccountKey.json not found in vpn-api folder — Firestore features disabled.');
}

module.exports = { admin, db };
