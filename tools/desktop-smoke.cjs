const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');

// Launched only by the Node controller with its owned synthetic data directory.
const dataDir = process.env.CURL_BUILDER_SMOKE_DATA_DIR;
const url = process.env.CURL_BUILDER_SMOKE_URL;
const phase = process.env.CURL_BUILDER_SMOKE_PHASE;
if (!dataDir || !url || !phase) throw new Error('Run npm run test:desktop');
process.env.CURL_BUILDER_DATA_DIR = dataDir;
const watchdog = setTimeout(() => finish(new Error('Desktop smoke timed out')), 35000);
let finished = false;
function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(watchdog);
  if (error) console.error(error);
  console.log(error ? 'DESKTOP_SMOKE_FAILED' : 'DESKTOP_SMOKE_PASSED');
  app.exit(error ? 1 : 0);
}
function waitFor(win, expression) {
  return new Promise(async (resolve, reject) => {
    const deadline = Date.now() + 7000;
    try {
      while (Date.now() < deadline) {
        if (await win.webContents.executeJavaScript(expression)) return resolve();
        await new Promise(r => setTimeout(r, 50));
      }
      reject(new Error('Renderer condition timed out: ' + expression));
    } catch (e) { reject(e); }
  });
}
  let primaryWindowSeen = false;
  app.on('browser-window-created', (_event, win) => {
    if (primaryWindowSeen) return;
    primaryWindowSeen = true;
    win.webContents.once('did-finish-load', async () => {
      try {
        if (phase === 'config-recovery') {
          await waitFor(win, `Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Retry setup')`);
          assert.equal(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'), '{broken synthetic config');
          assert(await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).filter(b => ['Run', 'Save as template', 'Global curl options'].includes(b.textContent)).every(b => b.disabled)`));
          fs.copyFileSync(path.join(dataDir, 'config.valid.json'), path.join(dataDir, 'config.json'));
          await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Retry setup').click()`);
          await waitFor(win, `!!document.querySelector('.template-item') && !document.querySelector('.template-item').disabled`);
          finish();
          return;
        }
        await waitFor(win, `!!window.shell && !!document.querySelector('input[placeholder="https://"]')`);
        // Wait for asynchronous storage/config initialization before editing.
        await waitFor(win, `document.querySelector('textarea[placeholder="curl ... | jq ... | grep ..."]')?.value.includes('curl')`);
        await waitFor(win, `Array.from(document.querySelectorAll('.toolbar button')).some(b => b.textContent === 'Run' && !b.disabled)`);
        if (phase === 'workflow') {
          console.log('SECURITY_CHECK: sandbox/CSP');
          const prefs = win.webContents.getLastWebPreferences();
          assert.equal(prefs.sandbox, true);
          assert.equal(prefs.nodeIntegration, false);
          assert.equal(prefs.contextIsolation, true);
          assert(await win.webContents.executeJavaScript(`typeof window.process === 'undefined' && !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')`));
          await win.webContents.executeJavaScript(`
            const script = document.createElement('script');
            script.textContent = 'window.__inlineScriptRan = true';
            document.head.appendChild(script);
          `);
          assert(await win.webContents.executeJavaScript(`window.__inlineScriptRan !== true`));
          console.log('SECURITY_CHECK: payload/log rejection');
          assert(await win.webContents.executeJavaScript(`window.shell.runJq({ expr: '.', jsonInput: '{}', jqBinaryPath: '/bin/sh' }).then(() => false, () => true)`));
          assert(await win.webContents.executeJavaScript(`window.shell.runCurl({ request: {}, extraCurlArgs: ['--output', '/tmp/do-not-write'] }).then(() => false, () => true)`));
          assert(await win.webContents.executeJavaScript(`window.shell.writeRunLog('synthetic-do-not-log').then(() => false, () => true)`));
          console.log('SECURITY_CHECK: navigation/popups');
          const originalURL = win.webContents.getURL();
          await win.webContents.executeJavaScript(`window.open(${JSON.stringify(url + '/popup')}); location.href = ${JSON.stringify(url + '/navigation')}; undefined`);
          await new Promise(r => setTimeout(r, 100));
          assert.equal(win.webContents.getURL(), originalURL);
          assert.equal(BrowserWindow.getAllWindows().length, 1);
          console.log('SECURITY_CHECK: untrusted window');
          const foreign = new BrowserWindow({ show: false, webPreferences: { preload: path.join(ROOT, 'dist/preload/preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
          try {
            await foreign.loadURL(originalURL);
            await waitFor(foreign, '!!window.shell');
            assert(await foreign.webContents.executeJavaScript(`window.shell.runJq({ expr: '.', jsonInput: '{}' }).then(() => false, () => true)`));
          } finally { foreign.destroy(); }
        }
        if (phase === 'restart') {
          await waitFor(win, `document.querySelector('.template-item')?.textContent.includes('Synthetic reusable request') && !document.querySelector('.template-item').disabled`);
          assert(await win.webContents.executeJavaScript(`document.querySelector('.list')?.textContent.includes('Synthetic reusable request') && Array.from(document.querySelectorAll('.list-item')).some(e => e.textContent === 'No runs yet')`));
          await win.webContents.executeJavaScript(`document.querySelector('.template-item').click()`);
          await waitFor(win, `!!document.querySelector('#template-var-ITEM')`);
          await win.webContents.executeJavaScript(`
            const input = document.querySelector('#template-var-ITEM');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'restarted');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          `);
          await win.webContents.executeJavaScript(`Array.from(document.querySelector('[aria-labelledby="template-vars-title"]').querySelectorAll('button')).find(b => b.textContent === 'Run').click()`);
          await waitFor(win, `document.querySelector('.code-block pre')?.textContent.trim() === '2:"beta"' && document.querySelector('.toolbar')?.textContent.includes('grep/rg done')`);
          // A corrupt template file must be preserved and recoverable on retry.
          const file = path.join(dataDir, 'templates.json');
          const saved = fs.readFileSync(file, 'utf8');
          fs.writeFileSync(file, '{broken synthetic templates');
          win.webContents.reload();
          await waitFor(win, `Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Retry setup')`);
          assert.equal(fs.readFileSync(file, 'utf8'), '{broken synthetic templates');
          assert(await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).filter(b => ['Run', 'Save as template'].includes(b.textContent)).every(b => b.disabled)`));
          fs.writeFileSync(file, saved);
          await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Retry setup').click()`);
          await waitFor(win, `!!document.querySelector('.template-item') && !document.querySelector('.template-item').disabled`);
          finish();
          return;
        }
        await win.webContents.executeJavaScript(`
          function setInput(placeholder, value) {
            const input = document.querySelector('input[placeholder="' + placeholder + '"]');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          setInput('https://', ${JSON.stringify(url)});
        `);
        await waitFor(win, `document.querySelector('textarea[placeholder="curl ... | jq ... | grep ..."]').value.includes(${JSON.stringify(url)})`);
        await win.webContents.executeJavaScript(`setInput('.data', '.[].name')`);
        await waitFor(win, `document.querySelector('textarea[placeholder="curl ... | jq ... | grep ..."]').value.includes('jq')`);
        await win.webContents.executeJavaScript(`setInput('pattern or regex', 'beta')`);
        await waitFor(win, `document.querySelector('textarea[placeholder="curl ... | jq ... | grep ..."]').value.includes('beta')`);
        await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Run').click()`);
        await waitFor(win, `document.querySelector('.code-block pre')?.textContent.trim() === '2:"beta"'`);
        await waitFor(win, `document.querySelector('.toolbar')?.textContent.includes('grep/rg done')`);
        fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
        // DOM assertions can complete before Chromium has painted the final frame.
        await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        await new Promise(r => setTimeout(r, 150));
        const screenshot = await win.webContents.capturePage();
        fs.writeFileSync(path.join(ROOT, 'docs', 'synthetic-workflow.png'), screenshot.toPNG());
        await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'raw (curl only)').click()`);
        await waitFor(win, `document.querySelector('.code-block pre')?.textContent.includes('X-Demo: synthetic')`);
        const log = fs.readFileSync(path.join(dataDir, 'run.log'), 'utf8');
        assert(!log.includes(url));
        assert(!log.includes('beta'));
        assert(!fs.existsSync(path.join(dataDir, 'history.json')));

        // The learning/reuse journey uses only the synthetic local server.
        const templateUrl = url.replace('/demo', '/template/{{ITEM}}');
        await win.webContents.executeJavaScript(`setInput('https://', ${JSON.stringify(templateUrl)})`);
        await waitFor(win, `document.querySelector('textarea[placeholder="curl ... | jq ... | grep ..."]').value.includes(${JSON.stringify(templateUrl)})`);
        await win.webContents.executeJavaScript(`
          const command = document.querySelector('textarea[placeholder="curl ... | jq ... | grep ..."]');
          command.focus();
          const start = command.value.indexOf('-sS');
          command.setSelectionRange(start, start + 3);
          command.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        `);
        await waitFor(win, `document.querySelector('.flag-tooltip-desc')?.textContent.includes('Silent output')`);
        await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save as template').click()`);
        await waitFor(win, `!!document.querySelector('#template-name')`);
        await win.webContents.executeJavaScript(`
          const name = document.querySelector('#template-name');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(name, 'Synthetic reusable request');
          name.dispatchEvent(new Event('input', { bubbles: true }));
        `);
        await win.webContents.executeJavaScript(`document.querySelector('form[role="dialog"]').requestSubmit()`);
        await waitFor(win, `document.querySelector('.toolbar')?.textContent.includes('Template saved')`);
        const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'templates.json'), 'utf8'));
        assert.equal(saved[0].urlTemplate, templateUrl);
        assert.equal(saved[0].jqExpression, '.[].name');
        assert.deepEqual(saved[0].grepPatterns, ['beta']);
        assert(!JSON.stringify(saved).includes('resolvedVariables'));

        win.webContents.reload();
        await waitFor(win, `document.querySelector('.template-item')?.textContent.includes('Synthetic reusable request')`);
        await win.webContents.executeJavaScript(`
          function editUrl(value) {
            const input = document.querySelector('input[placeholder="https://"]');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          editUrl(${JSON.stringify(url.replace('/demo', '/previous'))});
          document.querySelector('.template-item').click();
        `);
        await waitFor(win, `!!document.querySelector('#template-var-ITEM')`);
        await win.webContents.executeJavaScript(`
          const value = document.querySelector('#template-var-ITEM');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(value, 'second');
          value.dispatchEvent(new Event('input', { bubbles: true }));
        `);
        await win.webContents.executeJavaScript(`Array.from(document.querySelector('[aria-labelledby="template-vars-title"]').querySelectorAll('button')).find(b => b.textContent === 'Run').click()`);
        await waitFor(win, `document.querySelector('.code-block pre')?.textContent.trim() === '2:"beta"'`);
        await waitFor(win, `document.querySelector('.toolbar')?.textContent.includes('grep/rg done')`);
        await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Run').click()`);
        await waitFor(win, `document.querySelector('[placeholder="https://"]')?.value.includes('{{ITEM}}') && !!document.querySelector('[aria-labelledby="template-vars-title"]') === false && Array.from(document.querySelectorAll('.section-title')).some(e => e.textContent === 'Provide variable values')`);
        finish();
      } catch (e) { finish(e); }
    });
  });
  require(path.join(ROOT, 'dist/main/main.js'));
