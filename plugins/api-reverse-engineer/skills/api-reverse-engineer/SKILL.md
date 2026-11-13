---
name: api-reverse-engineer
description: |
  Capture, select, and replay an authorized web API request from an established Chrome DevTools
  Protocol (CDP) connection. Use when the browser UI is the reliable API reference and you need the
  exact request method, URL, payload, response, or replay shape.
license: MIT
allowed-tools: Bash, PowerShell
---

# API Reverse Engineer

Own authorized network capture and replay after a CDP connection exists. Use `edge-browser` for Edge
profile selection, SSO routing, endpoint discovery, and connection policy.

## Preconditions

- The user is authorized to access the target system and perform the captured action.
- You have one of:
  - a page WebSocket URL from a fixed-port `/json/list` endpoint;
  - a browser WebSocket URL plus a target page URL; or
  - a standalone fixed-port endpoint such as `http://127.0.0.1:9222`.
- The exact request method and URL are known. Do not select by substring or "first POST".
- Node.js 22.4+ is available for the native `WebSocket` client.

## Safety

- Observe passively by default. Trigger a UI action only after the user authorizes it.
- Treat request bodies, response bodies, cookies, authorization headers, and signed URLs as secrets.
- Keep captures in a protected temporary directory. Never commit them.
- The helper redacts `Authorization`, `Cookie`, `Proxy-Authorization`, and `Set-Cookie` headers by
  default. Do not weaken that default.

## Capture

Use `cdp-helper.js` from this skill directory.

Established page WebSocket:

```powershell
node cdp-helper.js `
  --endpoint 'ws://127.0.0.1:9222/devtools/page/<id>' `
  --method POST `
  --url 'https://app.example.com/api/items' `
  --response-body
```

Established browser WebSocket with a flattened target session:

```powershell
node cdp-helper.js `
  --endpoint 'ws://127.0.0.1:<port>/devtools/browser/<id>' `
  --page-url 'https://app.example.com/items' `
  --method POST `
  --url 'https://app.example.com/api/items'
```

Standalone fixed-port path:

```powershell
node cdp-helper.js `
  --endpoint 'http://127.0.0.1:9222' `
  --page-url 'https://app.example.com/items' `
  --method POST `
  --url 'https://app.example.com/api/items'
```

Equivalent environment variables are `CDP_ENDPOINT`, `CDP_PAGE_URL`, `CDP_METHOD`,
`CDP_REQUEST_URL`, `CDP_WAIT_MS`, `CDP_OUTPUT_DIR`, and `CDP_CAPTURE_RESPONSE_BODY=1`.

During the capture window, ask the user to perform the authorized action or run separately approved
automation. The helper exits with failure when zero or multiple requests match the exact method and
URL.

## Replay

1. Read the redacted capture from the reported temporary path.
2. Validate required fields and identify values that must be refreshed.
3. Obtain current credentials from an approved source without printing or persisting them.
4. Replay with `Invoke-RestMethod`, `curl`, or the system's supported client.
5. Confirm the response and resulting system state. Do not treat HTTP success alone as proof.

## Exit criteria

Stop when one of these outcomes is true:

- **Captured:** exactly one request matched, the requested body data was collected, and the redacted
  artifact path was reported.
- **No match:** no request used the exact method and URL during the window.
- **Ambiguous:** more than one request matched; narrow the action or repeat in a clean window.
- **Blocked:** the CDP connection closed, target selection was ambiguous, response-body retrieval
  failed, or authorization for the browser action was not granted.
