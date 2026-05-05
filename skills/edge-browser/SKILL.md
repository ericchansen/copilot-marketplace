---
name: edge-browser
description: |
  Launch Microsoft Edge with a specific user profile and remote debugging enabled, then connect
  to Edge via Chrome DevTools Protocol (CDP) for interactive control. Use when the user needs a
  particular Edge profile's cookies, SSO session, or managed-device auth (Conditional Access).
  Also supports token extraction from authenticated pages for server-side API calls.
license: MIT
allowed-tools: PowerShell, Chrome DevTools
---

# Edge Browser — Profile-Aware Browser Automation

Launch and control Microsoft Edge with a specific user profile via Chrome DevTools Protocol (CDP).

## Critical Rules

1. **Use Chrome DevTools MCP only** — never Playwright MCP. Playwright launches its own Chromium
   instance, creating a second browser that fights with Edge for port 9222.
2. **Chrome DevTools MCP has its own internal browser** — it does NOT automatically connect to
   Edge on port 9222. It maintains a separate browser connection. You must verify which browser
   you're talking to (see Step 1). When Chrome DevTools MCP is on the wrong browser, use raw
   CDP calls via PowerShell + Node.js instead.
3. **One browser, one port** — if port 9222 is already in use, check who owns it before launching
   anything. Never launch Edge if another process already has the port.
4. **`$pid` is reserved in PowerShell** — when iterating over process IDs, use `$processId` or `$p`,
   never `$pid` (it's a read-only automatic variable that returns the current process ID).

## Profile Discovery

Edge profiles live in `$env:LOCALAPPDATA\Microsoft\Edge\User Data\`. Each profile directory
(`Default`, `Profile 1`, etc.) has a `Preferences` JSON file.

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Edge\User Data" -Directory | ForEach-Object {
    $prefsFile = Join-Path $_.FullName "Preferences"
    if (Test-Path $prefsFile) {
        $prefs = Get-Content $prefsFile -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
        $email = try { $prefs.account_info[0].email } catch { $null }
        $name = try { $prefs.profile.name } catch { $null }
        if ($name) { [PSCustomObject]@{ Dir = $_.Name; Name = $name; Email = $email } }
    }
} | Format-Table -AutoSize
```

The `Dir` column is what you pass to `--profile-directory`. Match the user's target account by email.

## Workflow

### Step 1: Check if Edge is already running with debug port

```powershell
# First: is ANYTHING on port 9222?
$portCheck = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue
if ($portCheck) {
    # Something is listening — is it Edge?
    try {
        $version = Invoke-RestMethod -Uri "http://localhost:9222/json/version" -ErrorAction Stop
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

### Step 2: Launch Edge with debug port (only if CDP is not active)

Edge ignores `--remote-debugging-port` when it's already running — you can't add the flag
to a running instance or launch a second instance on a different port. So there are two cases:

**Case A — Edge is NOT running:** Just launch it. No kill needed.

**Case B — Edge IS running without debug port:** Must restart. Warn the user that their tabs
will be restored via `--restore-last-session`, then close and relaunch.

```powershell
# Only kill if Edge is running (Case B)
$edgePids = @(Get-Process msedge -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)

if ($edgePids.Count -gt 0) {
    Write-Host "Edge is running without debug port. Restarting ($($edgePids.Count) processes)..."
    foreach ($processId in $edgePids) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    # Wait for clean exit (up to 10 seconds)
    for ($i = 0; $i -lt 20; $i++) {
        if (@(Get-Process msedge -ErrorAction SilentlyContinue).Count -eq 0) { break }
        Start-Sleep -Milliseconds 500
    }
}

# Launch with debug port + profile + restore tabs
# NOTE: Do NOT embed quotes in --profile-directory value. Start-Process handles quoting.
$profileDir = "Default"   # <-- from profile discovery (works with "Profile 1" too)
Start-Process "msedge" -ArgumentList "--remote-debugging-port=9222", "--profile-directory=$profileDir", "--restore-last-session"

# Wait for CDP to become available
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $v = Invoke-RestMethod -Uri "http://localhost:9222/json/version" -ErrorAction Stop
        Write-Host "CDP ready in ${i}s — $($v.Browser)"
        break
    } catch {
        if ($i -eq 15) { Write-Host "FAILED: Edge CDP not available after 15s" }
    }
}
```

### Step 3: Interact with Edge

Use **Chrome DevTools MCP tools** (not Playwright):
- `chrome-devtools-list_pages` — see open tabs
- `chrome-devtools-navigate_page` — go to a URL
- `chrome-devtools-take_snapshot` — get page content (element refs for clicking)
- `chrome-devtools-take_screenshot` — visual capture
- `chrome-devtools-click` — click elements by uid from snapshot
- `chrome-devtools-evaluate_script` — run JavaScript in the page
- `chrome-devtools-list_network_requests` — inspect API traffic

### Step 4: Verify the correct profile is active

After connecting, verify the expected account is signed in:

```powershell
$pages = Invoke-RestMethod -Uri "http://localhost:9222/json"
$pages | Where-Object { $_.type -eq "page" } | ForEach-Object {
    Write-Host "$($_.title) — $($_.url.Substring(0, [Math]::Min($_.url.Length, 80)))"
}
```

## Token Extraction (for server-side API calls)

When the user is authenticated in Edge, tokens stored in the page's `localStorage` by MSAL can
be extracted via CDP for use in server-side API calls. This is useful for APIs that require
managed-device Conditional Access (where Azure CLI and device code flows are blocked).

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
- **`--remote-debugging-port` is silently ignored** if Edge is already running. You MUST close
  all Edge processes first, then relaunch with the flag
- **`$pid` is reserved in PowerShell** — use `$processId`, `$p`, or any other name when iterating
  over process IDs in `foreach` loops
- **SSO redirects may land in a different tab** — use `chrome-devtools-list_pages` after navigation
- **Azure Portal needs tenant parameter** for managed tenants: `?tenant=<TENANT_ID>`
- **Port 9222 conflicts** — check with `Get-NetTCPConnection -LocalPort 9222` before launching.
  If Playwright MCP already grabbed the port, stop it first
- **Prefer snapshots over screenshots** for interaction — snapshots give element refs (uid) that
  `chrome-devtools-click` and `chrome-devtools-fill` accept
- **Chrome DevTools MCP has its own internal browser** — it does NOT connect to Edge on port 9222
  automatically. It maintains a separate browser connection (often Playwright's Chromium from a
  previous session). **Always verify with the raw CDP endpoint:**

  ```powershell
  # This hits the REAL port 9222 (Edge):
  Invoke-RestMethod "http://localhost:9222/json/version" | Select-Object Browser
  # Should show: Edg/xxx.x.xxxx.xx

  # If chrome-devtools-list_pages shows different content than the raw CDP endpoint,
  # Chrome DevTools MCP is connected to a different browser (likely Playwright's Chromium).
  ```

  **Workaround:** When Chrome DevTools MCP is on the wrong browser, use raw CDP
  endpoints via PowerShell + Node.js with the `ws` package for Edge interactions.
  Connect a WebSocket to the page's `webSocketDebuggerUrl` (from `http://localhost:9222/json`)
  and send `Runtime.evaluate` commands to run JavaScript in the page context.
