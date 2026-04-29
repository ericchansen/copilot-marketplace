---
name: edge-browser
description: |
  Launch Microsoft Edge with a specific user profile and remote debugging enabled, then connect
  Playwright for interactive control. This is a LAST RESORT for profile-specific browsing — prefer
  Playwright MCP or Chrome DevTools MCP for generic browsing tasks. Only use when the user needs
  a particular Edge profile's cookies/auth.
license: MIT
allowed-tools: Bash, PowerShell, Playwright
---

# Edge Browser — Interactive Profile Launcher

Connect Playwright to Microsoft Edge with a specific user profile for authenticated browsing.

## Profile Discovery

Edge stores profiles in `$env:LOCALAPPDATA\Microsoft\Edge\User Data\`. Each profile directory (`Default`, `Profile 1`, etc.) has a `Preferences` JSON file with profile name and linked email. Enumerate them to find the right profile directory for the user's target account.

## Workflow

1. **Identify the target profile** — ask what the user wants to browse, run discovery to match account.
2. **Launch Edge with debug port** — use `--remote-debugging-port=9222` and `--profile-directory="<DIR>"` with `--restore-last-session`. Edge may need existing processes closed first if the debug port flag is being silently ignored.
3. **Connect Playwright** — navigate to the target URL. SSO redirects may open content in a different tab — use `playwright-browser_tabs list` to find the right one.
4. **Verify profile** — confirm the correct account is active in the UI.

## Gotchas

- **SSO redirects may land in a different tab** — always list tabs after navigating to an authenticated portal
- **Azure Portal needs tenant parameter** for managed tenants: `?tenant=<TENANT_ID>`
- **Tab indices change** after navigation — re-list tabs before switching
- **Port 9222 conflicts**: check with `Get-NetTCPConnection -LocalPort 9222`
- **Prefer snapshots over screenshots** for form interaction — snapshots give element refs
