// CDP Network Interception Helper
// Reusable Node.js scaffolding for capturing browser network traffic via Chrome DevTools Protocol.
// Requires: npm install ws
// Requires: Edge/Chrome running with --remote-debugging-port=9222
//
// Usage: Replace TARGET_DOMAIN and TARGET_API, add automation in the marked section, then run with node.

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

function httpGet(u) {
  return new Promise((r, j) => {
    http.get(u, s => { let d = ''; s.on('data', c => d += c); s.on('end', () => r(JSON.parse(d))); }).on('error', j);
  });
}

(async () => {
  const pages = await httpGet('http://127.0.0.1:9222/json/list');
  const pg = pages.find(p => p.url && p.url.includes('TARGET_DOMAIN'));
  if (!pg) {
    console.error('No page matched TARGET_DOMAIN. Discovered URLs:');
    pages.forEach(p => console.error('-', p.url));
    process.exit(1);
  }
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  let mid = 0;

  function send(m, p = {}) {
    return new Promise((r, j) => {
      const i = ++mid;
      const t = setTimeout(() => { ws.off('message', h); j(new Error('timeout')); }, 20000);
      const h = d => {
        const msg = JSON.parse(d.toString());
        if (msg.id === i) { clearTimeout(t); ws.off('message', h); r(msg.result); }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });
  }

  async function evalJS(e) {
    return (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
  }

  ws.on('open', async () => {
    try {
      await send('Network.enable', {});
      const captured = [];
      ws.on('message', raw => {
        try {
          const msg = JSON.parse(raw.toString());
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
        } catch (x) {}
      });

      // === YOUR AUTOMATION HERE ===
      // await evalJS(`document.querySelector('button.submit').click()`);
      // await new Promise(r => setTimeout(r, 10000));

      // === HARVEST ===
      const post = captured.find(c => c.postData && c.postData.length > 50);
      if (post) {
        fs.writeFileSync(path.join(os.tmpdir(), 'captured_payload.json'), post.postData);
        fs.writeFileSync(path.join(os.tmpdir(), 'captured_headers.json'),
          JSON.stringify(post.headers, null, 2));
        console.log('Captured!', post.postData.length, 'bytes, status:', post.status);
      }
    } catch (e) { console.log('Error:', e.message); }
    ws.close(); process.exit(0);
  });
  setTimeout(() => { ws.close(); process.exit(1); }, 60000);
})();
