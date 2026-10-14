// Own the fixture server/data across independent Electron processes so restart
// persistence is checked without relying on a renderer reload or personal state.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const electron = require('electron');

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-builder-desktop-test-'));
  const requestPaths = [];
  const pids = [];
  const server = http.createServer((req, res) => {
    requestPaths.push(req.url);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Demo': 'synthetic' });
    res.end('[{"name":"alpha"},{"name":"beta"},{"name":"gamma"}]');
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${server.address().port}/demo`;
    async function run(phase) {
      const env = { ...process.env, CURL_BUILDER_SMOKE_PHASE: phase,
        CURL_BUILDER_SMOKE_DATA_DIR: dataDir, CURL_BUILDER_SMOKE_URL: url };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.VITE_DEV_SERVER_URL;
      await new Promise((resolve, reject) => {
        const child = spawn(electron, [path.join(__dirname, 'desktop-smoke.cjs')], { env, stdio: 'inherit' });
        pids.push(child.pid);
        const timeout = setTimeout(() => child.kill('SIGKILL'), 40000);
        child.once('error', (error) => { clearTimeout(timeout); reject(error); });
        child.once('close', (code, signal) => {
          clearTimeout(timeout);
          if (code === 0) resolve();
          else reject(new Error(`${phase} failed: exit=${code} signal=${signal}`));
        });
      });
    }
    await run('workflow');
    assert.deepEqual(requestPaths, ['/demo', '/template/second']);
    await run('restart');
    assert.deepEqual(requestPaths, ['/demo', '/template/second', '/template/restarted']);
    fs.copyFileSync(path.join(dataDir, 'config.json'), path.join(dataDir, 'config.valid.json'));
    fs.writeFileSync(path.join(dataDir, 'config.json'), '{broken synthetic config');
    await run('config-recovery');
    assert.equal(requestPaths.length, 3);
    assert.equal(new Set(pids).size, 3);
    console.log('DESKTOP_CHECK_PASSED: three distinct app processes; save/restart/replay and storage recovery');
  } finally {
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
