#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Back up untracked Copilot CLI config files and session data to OneDrive.

.DESCRIPTION
    Copies personalization files (email style, signature, sensitive terms, etc.)
    and the session store database to the OneDrive sync folder. The OneDrive client
    handles cloud sync automatically.

    Session store backups are timestamped so you can keep rolling history.

.PARAMETER SkipSessionStore
    Skip the session-store.db backup (it can be large).

.EXAMPLE
    ./backup.ps1                  # Full backup (config + session store)
    ./backup.ps1 -SkipSessionStore # Config files only
#>

param(
    [switch]$SkipSessionStore
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Paths ──────────────────────────────────────────────────────────────────────
$copilotDir = Join-Path $env:USERPROFILE ".copilot"
# Detect OneDrive sync folder: env var override → OneDriveCommercial → default path
if ($env:ONEDRIVE_BACKUP_DIR) {
    $oneDriveDir = $env:ONEDRIVE_BACKUP_DIR
} elseif ($env:OneDriveCommercial) {
    $oneDriveDir = $env:OneDriveCommercial
} else {
    $oneDriveDir = Join-Path $env:USERPROFILE "OneDrive - Microsoft"
}
$backupDir = Join-Path $oneDriveDir "Documents" "Copilot Config Backup"

# ─── Validate ───────────────────────────────────────────────────────────────────
if (-not (Test-Path $copilotDir)) {
    Write-Error "Copilot directory not found: $copilotDir"
    exit 1
}

if (-not (Test-Path $oneDriveDir)) {
    Write-Error "OneDrive sync folder not found: $oneDriveDir`nIs OneDrive for Business signed in and syncing?"
    exit 1
}

# Create backup directory if needed
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Write-Host "[+] Created backup folder: $backupDir" -ForegroundColor Green
}

# ─── Config Files ───────────────────────────────────────────────────────────────
# These are personalization files NOT tracked by the git repo.
$configFiles = @(
    "sensitive-terms.txt",
    "email-signature.html",
    "email-style.md",
    "permissions-config.json",
    "powerbi-mcp-proxy.mjs"
)

Write-Host "`n=== Backing up config files ===" -ForegroundColor Cyan
$copied = 0
foreach ($file in $configFiles) {
    $src = Join-Path $copilotDir $file
    $dst = Join-Path $backupDir $file
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        $size = (Get-Item $src).Length
        Write-Host "  [OK] $file ($([math]::Round($size / 1KB, 1)) KB)" -ForegroundColor Green
        $copied++
    } else {
        Write-Host "  [--] $file (not found, skipping)" -ForegroundColor Yellow
    }
}
Write-Host "  $copied/$($configFiles.Count) files backed up" -ForegroundColor Cyan

# ─── Session Store ──────────────────────────────────────────────────────────────
if (-not $SkipSessionStore) {
    Write-Host "`n=== Backing up session store ===" -ForegroundColor Cyan
    $sessionDb = Join-Path $copilotDir "session-store.db"
    if (Test-Path $sessionDb) {
        $sessionBackupDir = Join-Path $backupDir "session-snapshots"
        if (-not (Test-Path $sessionBackupDir)) {
            New-Item -ItemType Directory -Path $sessionBackupDir -Force | Out-Null
        }

        $timestamp = Get-Date -Format "yyyy-MM-dd"
        $dstName = "session-store-$timestamp.db"
        $dst = Join-Path $sessionBackupDir $dstName

        # Also keep a "latest" copy for easy restore
        $dstLatest = Join-Path $sessionBackupDir "session-store-latest.db"

        $sizeMB = [math]::Round((Get-Item $sessionDb).Length / 1MB, 1)
        Write-Host "  Copying session-store.db ($sizeMB MB)..." -ForegroundColor Gray
        Copy-Item $sessionDb $dst -Force
        Copy-Item $sessionDb $dstLatest -Force
        Write-Host "  [OK] $dstName ($sizeMB MB)" -ForegroundColor Green
        Write-Host "  [OK] session-store-latest.db (quick restore copy)" -ForegroundColor Green

        # Prune old snapshots — keep last 10
        $snapshots = @(Get-ChildItem $sessionBackupDir -Filter "session-store-2*.db" | Sort-Object Name -Descending)
        if ($snapshots.Count -gt 10) {
            $toDelete = $snapshots | Select-Object -Skip 10
            foreach ($old in $toDelete) {
                Remove-Item $old.FullName -Force
                Write-Host "  [--] Pruned old snapshot: $($old.Name)" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "  [--] session-store.db not found, skipping" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n=== Skipping session store (--SkipSessionStore) ===" -ForegroundColor Yellow
}

# ─── Summary ────────────────────────────────────────────────────────────────────
Write-Host "`n=== Backup complete ===" -ForegroundColor Green
Write-Host "  Location: $backupDir" -ForegroundColor Gray
Write-Host "  OneDrive will sync to the cloud automatically." -ForegroundColor Gray
