// utils/ipam.js
const { readAll, upsert } = require('./pairStore');

function ipToInt(ip) { return ip.split('.').reduce((a,b)=>(a<<8)+(+b),0)>>>0; }
function intToIp(i)   { return [24,16,8,0].map(s=> (i>>>s)&255).join('.'); }

function parseCidr(cidr) {
  const [ip, maskStr] = cidr.split('/');
  const base = ipToInt(ip);
  const size = 2 ** (32 - (+maskStr));
  return { base, size };
}

/** Pastikan user punya /32 unik dari ANDROID_POOL_CIDR (default 10.88.0.0/16) */
function ensureAndroidIp(email) {
  const pool = process.env.ANDROID_POOL_CIDR || '10.88.0.0/16';
  const { base, size } = parseCidr(pool);
  const used = new Set(readAll().map(p => p.androidIp).filter(Boolean).map(x => x.split('/')[0]));
  for (let i = 10; i < size - 1; i++) { // offset dikit biar aman
    const cand = intToIp(base + i);
    if (!used.has(cand)) {
      const ip32 = `${cand}/32`;
      upsert({ email, androidIp: ip32 });
      return ip32;
    }
  }
  throw new Error('ANDROID_POOL_CIDR kehabisan alamat /32');
}

module.exports = { ensureAndroidIp };
