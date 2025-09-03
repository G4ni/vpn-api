// services/instances.js
const { VpnService } = require('./vpnService');
const { queuedVpncmd } = require('../utils/softetherExec');

const HUB_NAME = process.env.VPN_HUB || 'VPN';

function execVpnCmd(argsArray) {
  return queuedVpncmd(argsArray);
}

const vpnService = new VpnService({ hubName: HUB_NAME, execVpnCmd });
module.exports = { vpnService };
