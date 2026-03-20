#!/usr/bin/env bash
set -euo pipefail
# backup.sh — Back up untracked Copilot CLI config files and session data to OneDrive.
#
# Usage:
#   ./backup.sh                     # Full backup (config + session store)
#   ./backup.sh --skip-session      # Config files only

SKIP_SESSION=false
for arg in "$@"; do
  case "$arg" in
    --skip-session) SKIP_SESSION=true ;;
    -h|--help)
      echo "Usage: $0 [--skip-session]"
      echo "  --skip-session  Skip the session-store.db backup (it can be large)"
      exit 0
      ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# ─── Paths ──────────────────────────────────────────────────────────────────────
COPILOT_DIR="$HOME/.copilot"
# Detect OneDrive sync folder: env var → macOS CloudStorage → Linux/fallback
if [[ -n "${ONEDRIVE_BACKUP_DIR:-}" ]]; then
  ONEDRIVE_DIR="$ONEDRIVE_BACKUP_DIR"
elif [[ -n "${OneDriveCommercial:-}" ]]; then
  ONEDRIVE_DIR="$OneDriveCommercial"
elif [[ -d "$HOME/Library/CloudStorage/OneDrive-Microsoft" ]]; then
  ONEDRIVE_DIR="$HOME/Library/CloudStorage/OneDrive-Microsoft"
elif [[ -d "$HOME/OneDrive - Microsoft" ]]; then
  ONEDRIVE_DIR="$HOME/OneDrive - Microsoft"
else
  ONEDRIVE_DIR=""
fi
BACKUP_DIR="$ONEDRIVE_DIR/Documents/Copilot Config Backup"

# ─── Validate ───────────────────────────────────────────────────────────────────
if [[ ! -d "$COPILOT_DIR" ]]; then
  echo "ERROR: Copilot directory not found: $COPILOT_DIR" >&2
  exit 1
fi

if [[ ! -d "$ONEDRIVE_DIR" ]]; then
  echo "ERROR: OneDrive sync folder not found." >&2
  echo "  Tried: $HOME/Library/CloudStorage/OneDrive-Microsoft" >&2
  echo "  Tried: $HOME/OneDrive - Microsoft" >&2
  echo "  Is OneDrive for Business signed in and syncing?" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# ─── Config Files ───────────────────────────────────────────────────────────────
CONFIG_FILES=(
  "sensitive-terms.txt"
  "email-signature.html"
  "email-style.md"
  "permissions-config.json"
  "powerbi-mcp-proxy.mjs"
)

echo ""
echo "=== Backing up config files ==="
copied=0
for file in "${CONFIG_FILES[@]}"; do
  src="$COPILOT_DIR/$file"
  dst="$BACKUP_DIR/$file"
  if [[ -f "$src" ]]; then
    cp "$src" "$dst"
    size=$(du -h "$src" | cut -f1)
    echo "  [OK] $file ($size)"
    ((++copied))
  else
    echo "  [--] $file (not found, skipping)"
  fi
done
echo "  $copied/${#CONFIG_FILES[@]} files backed up"

# ─── Session Store ──────────────────────────────────────────────────────────────
if [[ "$SKIP_SESSION" == false ]]; then
  echo ""
  echo "=== Backing up session store ==="
  SESSION_DB="$COPILOT_DIR/session-store.db"
  if [[ -f "$SESSION_DB" ]]; then
    SESSION_BACKUP_DIR="$BACKUP_DIR/session-snapshots"
    mkdir -p "$SESSION_BACKUP_DIR"

    TIMESTAMP=$(date +%Y-%m-%d)
    DST_NAME="session-store-$TIMESTAMP.db"
    DST="$SESSION_BACKUP_DIR/$DST_NAME"
    DST_LATEST="$SESSION_BACKUP_DIR/session-store-latest.db"

    SIZE=$(du -h "$SESSION_DB" | cut -f1)
    echo "  Copying session-store.db ($SIZE)..."
    cp "$SESSION_DB" "$DST"
    cp "$SESSION_DB" "$DST_LATEST"
    echo "  [OK] $DST_NAME ($SIZE)"
    echo "  [OK] session-store-latest.db (quick restore copy)"

    # Prune old snapshots — keep last 10
    # shellcheck disable=SC2012
    ls -1r "$SESSION_BACKUP_DIR"/session-store-2*.db 2>/dev/null | tail -n +11 | while read -r old; do
      rm -f "$old"
      echo "  [--] Pruned old snapshot: $(basename "$old")"
    done
  else
    echo "  [--] session-store.db not found, skipping"
  fi
else
  echo ""
  echo "=== Skipping session store (--skip-session) ==="
fi

# ─── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "=== Backup complete ==="
echo "  Location: $BACKUP_DIR"
echo "  OneDrive will sync to the cloud automatically."
