const { queuedVpncmd } = require('./utils/softetherExec');
require('dotenv').config();

async function runVpnCmd(commands) {
  const server = process.env.SE_SERVER || '127.0.0.1';
  const port = process.env.SE_PORT || '5555';
  const hub = process.env.SE_HUB || 'VPN';
  const hubPass = process.env.SE_HUB_PASSWORD || '';

  const block = Array.isArray(commands) ? commands.join('\n') : commands;
  const args = [
    `${server}:${port}`,
    '/SERVER',
    '/CMD',
    `Hub ${hub}\nPassword ${hubPass}\n${block}\nExit`
  ];

  const out = await queuedVpncmd(args);
  return out.toString();
}

async function createUser(email, password) {
  const out = await runVpnCmd([
    `UserCreate ${email} /GROUP:none /REALNAME:none /NOTE:none`,
    `UserPasswordSet ${email} /PASSWORD:${password}`
  ]);
  return out;
}
async function deleteUser(email) {
  const out = await runVpnCmd([`UserDelete ${email}`]);
  return out;
}
async function sessionList() {
  const out = await runVpnCmd([`SessionList`]);
  return out;
}

module.exports = { runVpnCmd, createUser, deleteUser, sessionList };
