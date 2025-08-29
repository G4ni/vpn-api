const { exec } = require('child_process');
require('dotenv').config();

function runVpnCmd(commands) {
  return new Promise((resolve, reject) => {
    const server = process.env.SE_SERVER || '127.0.0.1';
    const port = process.env.SE_PORT || '5555';
    const hub = process.env.SE_HUB || 'VPN';
    const hubPass = process.env.SE_HUB_PASSWORD || '';

    const block = Array.isArray(commands) ? commands.join('\n') : commands;
    // vpncmd server:port /SERVER /CMD "Hub <hub>\nPassword <pass>\n<commands>\nExit"
    const cmd = `vpncmd ${server}:${port} /SERVER /CMD "Hub ${hub}\nPassword ${hubPass}\n${block}\nExit"`;

    exec(cmd, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || stdout || err.message));
      resolve(stdout.toString());
    });
  });
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
