// cleanup.js
const { db, admin } = require('./firebase');
const { deleteVpnUserByEmail } = require('./vpnManager'); // if present or replicate logic

(async () => {
  if (!db) {
    console.error('No Firestore configured - cannot run cleanup');
    process.exit(1);
  }
  const cutoff = new Date(Date.now() - 30*24*60*60*1000);
  const snap = await db.collection('vpn_users').where('lastLoginAt', '<', admin.firestore.Timestamp.fromDate(cutoff)).get();
  for (const doc of snap.docs) {
    const email = doc.id;
    try {
      // try delete via runVpnCmd directly or call existing delete route
      console.log('Should delete:', email);
      // You can call API route or implement deleteUser here.
    } catch (e) {
      console.warn('cleanup error', e.message || e);
    }
  }
  process.exit(0);
})();
