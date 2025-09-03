const { execFile } = require('child_process');
const { promisify } = require('util');
const exec = promisify(execFile);
const { enqueue } = require('./queue');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runVpnCmdSafe(argArr, { retries = 4, backoffMs = 200 } = {}) {
  const quoted = argArr.map(a => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ');
  const bashArgs = ['-lc', `flock -w 5 /tmp/vpncmd.lock vpncmd ${quoted}`];

  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const { stdout } = await exec('/bin/bash', bashArgs, { maxBuffer: 1024 * 1024 });
      return stdout;
    } catch (err) {
      const msg = `${err?.stdout || ''}\n${err?.stderr || ''}\n${err?.message || ''}`;
      if (/busy|locked|try again|timeout/i.test(msg) && i < retries) {
        await sleep(backoffMs * Math.pow(2, i));
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('vpncmd failed after retries');
}

function queuedVpncmd(argArr, opts) {
  return enqueue(() => runVpnCmdSafe(argArr, opts));
}

module.exports = { queuedVpncmd, runVpnCmdSafe };