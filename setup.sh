#!/usr/bin/env bash
# Thin wrapper — delegates to the cross-platform Python setup.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# Find a usable Python ≥ 3.10
find_python() {
    for cmd in python3 python; do
        if command -v "$cmd" &>/dev/null; then
            local ver
            ver=$("$cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null) || continue
            local major minor
            major=${ver%%.*}
            minor=${ver#*.}
            if [[ "$major" -gt 3 || ( "$major" -eq 3 && "$minor" -ge 10 ) ]]; then
                echo "$cmd"
                return 0
            fi
        fi
    done
    return 1
}

PYTHON=$(find_python) || {
    echo "❌  Python 3.10+ is required but was not found."
    echo "    Install it from https://www.python.org/downloads/ or via your package manager."
    exit 1
}

exec "$PYTHON" "$REPO_DIR/setup.py" "$@"
