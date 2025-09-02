// services/instances.js
const cp = require('child_process');
const { VpnService } = require('./vpnService');

const VPNCMD_BIN = process.env.VPNCMD_BIN || 'vpncmd';
const HUB_NAME   = process.env.VPN_HUB || 'VPN';

function execVpnCmd(argsArray) {
  return new Promise((resolve, reject) => {
    const p = cp.spawn(VPNCMD_BIN, argsArray, { stdio: ['ignore','pipe','pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => {
      if (code === 0 || out) return resolve(out);
      reject(new Error(`vpncmd exit ${code}: ${err||out}`));
    });
  });
}

const vpnService = new VpnService({ hubName: HUB_NAME, execVpnCmd });
module.exports = { vpnService };
