---
name: api-reverse-engineer
description: |
  Reverse-engineer undocumented web APIs by intercepting browser network traffic via CDP.
  Use when you need to automate a web app that has no public API, or when the documented
  API doesn't work but the UI does. Captures exact payloads, headers, and auth tokens from
  live browser sessions. Triggers: "reverse engineer", "intercept", "capture the request",
  "sniff the API", "what does the UI actually send", "replay the request", "hack the API".
license: MIT
allowed-tools: Bash, PowerShell
---

# API Reverse Engineering via CDP Network Interception

## When to Use

- A web app's documented API (Swagger/OpenAPI) doesn't match what the UI actually sends
- You need to automate form submissions that use undocumented internal endpoints
- The API returns errors but the same action works through the UI
- You need auth tokens that are only available in the browser session
- You want to understand exactly what payload format a React/Angular app constructs

## Core Technique: CDP Network Domain

Chrome DevTools Protocol (CDP) lets you monitor ALL network requests from a browser tab,
including request/response headers, POST bodies, and auth tokens — without modifying the
page or installing extensions.

### Prerequisites

1. **Edge/Chrome running with `--remote-debugging-port=9222`**
2. **Node.js** with `ws` package: `npm install ws`
3. User must be **authenticated** in the browser to the target app

### Step-by-Step Workflow

> **Note:** The step-by-step snippets below use top-level `await` with CommonJS `require()` for
> brevity and won't run directly as `node script.js`. See the
> [CDP Helper Pattern](#the-cdp-helper-pattern) below for a complete, self-contained script that
> combines all steps with proper `send()`, `fs`, and async IIFE scaffolding.

#### 1. Connect to the Target Page

```javascript
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

// List browser pages via CDP HTTP API
const pages = await httpGet('http://127.0.0.1:9222/json/list');
const targetPage = pages.find(p => p.url.includes('your-app.com'));

// Connect via WebSocket
const ws = new WebSocket(targetPage.webSocketDebuggerUrl);
```

#### 2. Enable Network Capture (inside ws.on('open'))

```javascript
ws.on('open', async () => {
  // IMPORTANT: All send() calls must be inside ws.on('open')
  await send('Network.enable', {});
  
  const captured = [];
  
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    
    // Capture outgoing requests (with POST bodies)
    if (msg.method === 'Network.requestWillBeSent') {
      const req = msg.params.request;
      if (req.url.includes('your-api-domain.com')) {
        captured.push({
          requestId: msg.params.requestId,
          url: req.url,
          method: req.method,
          headers: req.headers,   // FULL headers including auth tokens
          postData: req.postData  // FULL POST body
        });
      }
    }
    
    // Capture response status
    if (msg.method === 'Network.responseReceived') {
      const match = captured.find(c => c.requestId === msg.params.requestId);
      if (match) match.status = msg.params.response.status;
    }
  });
});
```

#### 3. Trigger the Action

Use `Runtime.evaluate` to fill forms and click buttons:

```javascript
async function evalJS(expr) {
  return (await send('Runtime.evaluate', {
    expression: expr, returnByValue: true
  })).result.value;
}

// Click Submit
await evalJS(`document.querySelector('button.submit').click()`);
```

#### 4. Harvest the Captured Payload

> **⚠️ Security:** Captured headers typically include Bearer tokens, cookies, and session
> credentials. Treat output files as secrets — write to a temp directory, never commit them,
> and delete after use.

```javascript
// Wait for the API call
await new Promise(r => setTimeout(r, 10000));

// Find the POST with actual data
const post = captured.find(c => c.postData && c.postData.length > 50);
if (post) {
  fs.writeFileSync('captured_payload.json', post.postData);
  fs.writeFileSync('captured_headers.json', JSON.stringify(post.headers, null, 2));
  console.log('PAYLOAD CAPTURED!', post.url, post.postData.length, 'bytes');
}
```

#### 5. Replay with Modifications

```powershell
# Parse captured payload, swap fields, replay
$payload = Get-Content 'captured_payload.json' | ConvertFrom-Json
$payload.title = 'New Title'
$headers = Get-Content 'captured_headers.json' | ConvertFrom-Json
$url = 'https://your-api-domain.com/endpoint'  # from the captured request's URL

$result = Invoke-RestMethod -Uri $url -Method Post `
  -Headers @{ Authorization = $headers.Authorization } `
  -Body ($payload | ConvertTo-Json -Depth 5) `
  -ContentType 'application/json'
```

## Tips & Tricks

### React Input Fields

React controls inputs via synthetic events. Native `el.value = 'x'` won't update React state.
Use the property descriptor trick:

```javascript
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(el, value);
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
```

For stubborn custom components (Fluent UI DatePicker, TagPicker), fall back to
`Input.insertText` via CDP after clicking the element coordinates. If even that fails,
ask the user to fill those 1-2 fields manually — then capture the network on Submit.

### Auth Token Extraction

SPAs often store auth tokens in `sessionStorage`:

```javascript
const tokens = await evalJS(`JSON.stringify({
  jwt: sessionStorage.getItem('jwtTokenForApi'),
  graph: sessionStorage.getItem('jwtTokenForGraph')
})`);
```

Tokens expire in 30-60 minutes. For replays, extract fresh tokens each session.

### Swagger vs Reality

**Swagger/OpenAPI specs often don't match the actual UI payload format.** The UI may:
- Use a completely different DTO shape (flat vs nested)
- Include undocumented fields (`fieldsDisabled`, `areaId`, `eouId`)
- Use different field names (`assignToCorpObj` vs `assignToCorp`)
- Require arrays where the schema says string
- Skip server-side validation that the API endpoint enforces

**Always trust the captured payload over the docs.**

### Getting Response Bodies

```javascript
// After Network.responseReceived fires:
const body = await send('Network.getResponseBody', { requestId: reqId });
console.log('Response:', body.body);
```

### The CDP Helper Pattern

Reusable Node.js scaffolding for any interception task:

```javascript
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
  const pg = pages.find(p => p.url.includes('TARGET_DOMAIN'));
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
      // Fill forms, click buttons, wait for network...

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
```

### Common Pitfalls

1. **WebSocket not open**: All `send()` calls must be inside `ws.on('open', ...)` — never at
   the top level. This is the #1 cause of `readyState 0 (CONNECTING)` errors
2. **Multiple pages**: New tabs get different WebSocket URLs — re-query `/json/list`
3. **Token expiry**: Re-extract tokens if replaying hours later
4. **evalJS returns undefined**: `scrollIntoView()` returns undefined — always append `; 'ok'`
   to void expressions to avoid JSON.parse errors
5. **Empty payloads creating garbage**: Validate payload completeness before POSTing. Always
   check that title, required IDs, and key fields are populated
6. **Form validation race**: React validation may be async — wait 2-5 seconds after filling
   before checking if Submit is enabled

## Real-World Success: UATracker

This technique reverse-engineered Microsoft's UATracker for Azure AI Capacity requests:

- **Swagger API** used `ActionCreationRequest` schema with 200+ fields — crashed on Claude models
- **UI interception** revealed a flat payload with ~25 fields (completely different schema)
- **The UI's endpoint returned 200** while the documented endpoint returned 500 for the same data
- Auth required 3 JWTs (`Authorization`, `GraphToken`, `CoreApiToken`) extracted from `sessionStorage`
- The captured payload became a replayable template: swap 3 fields (title, model, requestId) → instant automation
