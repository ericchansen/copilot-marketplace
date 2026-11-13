# Edge CDP evidence ledger

Observed environment unless noted: Microsoft Edge Stable 153.0.4234.32 on Windows, one corporate
tenant and one personal account, 2026-09-15. These observations guide routing; they are not guarantees
for other builds, operating systems, tenants, or policies.

## Contents

- [Default profile debugging switches](#default-profile-debugging-switches)
- [Dedicated debug profile](#dedicated-debug-profile)
- [Cookie cloning](#cookie-cloning)
- [Persistent isolated sign-in](#persistent-isolated-sign-in)
- [Real-profile opt-in](#real-profile-opt-in)
- [Interaction behavior](#interaction-behavior)
- [Sleeping tabs](#sleeping-tabs)
- [Tooling and PowerShell](#tooling-and-powershell)
- [Policy gates](#policy-gates)
- [Token capture](#token-capture)
- [Fallbacks](#fallbacks)
- [Not tested](#not-tested)

## Default profile debugging switches

Launching Edge with `--remote-debugging-port=9222` or `--remote-debugging-pipe` against the default
`User Data` directory opened no listener. Changing only `--profile-directory` did not help. This
matches Chromium's Edge/Chrome 136+ anti-cookie-theft mitigation, which requires a non-default data
directory for those switches.

Consequence: use a separate data directory or Edge's in-browser opt-in.

Sources:

- <https://developer.chrome.com/blog/remote-debugging-port>
- <https://crbug.com/1414669>

## Dedicated debug profile

A non-default `--user-data-dir` with `--remote-debugging-port=9222` opened a loopback listener.
`http://127.0.0.1:9222/json/version` returned Edge identity, and raw CDP plus Playwright
`connectOverCDP()` attached successfully.

The original experiment also used `--remote-allow-origins=*`. That wildcard disables origin checks
for every local origin and is no longer recommended as the default. First omit the switch. If the
client is rejected, allow only the exact origin it sends.

`--profile-directory` can select profiles inside the non-default data directory.

## Cookie cloning

Copying the default profile's cookie database required elevation while Edge held the file. Even
after a successful copy, the cloned profile was signed out because App-Bound Encryption tied cookie
decryption to the original profile and data directory.

Consequence: do not clone cookies to transfer SSO.

## Persistent isolated sign-in

A one-time human sign-in inside the dedicated data directory persisted for later CDP runs against
that same directory.

Consequence: reuse the isolated directory when unattended automation needs an authenticated session.

## Real-profile opt-in

With the in-browser opt-in enabled, launching the default profile without
`--remote-debugging-port` produced a `DevToolsActivePort` file. Adding the port switch suppressed
that listener in an A/B/A test.

The file contained the browser-selected port and browser WebSocket path. The HTTP JSON endpoints
returned 404, but the browser WebSocket worked after a human approved **Allow remote debugging?**.
Every new client connection prompted again.

The successful command sequence was:

1. Read `DevToolsActivePort`.
2. Connect to the browser WebSocket and wait for approval.
3. Call `Target.getTargets`.
4. Call `Target.attachToTarget` with `flatten: true`.
5. Send page-domain commands with the returned `sessionId`.

Consequence: reuse one socket and one flattened target session.

Source:

- <https://learn.microsoft.com/en-us/microsoft-edge/web-platform/devtools-mcp-server#auto-connect-to-a-running-edge-instance>

## Interaction behavior

On one tested page, accessibility-tree clicks and `set_value` did not toggle a radio input, while a
DOM `.click()` and Puppeteer input did. This did not prove that the control required trusted events;
it only showed that the accessibility path failed for that control.

Consequence: verify state after interaction and change input paths when the page ignores one path.

## Sleeping tabs

A backgrounded SPA in the user's normal Edge entered sleeping-tab mode and unloaded its DOM.

Consequence: prefer a dedicated controlled instance for sustained automation. If the real profile is
required, verify the page remains active before trusting its DOM state.

## Tooling and PowerShell

- `$PID` is a reserved PowerShell variable; use `$processId`.
- Playwright `chromium.launch()` starts its own browser. Playwright `connectOverCDP()` attaches to an
  existing Chromium-based browser, including Edge when given its endpoint.
- Chrome DevTools MCP can control a different browser. Compare its pages with Edge's CDP targets.
- `localhost` sometimes resolved to IPv6; `127.0.0.1` was reliable.
- `Start-Process -ArgumentList` does not preserve quoting for spaced values. Quote the value inside
  `--user-data-dir="..."`.

## Policy gates

`RemoteDebuggingAllowed` blocked both connection paths when disabled.
`DeveloperToolsAvailability` can disable DevTools and the F12 fallback.

Sources:

- <https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/remotedebuggingallowed>
- <https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/developertoolsavailability>

Consequence: report the policy gate; do not change or bypass it.

## Token capture

MSAL entries appeared gradually as the tested app warmed. A single scan could miss a token that was
minted after an authenticated view loaded or a silent renewal completed.

Consequence: poll for presence when token extraction is authorized. Never print token values; store
them only in a protected temporary location and report presence, expiry, and destination.

## Fallbacks

When CDP is unavailable:

1. Use F12 Network with **Preserve log**, then **Copy as cURL** or **Save all as HAR with content**.
2. Use accessibility or computer-use tooling for UI actions, paired with F12 when wire capture is
   required.
3. Use a dedicated data directory and one-time sign-in instead of copying the default profile.

Treat cURL and HAR output as secrets and keep them in temporary files.

## Not tested

- Multiple corporate profiles.
- macOS or Linux profile discovery and opt-in paths.
- Long-running connections across sleep, network changes, or Edge updates.
- Reboot-level persistence of the dedicated profile's authenticated session.
