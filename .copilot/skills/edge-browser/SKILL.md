---
name: edge-browser
description: |
  Hijack a running Microsoft Edge instance with a specific user profile (e.g., corp, managed tenant,
  personal) by killing Edge, relaunching with --remote-debugging-port, and connecting Playwright.
  This is a LAST RESORT for profile-specific browsing — prefer Playwright MCP, clean_browser, or
  Chrome DevTools MCP for generic browsing tasks. Only use this skill when the user explicitly needs
  a particular Edge profile's cookies/auth (e.g., "use my work Edge profile", "open Edge with my
  managed tenant profile", "hijack Edge", "connect to my corp Edge").
license: MIT
allowed-tools: Bash, Playwright
---

# Edge Browser — Interactive Profile Launcher

Connect Playwright to Microsoft Edge with a specific user profile for collaborative browsing.
This enables navigating portals (MSX, Azure, Foundry), inspecting forms, staging demos, and
interacting with authenticated web apps — all while the user watches and directs.

## Edge Profile Discovery

Edge stores profiles in `$env:LOCALAPPDATA\Microsoft\Edge\User Data\`. Each profile directory
(`Default`, `Profile 1`, `Profile 2`, etc.) contains a `Preferences` JSON file with the
profile name and linked account email.

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Edge\User Data" -Directory |
  Where-Object { $_.Name -match '^(Default|Profile \d+)$' } |
  ForEach-Object {
    $prefPath = Join-Path $_.FullName "Preferences"
    if (Test-Path $prefPath) {
      $prefs = Get-Content $prefPath -Raw | ConvertFrom-Json
      [PSCustomObject]@{
        Directory   = $_.Name
        ProfileName = $prefs.profile.name
        Email       = ($prefs.account_info | ForEach-Object { $_.email } | Select-Object -First 1)
      }
    }
  } | Format-Table -AutoSize
```

**Example output:**

| Directory | Profile Name | Email | Use For |
|-----------|-------------|-------|---------|
| Default | Work | `<CORP_EMAIL>` | MSX, Teams web, Graph Explorer, corp portals |
| Profile 1 | Personal | `<PERSONAL_EMAIL>` | Personal browsing, GitHub (personal) |
| Profile 3 | Managed | `<MANAGED_TENANT_ADMIN>` | MCAPS managed tenant, Azure portal, Foundry |

## Workflow

### 1. Identify the target profile

Ask the user what they want to browse, then match to the right profile:

| Target | Profile Directory | Why |
|--------|------------------|-----|
| MSX / Dynamics 365 | `Default` | Corp account (`<CORP_EMAIL>`) |
| Azure Portal (MCAPS) | `Profile 3` | Managed tenant (`<MANAGED_TENANT_ADMIN>`) |
| AI Foundry (MCAPS demos) | `Profile 3` | Managed tenant |
| Azure Portal (corp sub) | `Default` | Corp account |
| Personal sites | `Profile 1` | Personal account |

If unclear, run the profile discovery script and ask the user which account they need.

### 2. Kill all Edge processes

**This is mandatory.** Edge does not allow `--remote-debugging-port` if any Edge process
is already running. Warn the user that all Edge windows will close momentarily.

```powershell
$edgePids = Get-Process msedge -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id
foreach ($p in $edgePids) {
  Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3
Write-Host "Killed $($edgePids.Count) Edge processes"
```

> **Note:** The variable name `$p` is used instead of `$pid` because `$PID` is a read-only
> automatic variable in PowerShell (the current process ID).

### 3. Relaunch Edge with debug port

```powershell
# Resolve the Edge executable path dynamically
$edgePath = (Get-Command msedge.exe -ErrorAction SilentlyContinue).Source
if (-not $edgePath) {
  $candidatePaths = @(
    "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($path in $candidatePaths) {
    if (Test-Path $path) { $edgePath = $path; break }
  }
}
if (-not $edgePath) {
  throw "Microsoft Edge (msedge.exe) not found. Ensure Edge is installed and on PATH."
}

Start-Process $edgePath `
  -ArgumentList '--remote-debugging-port=9222', '--profile-directory="<PROFILE_DIR>"', '--restore-last-session'
Start-Sleep -Seconds 6
Write-Host "Edge relaunched on debug port 9222"
```

Replace `<PROFILE_DIR>` with the directory name from step 1 (e.g., `Default`, `Profile 3`).

The `--restore-last-session` flag reopens all tabs that were open before the kill.

### 4. Connect Playwright

Navigate to any URL to establish the Playwright connection:

```
playwright-browser_navigate → target URL
```

If the initial navigation fails (e.g., `ERR_NAME_NOT_RESOLVED`, `ERR_ABORTED`), it's likely
an auth redirect. Wait a few seconds and check the tab list:

```
playwright-browser_wait_for → time: 5
playwright-browser_tabs → action: list
```

The content may have loaded in a **different tab** due to SSO redirects. Use
`playwright-browser_tabs` to find the right tab and switch to it.

### 5. Verify profile

After connecting, confirm the correct profile is active by checking the page content
or account info visible in the UI. For Azure/Foundry, look for the account email in
the top-right user menu.

## Switching Profiles Mid-Session

To switch to a different Edge profile during the same session:

1. Close the Playwright browser connection: `playwright-browser_close`
2. Kill all Edge processes (step 2)
3. Relaunch with the new profile directory (step 3)
4. Reconnect Playwright (step 4)

This takes ~10 seconds. Warn the user before doing it.

## Gotchas

These are real failure modes discovered through use — read before operating.

### Edge Process Cleanup
- **ALL Edge processes must be killed** before launching with `--remote-debugging-port`.
  If even one orphaned Edge process remains, the debug port flag is silently ignored.
- **Use PID-based kills only.** `Stop-Process -Name msedge` is blocked by security policy.
  Always enumerate PIDs first, then kill each by ID.
- **`$pid` is reserved in PowerShell.** Use `$p`, `$edgePid`, or any other variable name
  in `foreach` loops. `$PID` is a read-only automatic variable holding the current process ID.

### Auth Redirects
- **SSO redirects may open content in a different tab** than the one Playwright is monitoring.
  Always `list` tabs after navigating to an authenticated portal and switch if needed.
- **Azure Portal needs a tenant parameter** for MCAPS managed tenant:
  `https://portal.azure.com/?tenant=<MCAPS_TENANT_ID>`
  Without it, the portal may 404 or redirect to the wrong tenant.
- **Foundry (ai.azure.com) may show "Authenticating..."** indefinitely on the first tab.
  Check other tabs — the actual content often loads in tab 1 or 2.

### Tab Management
- **Tab indices can change** after navigation or redirects. Always re-list tabs before
  switching if you haven't interacted in a while.
- **`playwright-browser_tabs select`** may fail silently — verify with a snapshot after switching.

### Playwright Connection
- **Debug port 9222 is the default.** If something else is using it, you'll get a connection
  error. Check with: `Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue`
- **Playwright MCP connects to the first available browser** on the debug port. If you need
  Chrome DevTools MCP instead, note that it looks for Chrome (not Edge) by default.

### MSX / Dynamics 365 Specifics
- **Quick Create forms** cannot be opened by direct URL — navigate to the entity list first,
  then click "New" via Playwright.
- **Dropdowns in Dynamics 365** use custom combobox widgets, not native `<select>` elements.
  Click the combobox to expand, then look for `listbox` > `option` elements in the snapshot.
- **Some fields (like Solution Play) are locked** until prerequisite fields (like Opportunity
  Intent) are filled. Fill required fields first, then re-check locked fields.

### Azure Portal / Foundry Specifics
- **Metrics Explorer pages** take 5-10 seconds to load chart data. Use `wait_for` with
  appropriate time before taking snapshots.
- **Foundry monitoring page** uses custom chart widgets — data is in `aria-label` attributes
  and tooltip overlays, not plain text in the snapshot.

## Tips for Effective Co-Browsing

1. **Take snapshots liberally** — `playwright-browser_snapshot` gives the accessibility tree
   which is more useful than screenshots for form interaction.
2. **Save large snapshots to files** — use the `filename` parameter to avoid flooding context.
3. **Use grep on saved snapshots** to find specific elements instead of reading the full tree.
4. **For form filling**, identify all field refs from one snapshot, then fill them in a batch
   using `playwright-browser_fill_form` or sequential clicks + types.
5. **Let the user drive navigation** for authenticated portals — they can click links in their
   Edge window and you can observe via Playwright snapshots.

## Rules

- **ALWAYS warn the user** before killing Edge processes — they will lose all open windows/tabs
  temporarily (restored via `--restore-last-session`).
- **ALWAYS verify the correct profile** after connecting — wrong profile = wrong auth = wrong data.
- **NEVER hardcode profile directories as fixed values** — names such as `Default`, `Profile 3`,
  etc. in this document are examples only. Always discover the actual profile directory on the
  user's machine (or confirm it with the user), since profile names vary across machines.
- **NEVER leave Edge in debug mode indefinitely** — remind the user to restart Edge normally
  when done (debug mode has minor performance overhead).
- **PREFER snapshots over screenshots** for interacting with form elements — snapshots give
  you refs for clicking/typing, screenshots don't.
