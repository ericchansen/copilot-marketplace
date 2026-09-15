---
name: edge-browser
description: |
  Control Microsoft Edge over Chrome DevTools Protocol (CDP), either on a dedicated debug profile
  (unattended; signed out until a one-time human sign-in) or on the user's real signed-in profile through Edge's in-browser
  remote-debugging opt-in (human-assisted, full SSO). Use when you need the signed-in work account's
  SSO session, managed-device auth (Conditional Access), or to extract a bearer token from an
  authenticated page for server-side API calls.
license: MIT
allowed-tools: PowerShell, Chrome DevTools
---

# Edge Browser — CDP Automation

This file is an **evidence log**, not a rulebook of what is or is not possible. Everything below is
an observation: something was tried on a specific Edge version and date, something happened, a
mechanism was inferred, and a downstream consequence followed. Findings are scoped to the tested
environment — they are not guarantees about yours. Use them to **skip redundant experiments and pick
a path**, and re-test any finding if your environment differs (different OS, Edge build, tenant, or
policy) or if the finding looks stale. Where a finding reads like an absolute, read it as "in the
tested environment, this is what happened" — draw your own conclusion.

**Environment for every finding below:** Microsoft Edge Stable **153.0.4234.32**, Windows, a single
machine, one corporate tenant plus one personal account, **2026-09-15**. Findings are stamped
`Edge 153.0.4234.32, Windows, 2026-09`.

## Rules (what is permitted — these stay imperative)

These are about what you are **allowed** to do, not what is technically possible, so they are
absolute regardless of the findings below:

- **Never type the user's credentials for them.** A one-time human sign-in, and Edge's *"Allow remote
  debugging?"* dialog, are **normal handoffs** — hand the single sign-in or `Allow` click to the user
  and continue. They are a step in the flow, not a blocker or a reason to abandon the task.
- **Never log, print, return, or exfiltrate token values.** Tokens are secrets. Do not paste them into
  PRs/issues, commit them, or write them to disk unencrypted. A capture implementation writes the
  result to its own protected file and logs only the destination path, token presence, and expiry.
- **Never change or bypass enterprise policy.** If a policy blocks a path, detect and report it; do not
  work around it.

## Two observed paths

Two routes to a CDP-controlled Edge were exercised. They behaved differently on authentication,
consent, and launch flags, and the flags that made one work suppressed the other. Characteristics
below are **observations from the tested environment**, not commandments.

| | **Path A — dedicated debug profile** | **Path B — in-browser opt-in on the real profile** |
|---|---|---|
| Session observed | Fresh profile, **signed out** (device PRT/WAM may still sign some apps in) | The user's **real signed-in** session, full SSO |
| Human involvement observed | None once launched | A one-time setting plus an `Allow` click per connection |
| `--remote-debugging-port` | Present in the runs that opened a listener | Absent in the runs that opened a listener (see finding 5) |
| `--user-data-dir` | A **non-default** dir in the runs that worked | Real data dir used only as an attachment-discovery hint |
| Readiness signal observed | `http://127.0.0.1:9222/json/version` returned HTTP 200 | Those endpoints returned 404; `DevToolsActivePort` was the signal |
| Fit observed | Unattended automation, public/PRT-reachable apps | Conditional-Access apps, real-token capture |

## Findings ledger

Each entry: **action taken -> what was observed -> inferred mechanism -> downstream consequence.**

### 1. Remote-debugging switch on the default `User Data` dir opened no listener

**Action:** launched Edge with `--remote-debugging-port=9222` against the **default** `User Data`
directory. **Observed** (`Edge 153.0.4234.32, Windows, 2026-09`): Edge started normally, the flag
appeared on the command line, but no CDP socket opened and no `DevToolsActivePort` file was written;
`--remote-debugging-pipe` behaved the same way. **Mechanism:** the Edge/Chrome 136+ anti-cookie-theft
mitigation (shipped May 2025) stops honoring **both** `--remote-debugging-port` and
`--remote-debugging-pipe` on the default data dir. The gate is the **data directory**, not the
profile, so `--profile-directory` (whether `Default` or a named work profile like `"Profile 3"`) did
**not** route around it. **Consequence:** the everyday browser was not attachable this way; reaching
a real SSO session over CDP needs either a separate data dir (finding 2/4) or the in-browser opt-in
(finding 5). Refs: <https://developer.chrome.com/blog/remote-debugging-port>, <https://crbug.com/1414669>

> **Legacy note (< 136):** older Edge/Chrome could restart the real signed-in profile *with* the
> debug port and attach directly (`msedge --remote-debugging-port=9222 --profile-directory=Default
> --restore-last-session`). That was **silently ignored on 136+** in this environment.

### 2. A separate non-default `--user-data-dir` + the port flag opened CDP (Path A)

**Action:** launched Edge with a non-default `--user-data-dir` plus `--remote-debugging-port=9222`
and `--remote-allow-origins=*`. **Observed:** a CDP listener on `127.0.0.1:9222` within ~2s;
`http://127.0.0.1:9222/json/version` returned HTTP 200; both puppeteer-core `connectOverCDP` and raw
CDP connected. `--remote-allow-origins=*` was needed on launch for the CDP websocket client to be
accepted. **Mechanism:** a non-default data dir is outside the 136+ mitigation's gate.
**Consequence:** fully scriptable and unattended, but the fresh dir was **signed out** (no SSO) —
useful for public/PRT-reachable apps, and the base for finding 4.

```powershell
# Path A: dedicated non-default user-data-dir + port. Nothing of the user's to kill.
$dir  = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\CdpDebugProfile'
$port = 9222
Start-Process msedge -ArgumentList @(
    "--remote-debugging-port=$port",
    "--user-data-dir=`"$dir`"",      # non-default + quoted (LOCALAPPDATA may contain spaces)
    '--remote-allow-origins=*',      # observed necessary for the CDP client; SECURITY: prefer the exact origin -- see note below
    '--no-first-run', '--no-default-browser-check',
    '<START_URL>'
)

# Probe the IPv4 LITERAL ('localhost' can resolve to ::1 and hang):
$portFile = Join-Path $dir 'DevToolsActivePort'
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $v = Invoke-RestMethod "http://127.0.0.1:$port/json/version" -TimeoutSec 4 -ErrorAction Stop
        if ($v.Browser -match 'Edg/') { Write-Host "CDP ready in ${i}s — $($v.Browser)"; break }
        Write-Host "WARNING: port $port is served by $($v.Browser), not Edge — stop it or pick another port"; break
    } catch {
        if ($i -ge 3 -and -not (Test-Path $portFile)) {
            Write-Host "No DevToolsActivePort after ${i}s — check a non-default --user-data-dir was used; if so, see finding 5 (opt-in) or finding 4 (one-time sign-in)."
            break
        }
        if ($i -eq 15) { Write-Host "CDP not available after 15s" }
    }
}
```

> **Security note on `--remote-allow-origins`.** `*` disables the CDP origin check for **every** local
> origin, so any local page, extension, or process that can reach the loopback port could attach -- and
> finding 4 has you sign in to this same profile, so such an attachment would reach a real account. `*`
> was what was observed to let the client connect here; prefer the **narrowest** value your client
> actually sends (its exact origin, e.g. `http://127.0.0.1:9222`), or omit the switch if your client
> connects without it. Treat a wildcard as a residual risk to call out, not a default.

`--profile-directory` was unrestricted *inside* the non-default dir, so several isolated debug
profiles can live under one dir and be selected with `--profile-directory="Debug-A"`.

### 3. Cloning the real profile's cookies did NOT carry the login (corrects the old fallback)

**Action:** to try to carry the SSO session into a non-default dir, robocopied the real profile
(excluding caches), then attempted to copy the locked cookie DB. **Observed:**
`...\Default Profile\Network\Cookies` (~110592 bytes) was held with an **exclusive lock** by running
Edge — robocopy returned exit 9 and a shared-read stream failed. Non-elevated VSS returned
`0x80070005` (access denied) because the user was not elevated. An **elevated**
`esentutl /y "<src Cookies>" /vss /d "<dst Cookies>"` (via `Start-Process -Verb RunAs`, UAC consent)
**did** copy the locked DB. But launching Edge on the cloned profile showed the site **signed out**.
**Mechanism:** App-Bound Encryption binds cookie decryption to the **original** profile/user-data-dir,
so copied cookies do not decrypt elsewhere. **Consequence:** cookie cloning does **not** carry the
login; the lock-copy plus elevation was wasted effort. **This corrects the earlier "cloned profile"
fallback** — do not clone cookies to carry SSO. Instead launch a fresh non-default `--user-data-dir`
and have the user sign in **once** (finding 4).

> **Quoting gotcha observed here:** passing spaced paths (`User Data`, `Default Profile`) through
> `Start-Process powershell -Verb RunAs -ArgumentList '-Command',$cmd` mangled the quotes — `esentutl`
> saw `Data\Default` as a bad argument. Writing the copy command to a `.ps1` and invoking it with
> `-File` passed the spaced paths correctly to the native tool.

### 4. A one-time human sign-in in the dedicated dir persisted (the actual working pattern)

**Action:** in the dedicated non-default `--user-data-dir` from finding 2, had the user sign in
**once**, by hand. **Observed:** the session persisted; later automated CDP runs against the same dir
reused the logged-in session without another sign-in. **Mechanism:** the session lives in that data
dir and is not subject to the default-dir mitigation. **Consequence:** a single human sign-in was
sufficient and durable (until cookies expire) to get a real-account session under full automation,
**without touching the user's everyday Edge**. This was simpler and more reliable than cloning
(finding 3), and is the pattern to reach for when Path A's signed-out session is not enough.

### 5. On the real profile, OMITTING the port flag opened the opt-in listener (Path B)

**Action:** an A/B/A test on the real default profile, nothing else varied — (A) launched **with**
`--remote-debugging-port=9222`, (B) **without** it, (C) **with** it again — plus the in-browser
opt-in at `edge://inspect`. **Observed:** (A) and (C) opened no listener and wrote no fresh
`DevToolsActivePort`; (B) opened a listener in ~2s and wrote a fresh `DevToolsActivePort` (line 1 =
port, line 2 = browser WS path). The **browser** picked the port. `http://127.0.0.1:9222/json/version`
and `/json` returned **HTTP 404** even though CDP worked. A modal *"Allow remote debugging?"* dialog
**blocked** the CDP connection until a human clicked Allow, and **every new CDP client connection
raised a fresh prompt** (three sequential connections spaced immediate / 3s / 30s were all blocked
pending consent). Connections that timed out while a dialog was open left **stale dialogs** behind.
**Mechanism:** on the default data dir, requesting the port suppresses the endpoint the opt-in would
open; readiness is signaled by `DevToolsActivePort`, not the JSON endpoints; consent is per client
connection by design. **Consequence:** on this path, omit the port flag, detect readiness via
`DevToolsActivePort`, then connect to the **browser** WS, `Target.getTargets`,
`Target.attachToTarget` with `flatten: true`, `Runtime.evaluate` — and **reuse one long-lived
connection** instead of reconnecting per operation. Use generous timeouts and tell the user a prompt
is waiting. Ref:
<https://learn.microsoft.com/en-us/microsoft-edge/web-platform/devtools-mcp-server#auto-connect-to-a-running-edge-instance>

```powershell
# Path B readiness + endpoint discovery. Line 1 = port, line 2 = browser WebSocket path.
$portFile = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\DevToolsActivePort'
# The file appeared ~2s after the opt-in, so POLL rather than reading once (a single check races startup).
$lines = $null
for ($i = 1; $i -le 15; $i++) {
    if (Test-Path $portFile) { $lines = Get-Content $portFile; if ($lines.Count -ge 2) { break } }
    Start-Sleep -Seconds 1
}
if (-not $lines -or $lines.Count -lt 2) { throw 'No DevToolsActivePort after 15s — opt-in not enabled, or Edge was launched with the debug switch.' }
$wsUrl = "ws://127.0.0.1:$($lines[0])$($lines[1])"   # IPv4 literal: 'localhost' can resolve to ::1 and hang
Write-Host "Browser WebSocket: $wsUrl"
```

This JavaScript runs in a **separate** Node process, so `wsUrl` (a PowerShell variable above) must be
passed in, and `new WebSocket()` returns immediately while the consent dialog is still pending -- await
the socket's `open` event with a timeout **before** sending any CDP command.

```javascript
// Pass wsUrl in from the discovery step above (e.g. node connect.mjs "<wsUrl>"), or read an env var:
const wsUrl = process.argv[2] ?? process.env.EDGE_WS_URL;
const ws = new WebSocket(wsUrl);

// The socket only opens once the user clicks Allow — await 'open' (generous timeout) before commands:
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('open timed out — is the Allow prompt still waiting?')), 120000);
  ws.addEventListener('open',  () => { clearTimeout(t); resolve(); }, { once: true });
  ws.addEventListener('error', (e) => { clearTimeout(t); reject(e); }, { once: true });
});

// Reuse THIS one open socket for everything:
// 1. Target.getTargets                                   -> find the page you want
// 2. Target.attachToTarget { targetId, flatten: true }   -> returns sessionId
// 3. Runtime.evaluate { expression, ... } with sessionId
```

> A browser-wide debugging endpoint exposes the **whole** session, not just your target site — it is
> not a work-profile security boundary. Stay on loopback, validate every discovered endpoint, limit
> yourself to the agreed target, and do not call `Browser.close` or kill the user's Edge.

### 6. Synthetic AX/`set_value` clicks did not toggle some inputs; Puppeteer/DOM clicks did

**Action:** on a page whose radio inputs ignored synthetic events, tried indexed/accessibility clicks
and `set_value` (computer-use), then Puppeteer `element.click()` / DOM `.click()`. **Observed:** the
accessibility clicks and `set_value` did **not** toggle the control; Puppeteer/DOM clicks toggled it
reliably and the `checked` state reflected the change. The accessibility "selected" state also lagged
~1 snapshot behind the click. **Mechanism:** unestablished. A DOM `.click()` is itself a synthetic
event (`isTrusted` is false), and Puppeteer mouse input is a different event path again, so this is
**not** evidence that the control required a *trusted* event -- only that the AX/`set_value` path did
not reach it while the Puppeteer/DOM path did. **Consequence:** for sites that ignore synthetic
AX events, drive via CDP/Puppeteer DOM rather than the accessibility tree, and do not trust a single
post-click AX snapshot.

### 7. A backgrounded SPA tab slept and unloaded its DOM in the user's everyday Edge

**Action:** left a single-page-app tab backgrounded in the user's normal Edge window. **Observed:**
within seconds the tab title changed to *"Sleeping"* and the DOM unloaded (blank page / stale AX
tree); reloads re-slept immediately when backgrounded. **Mechanism:** Edge memory-saver sleeping tabs
(`msEdgeSleepingTabs`). **Consequence:** automating a tab in the user's normal window was fragile;
disable the feature (`--disable-features=msEdgeSleepingTabs`) or, better, drive a dedicated launched
instance you control (finding 2/4).

### 8. Tooling collisions and PowerShell gotchas (observed facts)

- `$pid` is a reserved read-only automatic variable in PowerShell (it returns the current process
  ID). Iterating process IDs into `$pid` failed; use `$processId` or `$p`.
- Playwright launches its own Chromium and fought for port 9222.
- Chrome DevTools MCP has its own internal browser and did **not** auto-connect to Edge on 9222 —
  verify which browser you are attached to before trusting its output.
- `localhost` sometimes resolved to `::1` and hung; the IPv4 literal `127.0.0.1` was reliable.
- `Start-Process -ArgumentList` joins array elements with spaces and does **not** quote them, so a
  value containing a space (e.g. `$env:LOCALAPPDATA` under `C:\Users\First Last\`) split into extra
  args and Edge got the wrong `--user-data-dir`. Quote the value *inside* the flag
  (`--user-data-dir="…"`), not just as its own array element.

### 9. Policies gated both paths (observed policy effects — report, do not bypass)

- [`RemoteDebuggingAllowed`](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/remotedebuggingallowed)
  is **browser-wide**: disabling it blocked Path A too, so a dedicated profile was **not** a
  workaround for it.
- [`DeveloperToolsAvailability`](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/developertoolsavailability)
  can disallow DevTools, including the F12 fallback.

Detect and report these; do not try to bypass them, and never change enterprise policy.

### 10. Token capture: tokens are secrets, and the MSAL cache filled over time

**Action:** on a warm real profile, read MSAL entries from `localStorage` after loading the site root,
then again as the app warmed. **Observed:** the MSAL token was present after loading only the site
root, and the MSAL entry count grew from **8 to 22** as the app warmed. **Mechanism:** MSAL populates
its cache lazily as views load and silent renewals fire. **Consequence:** a capture implementation
should **poll**, not conclude from a single scan. On a **cold** or dedicated profile, some app tokens
are only minted once the authenticated view (a specific record/page) actually loads — open it, or
drive the action with CDP, before extracting. Refreshing the authenticated page triggers MSAL silent
token renewal.

> **Tokens are secrets** (repeated from Rules because it is load-bearing): never log, print, return,
> or commit them; write only to a protected file and log the destination path, presence, and expiry.
> Tokens expire in ~60-90 minutes — treat them as short-lived credentials, and clear shell history if
> any were displayed.

## Fallbacks when Path B is unavailable

When remote debugging is policy-disabled, the user declines the opt-in or consent prompt, or you may
not touch the running browser, these were the observed alternatives:

1. **F12 DevTools capture.** In the already-signed-in Edge: **F12 -> Network**, enable **Preserve
   log**, perform the action, then **Copy -> Copy as cURL** or **Save all as HAR with content**. Runs
   inside the real SSO session and yields the exact payload + headers. `DeveloperToolsAvailability`
   (finding 9) can disallow F12 — check that gate first. Treat cURL/HAR as secrets (live tokens);
   temp files only, never commit.
2. **Computer-use / accessibility engine.** Co-drive the real authenticated Edge in the background
   (no CDP) to navigate and click. It acts on the UI, not the wire, so pair it with (1) to capture the
   raw request body — and note finding 6 for sites that ignore synthetic AX events.
3. **Fresh non-default dir + one-time sign-in** (finding 4) — the replacement for the old
   cookie-clone fallback, which finding 3 showed does not carry the login.

## Interaction level and tooling

First compare `chrome-devtools-list_pages` with the target list you discovered (Path A:
`http://127.0.0.1:9222/json`; Path B: `Target.getTargets`). Chrome DevTools MCP can operate on Edge
only when both identify the same page; otherwise use raw CDP with the native `WebSocket` path.

- **Passive observation (default):** list pages, inspect snapshots, capture network traffic. Opening
  a record to capture traffic does not authorize navigation, clicks, or form fills.
- **Navigation or form automation:** only after the user explicitly authorizes that action. Use raw
  CDP when MCP is attached to another browser.

When Chrome DevTools MCP identity is verified, useful tools include `chrome-devtools-list_pages`,
`chrome-devtools-navigate_page`, `chrome-devtools-take_snapshot` (element refs for clicking),
`chrome-devtools-take_screenshot`, `chrome-devtools-click`, `chrome-devtools-evaluate_script`, and
`chrome-devtools-list_network_requests`. Prefer snapshots over screenshots for interaction — snapshots
give element refs (uid) that `chrome-devtools-click` and `chrome-devtools-fill` accept.

```powershell
# Verify which browser a tool is really on (Path A hits the REAL port 9222 = Edge):
Invoke-RestMethod "http://127.0.0.1:9222/json/version" | Select-Object Browser
# Should show: Edg/xxx.x.xxxx.xx  (on Path B this 404s by design — use Browser.getVersion over the browser WebSocket instead)
```

- **Azure Portal needs a tenant parameter** for managed tenants: `?tenant=<TENANT_ID>`.
- **SSO redirects may land in a different tab** — re-list pages after navigation.

## What was NOT tested

- **Multiple corporate profiles.** The account-selection heuristic worked only because exactly one
  profile matched — ask, do not assume, when more than one could match.
- **Policy-disabled behavior at browser startup** (only the running-browser policy effects in finding
  9 were observed).
- **Reboot / long-term persistence** of the dedicated-dir session (finding 4 held within a session).
- **macOS and Linux** — the opt-in UI and discovery paths differ.
- **Long-running connection stability** across sleep, network changes, and Edge updates.
- **The cookie-clone fallback is now OBSERVED to not carry the login** due to App-Bound Encryption
  (finding 3), so it is retired rather than merely untested.
