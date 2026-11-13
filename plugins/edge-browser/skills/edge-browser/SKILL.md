---
name: edge-browser
description: |
  Establish and verify a Microsoft Edge Chrome DevTools Protocol (CDP) connection, either with an
  isolated debug profile or through Edge's human-approved connection to the real signed-in profile.
  Use for profile selection, CDP endpoint discovery, managed-device SSO, Conditional Access, or
  deciding whether browser automation can proceed safely.
license: MIT
allowed-tools: PowerShell, Chrome DevTools
---

# Edge Browser

Own profile selection and CDP connection setup. After the connection is established, use the
`api-reverse-engineer` skill for authorized network capture and replay.

## Safety rules

- Never type credentials or approve Edge's **Allow remote debugging?** prompt for the user.
- Keep CDP on loopback. Do not expose the port to the network.
- Never change or bypass enterprise policy.
- Do not close or kill the user's normal Edge session.
- Treat tokens, cookies, HAR files, and copied requests as secrets. Do not print or commit them.
- Do not use `--remote-allow-origins=*` by default. Omit the switch unless the client rejects the
  connection; if needed, allow only the exact client origin.

## Choose a profile

| Need | Path |
| --- | --- |
| Unattended automation, public sites, or a reusable isolated login | Dedicated debug profile |
| Existing work SSO, managed-device authentication, or Conditional Access | Real signed-in profile |

Use the dedicated profile unless the task specifically requires the real profile. Read
[the dated evidence ledger](references/evidence.md) when behavior differs, policy is involved, or
you need the observations behind this routing.

## Dedicated debug profile

1. Launch Edge with a non-default data directory. Edge 136+ ignores remote-debugging switches on
   the default data directory.

   ```powershell
   $port = 9222
   $dir = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\CdpDebugProfile'
   Start-Process msedge -ArgumentList @(
     "--remote-debugging-port=$port",
     "--user-data-dir=`"$dir`"",
     '--no-first-run',
     '--no-default-browser-check',
     '<START_URL>'
   )
   ```

2. Poll `http://127.0.0.1:9222/json/version`. Confirm `Browser` contains `Edg/`.
3. If authentication is required, hand the one-time sign-in to the user. Reuse this directory on
   later runs; do not clone cookies from the default profile.
4. Select the intended page from `/json/list` and reuse its `webSocketDebuggerUrl`.

If the WebSocket rejects its origin, identify the exact origin sent by the client and relaunch with
`--remote-allow-origins=<exact-origin>`. Do not broaden it to `*`.

## Real signed-in profile

1. Use Edge's in-browser remote-debugging opt-in. Do not launch the default profile with
   `--remote-debugging-port`; observed Edge builds suppress the opt-in listener when that switch is
   present.
2. Poll `%LOCALAPPDATA%\Microsoft\Edge\User Data\DevToolsActivePort`.
3. Build the browser WebSocket URL from line 1 (port) and line 2 (path):
   `ws://127.0.0.1:<port><path>`.
4. Connect once and wait for the user to click **Allow**. Use a generous open timeout.
5. On that same socket, call `Target.getTargets`, select the agreed page, and call
   `Target.attachToTarget` with `flatten: true`. Send page commands with the returned `sessionId`.

The browser endpoint exposes the whole profile. Limit commands to the agreed target and keep one
long-lived connection so the user is not prompted repeatedly.

## Verify the connection

- Confirm the browser is Edge with `/json/version` on a fixed port or `Browser.getVersion` on a
  browser WebSocket.
- Confirm the selected target URL exactly matches the intended page.
- If another browser tool is available, compare its page list with the CDP target list before using
  it. A Playwright `chromium.launch()` call starts a separate browser; `connectOverCDP()` attaches to
  an existing Chromium-based browser.
- Default to passive inspection. Navigate, click, or fill only when the user authorized that action.

## Exit criteria

Stop when one of these outcomes is true:

- **Ready:** the Edge identity and target URL are verified, and you have either a page WebSocket or a
  browser WebSocket plus flattened `sessionId`.
- **Human handoff:** the user must sign in or approve Edge's connection prompt.
- **Blocked:** enterprise policy, unavailable DevTools, or a declined prompt prevents the connection.
  Report the gate without attempting a bypass.
