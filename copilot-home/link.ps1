#Requires -Version 5.1
<#
.SYNOPSIS
    Deploys the portable Copilot config from this copilot-home/ into ~/.copilot/.

.DESCRIPTION
    - mcp-config.json, lsp-config.json, and copilot-instructions.md are symlinked,
      so they stay in sync with git (Copilot never auto-edits them). If symlink
      creation fails (no Developer Mode / not elevated) the script falls back to
      copying; use -Copy to force copies.

    - settings.json is MERGED and written as a real file (never a symlink), so
      machine-injected entries are preserved locally and tool edits never flow
      back into the repo. Specifically, any extraKnownMarketplaces with a
      "directory" source in the existing ~/.copilot/settings.json (e.g. the
      Windows Terminal "wt-local" marketplace) — plus enabledPlugins that
      reference those marketplaces — are carried over on top of the committed
      curated settings. This keeps machine-specific bits (like wt-agent-hooks)
      working without committing them to source.

    Run this AFTER the marketplace repos' default branches contain the current
    per-folder plugin layout, so enabledPlugins auto-install resolves.

.PARAMETER Copy
    Force copy instead of symlink for the files that are normally linked.

.EXAMPLE
    pwsh ./copilot-home/link.ps1
#>
[CmdletBinding()]
param([switch]$Copy)

$ErrorActionPreference = 'Stop'

$sourceDir = $PSScriptRoot
$targetDir = Join-Path $HOME '.copilot'
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

function Remove-JsonComments {
    param([string]$Text)
    ($Text -replace '(?m)^\s*//.*$', '') -replace '(?<=\S)\s+//.*$', ''
}

function Backup-IfRealFile {
    param([string]$Path)
    if (Test-Path $Path) {
        $item = Get-Item $Path -Force
        $isLink = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
        if ($isLink) {
            Remove-Item $Path -Force
        }
        else {
            Move-Item -Force $Path "$Path.bak"
            $leaf = Split-Path $Path -Leaf
            Write-Host "Backed up $leaf -> $leaf.bak"
        }
    }
}

# ── Linked files (symlink; copy fallback) ───────────────────────────────
foreach ($name in @('mcp-config.json', 'lsp-config.json', 'copilot-instructions.md')) {
    $src = Join-Path $sourceDir $name
    $dst = Join-Path $targetDir $name
    if (-not (Test-Path $src)) { Write-Warning "Missing $src, skipping"; continue }
    Backup-IfRealFile $dst
    if ($Copy) {
        Copy-Item -Force $src $dst
        Write-Host "Copied  $name"
        continue
    }
    try {
        New-Item -ItemType SymbolicLink -Path $dst -Target $src -Force | Out-Null
        Write-Host "Linked  $name -> $src"
    }
    catch {
        Write-Warning "Symlink failed for $name ($($_.Exception.Message)). Copying instead."
        Write-Warning "Enable Developer Mode or run elevated for real symlinks, or re-run with -Copy."
        Copy-Item -Force $src $dst
        Write-Host "Copied  $name"
    }
}

# ── settings.json (merge; always a real file) ───────────────────────────
$srcSettings = Join-Path $sourceDir 'settings.json'
$dstSettings = Join-Path $targetDir 'settings.json'
$curated = Remove-JsonComments (Get-Content $srcSettings -Raw) | ConvertFrom-Json

if (Test-Path $dstSettings) {
    $existing = Remove-JsonComments (Get-Content $dstSettings -Raw) | ConvertFrom-Json

    $localMarkets = @()
    if ($existing.extraKnownMarketplaces) {
        foreach ($p in $existing.extraKnownMarketplaces.PSObject.Properties) {
            if ($p.Value.source.source -eq 'directory') {
                if (-not $curated.extraKnownMarketplaces) {
                    $curated | Add-Member -NotePropertyName extraKnownMarketplaces -NotePropertyValue ([pscustomobject]@{}) -Force
                }
                $curated.extraKnownMarketplaces | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value -Force
                $localMarkets += $p.Name
                Write-Host "Preserved machine marketplace: $($p.Name)"
            }
        }
    }
    if ($existing.enabledPlugins -and $localMarkets.Count -gt 0) {
        foreach ($p in $existing.enabledPlugins.PSObject.Properties) {
            $mk = ($p.Name -split '@')[-1]
            if ($localMarkets -contains $mk) {
                if (-not $curated.enabledPlugins) {
                    $curated | Add-Member -NotePropertyName enabledPlugins -NotePropertyValue ([pscustomobject]@{}) -Force
                }
                $curated.enabledPlugins | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value -Force
                Write-Host "Preserved machine plugin: $($p.Name)"
            }
        }
    }
    Backup-IfRealFile $dstSettings
}

$curated | ConvertTo-Json -Depth 20 | Set-Content -Path $dstSettings -Encoding UTF8
Write-Host "Wrote   settings.json (merged)"

Write-Host ""
Write-Host "Done. Reminder: set any required secrets as user env vars, e.g.:" -ForegroundColor Cyan
Write-Host '  [Environment]::SetEnvironmentVariable("CONTEXT7_API_KEY", "<your-key>", "User")'
