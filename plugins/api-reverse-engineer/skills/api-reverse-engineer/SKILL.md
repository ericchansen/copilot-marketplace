---
name: api-reverse-engineer
description: |
  Reverse-engineer undocumented web APIs by intercepting browser network traffic via CDP.
  Use when you need to automate a web app that has no public API, or when the documented
  API doesn't work but the UI does. Captures exact payloads and request headers from
  live browser sessions. Triggers: "reverse engineer", "intercept", "capture the request",
  "sniff the API", "what does the UI actually send", "replay the request", "hack the API".
license: MIT
allowed-tools: Bash, PowerShell
---

# API Reverse Engineering via CDP Network Interception

## When to Use

- A web app's documented API doesn't match what the UI actually sends
- You need auth tokens only available in the browser session
- The API returns errors but the same action works through the UI

## Prerequisites

1. Edge or Chrome running with `--remote-debugging-port=9222`. If you have an Edge/browser helper skill installed, you can use it to launch the browser.
2. Node.js with `ws` package: `npm install ws`
3. User must be authenticated in the browser to the target app

## Authorization and Data Handling

- Only capture requests for systems you are authorized to use.
- Treat captured headers, cookies, authorization credentials, and session values as secrets.
- Write captured payloads and headers only to temporary files.
- Never commit captured headers, tokens, cookies, customer data, or internal payloads.

## Workflow

1. **Connect** — Read `cdp-helper.js` in this skill's directory for the reusable CDP scaffolding. Copy it, replace `TARGET_DOMAIN` and `TARGET_API` with the actual values.
2. **Capture** — Enable `Network.enable`, listen for `Network.requestWillBeSent` events. Filter by API domain.
3. **Trigger the action** — Use `Runtime.evaluate` to fill forms and click buttons, or ask the user to perform the action manually in their browser.
4. **Harvest** — Extract the captured POST body and headers (including auth tokens). Write to temp files. **Treat captured headers as secrets — never commit them.**
5. **Replay** — Parse the captured payload, modify fields as needed, replay with `Invoke-RestMethod` or `curl`.

## Tips

- **React inputs**: Native `el.value = 'x'` won't work. Use the property descriptor trick: `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)` then dispatch `input` and `change` events.
- **Auth tokens**: SPAs often store JWTs in `sessionStorage`. Extract with `evalJS`. Tokens expire in 30-60 min.
- **Swagger vs Reality**: Always trust the captured payload over the docs. The UI often uses a completely different DTO shape.
- **Response bodies**: Use `Network.getResponseBody` with the requestId after `Network.responseReceived` fires.

## Pitfalls

1. All `send()` calls must be inside `ws.on('open', ...)` — #1 cause of `readyState 0` errors
2. New tabs get different WebSocket URLs — re-query `/json/list` after navigation
3. `evalJS` on void expressions (like `scrollIntoView()`) returns undefined — append `; 'ok'`
4. React validation may be async — wait 2-5 seconds after filling before checking Submit state
5. Validate payload completeness before replaying — empty fields create garbage records
