#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Thin wrapper — delegates to the cross-platform Python setup.
.DESCRIPTION
    Locates Python 3.10+ and runs setup.py with any arguments passed through.
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments)]
    [string[]]$PassThrough
)

$ErrorActionPreference = 'Stop'
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Find-Python {
    foreach ($cmd in @('python3', 'python', 'py')) {
        $exe = Get-Command $cmd -ErrorAction SilentlyContinue
        if (-not $exe) { continue }

        $ver = & $exe.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $ver) { continue }

        $parts = $ver.Split('.')
        $major = [int]$parts[0]
        $minor = [int]$parts[1]
        if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 10)) {
            return $exe.Source
        }
    }
    return $null
}

$Python = Find-Python
if (-not $Python) {
    Write-Host '❌  Python 3.10+ is required but was not found.' -ForegroundColor Red
    Write-Host '    Install it from https://www.python.org/downloads/' -ForegroundColor Yellow
    exit 1
}

$setupArgs = @("$RepoDir\setup.py") + ($PassThrough ?? @())
& $Python @setupArgs
exit $LASTEXITCODE
