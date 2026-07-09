---
name: edge-browser
description: |
  Launch Microsoft Edge with remote debugging on a dedicated debug profile, then control it via
  Chrome DevTools Protocol (CDP). Use when you need the signed-in work account's SSO session,
  managed-device auth (Conditional Access), or to extract a bearer token from an authenticated
  page for server-side API calls.
license: MIT
allowed-tools: PowerShell, Chrome DevTools
---

# Edge Browser — Debug-Profile Browser Automation

Launch and control Microsoft Edge over Chrome DevTools Protocol (CDP) using a dedicated debug
profile. On Edge/Chrome 136+ that profile must use a non-default `--user-data-dir`, so it starts
signed-out; some work apps then sign in silently via the device PRT, but apps behind Conditional
Access may re-challenge (see Critical Rules).

## Critical Rules

> ⚠️ **Edge/Chrome 136+ silently ignore `--remote-debugging-port` on the default/managed profile**
> — an intentional anti–cookie-theft mitigation shipped May 2025. The flag appears on the command
> line and Edge launches normally, but the CDP socket never opens and no `DevToolsActivePort` file
> is written. `--profile-directory=Default` does **not** satisfy the requirement (it still points
> at the default `User Data` dir). The only way to re-enable CDP is a **distinct, non-default
> `--user-data-dir`** — a **fresh profile with no SSO / no authenticated session**. Restarting your
> real signed-in profile with the debug port is now a **blocked anti-pattern**; for corporate apps
> behind Entra Conditional Access use [Authenticated / SSO capture](#authenticated--sso-capture-edge-136).
> Refs: <https://developer.chrome.com/blog/remote-debugging-port>, <https://crbug.com/1414669>

1. **Use Chrome DevTools MCP only** — never Playwright MCP. Playwright launches its own Chromium
   instance, creating a second browser that fights with Edge for port 9222.
2. **Chrome DevTools MCP has its own internal browser** — it does NOT automatically connect to
   Edge on port 9222. It maintains a separate browser connection. You must verify which browser
   you're talking to (see Step 1). When Chrome DevTools MCP is on the wrong browser, use raw
   CDP calls via PowerShell + Node.js instead.
3. **Launch your own debug profile — never touch the user's Edge.** On Edge/Chrome 136+ the debug
   port only binds on a **dedicated, non-default `--user-data-dir`**, which is a **fresh profile
   that does not carry your signed-in session**. Launch it on its own port alongside the user's
   normal Edge (nothing to close). For apps behind SSO / Conditional Access this profile is not a
   substitute for the real session — use [Authenticated / SSO capture](#authenticated--sso-capture-edge-136) (see Step 2).
4. **`$pid` is reserved in PowerShell** — when iterating over process IDs, use `$processId` or `$p`,
   never `$pid` (it's a read-only automatic variable that returns the current process ID).

## Workflow

### Step 1: Check if Edge is already running with debug port

```powershell
# First: is ANYTHING on port 9222?
$portCheck = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue
if ($portCheck) {
    # Something is listening — is it Edge?
    try {
        $version = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/version" -ErrorAction Stop
        if ($version.Browser -match "Edg/") {
            Write-Host "Edge CDP already active: $($version.Browser) — skip to Step 3"
        } else {
            Write-Host "WARNING: Port 9222 is owned by $($version.Browser) (not Edge)"
            Write-Host "Stop that process before launching Edge, or use a different port."
        }
    } catch {
        $ownerPid = $portCheck[0].OwningProcess
        $ownerName = (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue).ProcessName
        Write-Host "WARNING: Port 9222 is in use by $ownerName (PID $ownerPid) but not serving CDP"
    }
} else {
    Write-Host "Port 9222 is free — proceed to Step 2"
}
```

If Edge CDP is already active (`Edg/` in Browser string), **skip to Step 3**.
If port 9222 is in use by something else, stop that process first or choose another port.

### Step 2: Launch Edge on a dedicated debug profile

> ⚠️ **Edge/Chrome 136+ ignore `--remote-debugging-port` on the default / managed profile.** A
> distinct, **non-default `--user-data-dir` is mandatory** to bind the CDP port, and that dir is a
> **fresh profile: it does NOT carry your existing signed-in session.** `--profile-directory=Default`
> does not help, and restarting the real profile with the debug port is a blocked anti-pattern.
> Refs: <https://developer.chrome.com/blog/remote-debugging-port>, <https://crbug.com/1414669>

Use this dedicated-profile launch only when a **fresh sign-in is acceptable**. The dedicated dir
runs as its own Chromium instance, so it never touches — and never needs you to close — the user's
normal Edge. The fresh profile starts signed-out; some work apps then sign in silently via the
device Primary Refresh Token (PRT) / WAM broker, but **apps behind Entra Conditional Access /
device-compliance often re-challenge or block a fresh profile** — for those, do not use CDP here,
use [Authenticated / SSO capture](#authenticated--sso-capture-edge-136).

```powershell
# Dedicated debug profile: its own user-data-dir + port. Nothing to kill.
$dir  = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\CdpDebugProfile'
$port = 9222
Start-Process msedge -ArgumentList @(
    "--remote-debugging-port=$port",
    "--user-data-dir=`"$dir`"",      # dedicated + quoted (LOCALAPPDATA may contain spaces) -> port binds on Edge 136+
    '--no-first-run', '--no-default-browser-check',
    '<START_URL>'                    # e.g. the authenticated app you need
)

# Prove the port bound — probe the IPv4 LITERAL ('localhost' can resolve to ::1 and hang):
$portFile = Join-Path $dir 'DevToolsActivePort'
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $v = Invoke-RestMethod "http://127.0.0.1:$port/json/version" -TimeoutSec 4 -ErrorAction Stop
        Write-Host "CDP ready in ${i}s — $($v.Browser)"
        break
    } catch {
        if ($i -ge 3 -and -not (Test-Path $portFile)) {
            Write-Host "No DevToolsActivePort after ${i}s — likely the Edge 136 default-dir mitigation. Confirm a non-default --user-data-dir was used; if so, fall back to Authenticated / SSO capture."
            break
        }
        if ($i -eq 15) { Write-Host "FAILED: CDP not available after 15s" }
    }
}
```

Reuse the same dir on later runs to keep any warm session. Some app tokens are only minted once the
authenticated view (a specific record/page) actually loads — open it, or drive the action with the
Step 3 CDP tools, before extracting.

**Edge/Chrome < 136 only (legacy):** before the 136 mitigation you could restart the user's real,
signed-in profile with the debug port and attach CDP directly
(`msedge --remote-debugging-port=9222 --profile-directory=Default --restore-last-session`). That
preserved full SSO, but is **silently ignored on 136+** — do not use it on current Edge.

### Step 3: Interact with Edge

Use **Chrome DevTools MCP tools** (not Playwright):
- `chrome-devtools-list_pages` — see open tabs
- `chrome-devtools-navigate_page` — go to a URL
- `chrome-devtools-take_snapshot` — get page content (element refs for clicking)
- `chrome-devtools-take_screenshot` — visual capture
- `chrome-devtools-click` — click elements by uid from snapshot
- `chrome-devtools-evaluate_script` — run JavaScript in the page
- `chrome-devtools-list_network_requests` — inspect API traffic

### Step 4: Verify the work account is signed in

After connecting, confirm the expected account is signed in (the dedicated profile signs in
silently via the device PRT):

```powershell
$pages = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json"
$pages | Where-Object { $_.type -eq "page" } | ForEach-Object {
    Write-Host "$($_.title) — $($_.url.Substring(0, [Math]::Min($_.url.Length, 80)))"
}
```

## Authenticated / SSO capture (Edge 136+)

When you need the **real signed-in session** (corporate apps behind Entra Conditional Access /
managed-device auth), scripted CDP on the default profile is impossible (see Critical Rules). Use
these, in order:

1. **F12 DevTools capture (recommended).** In the already-signed-in Edge press **F12 → Network**,
   enable **Preserve log**, perform the action, then right-click the request → **Copy → Copy as
   cURL**, or **Save all as HAR with content**. F12 is not policy-blocked, runs inside the real SSO
   session, and yields the exact payload + headers. Treat the cURL/HAR as secrets — temp files
   only, never commit (they contain live tokens).
2. **Computer-use / accessibility engine.** Co-drive the real authenticated Edge in the background
   (no CDP) to navigate and click through the flow. It acts on the UI, not the wire, so pair it
   with (1) to capture the raw request body.
3. **Cloned profile + debug port (only if scripted CDP is truly required).** With Edge **fully
   closed**, copy `…\User Data\Default` (and `Local State`) to a throwaway dir, then launch that
   copy with `--user-data-dir=<copy> --remote-debugging-port=9222`. CDP works on the copy, but
   **SSO may still break**: app-bound-encryption cookies and device-bound tokens often won't
   decrypt in a copied profile, and Conditional Access may re-challenge.

## Token Extraction (for server-side API calls)

Once you have a **CDP-connected page that is actually signed in**, tokens stored in the page's
`localStorage` by MSAL can be extracted for use in server-side API calls. On 136+ that means an app
the dedicated profile could sign into; for Conditional-Access apps capture via
[Authenticated / SSO capture](#authenticated--sso-capture-edge-136) instead. This is useful for
APIs that require managed-device Conditional Access (where Azure CLI and device code flows are
blocked).

> ⚠️ **Extracted tokens are secrets.** Never log them, paste them into PRs/issues, commit them
> to source control, or write them to disk unencrypted. Clear shell history if tokens were
> displayed. Tokens expire in ~60-90 minutes — treat them as short-lived credentials.

Use `chrome-devtools-evaluate_script` to extract tokens:

```javascript
(() => {
    const tokens = {};
    for (const k of Object.keys(localStorage)) {
        try {
            const v = JSON.parse(localStorage.getItem(k));
            if (v.secret && v.target) {
                const exp = parseInt(v.expires_on || v.expiresOn || v.extended_expires_on || "0");
                const now = Math.floor(Date.now() / 1000);
                const minLeft = exp > 0 ? Math.round((exp - now) / 60) : 999;
                tokens[v.target.substring(0, 50)] = {
                    token: v.secret,
                    minutesLeft: minLeft,
                    expired: minLeft < 0
                };
            }
        } catch (e) {}
    }
    return JSON.stringify(tokens);
})()
```

Refreshing the authenticated page triggers MSAL silent token renewal.

## Gotchas

- **Never use Playwright MCP with Edge** — it launches a separate Chromium, causing port 9222
  conflicts and a confusing two-browser situation where tools operate on different browsers
- **The debug port only binds on a dedicated, non-default `--user-data-dir`.** On Edge/Chrome 136+
  the port is silently ignored on the default `User Data` store, so always launch with your own
  `--user-data-dir` (Step 2) — then you never need to close the user's Edge. That dedicated dir is
  a fresh profile with **no existing SSO**; for Conditional-Access apps use Authenticated / SSO
  capture instead
- **`$pid` is reserved in PowerShell** — use `$processId`, `$p`, or any other name when iterating
  over process IDs in `foreach` loops
- **SSO redirects may land in a different tab** — use `chrome-devtools-list_pages` after navigation
- **Azure Portal needs tenant parameter** for managed tenants: `?tenant=<TENANT_ID>`
- **Port 9222 conflicts** — check with `Get-NetTCPConnection -LocalPort 9222` before launching.
  If Playwright MCP already grabbed the port, stop it first
- **Paths with spaces:** `Start-Process -ArgumentList` joins array elements with spaces and does
  **not** quote them, so a value containing a space (e.g. `$env:LOCALAPPDATA` under
  `C:\Users\First Last\`) splits into extra args and Edge gets the wrong `--user-data-dir`. Quote the
  value *inside* the flag (`--user-data-dir="…"`, escaped as in Step 2) — putting it in its own array
  element is not enough. Avoid building one big `cmd /c "start msedge ..."` string
- **Prefer snapshots over screenshots** for interaction — snapshots give element refs (uid) that
  `chrome-devtools-click` and `chrome-devtools-fill` accept
- **Chrome DevTools MCP has its own internal browser** — it does NOT connect to Edge on port 9222
  automatically. It maintains a separate browser connection (often Playwright's Chromium from a
  previous session). **Always verify with the raw CDP endpoint:**

  ```powershell
  # This hits the REAL port 9222 (Edge):
  Invoke-RestMethod "http://127.0.0.1:9222/json/version" | Select-Object Browser
  # Should show: Edg/xxx.x.xxxx.xx

  # If chrome-devtools-list_pages shows different content than the raw CDP endpoint,
  # Chrome DevTools MCP is connected to a different browser (likely Playwright's Chromium).
  ```

  **Workaround:** When Chrome DevTools MCP is on the wrong browser, use raw CDP
  endpoints via PowerShell + Node.js with the `ws` package for Edge interactions.
  Connect a WebSocket to the page's `webSocketDebuggerUrl` (from `http://127.0.0.1:9222/json`)
  and send `Runtime.evaluate` commands to run JavaScript in the page context.
