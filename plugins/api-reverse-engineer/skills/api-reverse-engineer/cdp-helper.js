// CDP Network Interception Helper
// Reusable Node.js scaffolding for capturing browser network traffic via Chrome DevTools Protocol.
// Requires: Node.js 22.4+ stable native WebSocket (no npm install)
// Requires: Edge/Chrome running with --remote-debugging-port=9222
// Edge/Chrome 136+: the debug port only binds on a distinct non-default --user-data-dir (a fresh,
//   no-SSO profile). For an authenticated session, capture via F12 HAR/Copy-as-cURL instead of CDP.
//
// Usage: Replace TARGET_DOMAIN and TARGET_API, add automation in the marked section, then run with node.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

function httpGet(u) {
  return new Promise((r, j) => {
    http.get(u, s => {
      let d = '';
      s.on('data', c => d += c);
      s.on('end', () => {
        if (s.statusCode < 200 || s.statusCode >= 300) {
          j(new Error(`GET ${u} failed with HTTP ${s.statusCode}: ${d.slice(0, 200)}`));
          return;
        }
        try {
          r(JSON.parse(d));
        } catch (e) {
          j(new Error(`GET ${u} did not return JSON: ${e.message}`));
        }
      });
    }).on('error', e => {
      j(new Error(`Cannot connect to ${u}. Start Edge/Chrome with --remote-debugging-port=9222. ${e.message}`));
    });
  });
}

(async () => {
  let pages;
  try {
    pages = await httpGet('http://127.0.0.1:9222/json/list');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const pg = pages.find(p => p.url && p.url.includes('TARGET_DOMAIN'));
  if (!pg) {
    console.error('No page matched TARGET_DOMAIN. Discovered URLs:');
    pages.forEach(p => console.error('-', p.url));
    process.exit(1);
  }
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  let mid = 0;
  const timeout = setTimeout(() => { ws.close(); process.exit(1); }, 60000);

  function send(m, p = {}) {
    return new Promise((r, j) => {
      const i = ++mid;
      const t = setTimeout(() => { ws.removeEventListener('message', h); j(new Error('timeout')); }, 20000);
      const h = event => {
        const msg = JSON.parse(event.data);
        if (msg.id === i) { clearTimeout(t); ws.removeEventListener('message', h); r(msg.result); }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });
  }

  async function evalJS(e) {
    return (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
  }

  ws.addEventListener('open', async () => {
    let exitCode = 0;
    try {
      await send('Network.enable', {});
      const captured = [];
      ws.addEventListener('message', event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.method === 'Network.requestWillBeSent') {
            const req = msg.params.request;
            if (req.url.includes('TARGET_API')) {
              captured.push({ rid: msg.params.requestId, url: req.url,
                method: req.method, headers: req.headers, postData: req.postData });
            }
          }
          if (msg.method === 'Network.responseReceived') {
            const f = captured.find(c => c.rid === msg.params.requestId);
            if (f) f.status = msg.params.response.status;
          }
        } catch (x) {
          console.error('Failed to parse CDP message:', x.message);
        }
      });

      // === YOUR AUTOMATION HERE ===
      // await evalJS(`document.querySelector('button.submit').click()`);

      // Wait for either manual user action or scripted automation to trigger network calls.
      await new Promise(r => setTimeout(r, 10000));

      // === HARVEST ===
      const post = captured.find(c => c.postData && c.postData.length > 50);
      if (post) {
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-capture-'));
        try {
          fs.chmodSync(outDir, 0o700);
        } catch (e) {
          console.warn('Could not restrict temp directory permissions:', e.message);
        }
        fs.writeFileSync(path.join(outDir, 'captured_payload.txt'), post.postData);
        fs.writeFileSync(path.join(outDir, 'captured_headers.json'),
          JSON.stringify(post.headers, null, 2));
        console.log('Captured!', post.postData.length, 'bytes, status:', post.status, 'output:', outDir);
      } else {
        console.error('No matching POST payload captured. Trigger the UI action during the wait window or increase the delay.');
        exitCode = 2;
      }
    } catch (e) {
      console.error('Error:', e.message);
      exitCode = 1;
    }
    clearTimeout(timeout);
    ws.close();
    process.exit(exitCode);
  });
})();
