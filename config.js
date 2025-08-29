// config.js
require('dotenv').config();
const path = require('path');

module.exports = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0'
  },
  softether: {
    server: process.env.SE_SERVER || '127.0.0.1',
    port: process.env.SE_PORT || '5555',
    hub: process.env.SE_HUB || 'VPN',
    hubPassword: process.env.SE_HUB_PASSWORD || ''
  },
  ovpn: {
    host: process.env.OVPN_SERVER_HOST || '127.0.0.1',
    port: process.env.OVPN_SERVER_PORT || '1194',
    proto: process.env.OVPN_PROTO || 'udp'
  },
  paths: {
    templates: path.join(__dirname, 'templates'),
    configs: path.join(__dirname, 'configs'),
    serviceAccount: path.join(__dirname, 'serviceAccountKey.json')
  }
};
