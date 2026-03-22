#!/usr/bin/env bash
# Setup script for Copilot CLI configuration, skills, and MCP servers.
#
# Backs up existing ~/.copilot/ config, symlinks config files, patches config.json
# with portable settings, symlinks local custom skills, builds local MCP servers,
# validates env vars, and generates ~/.copilot/mcp-config.json.
#
# Community skills (awesome-copilot, anthropic, msx-mcp) are installed via
# Copilot CLI plugins, not managed by this script. See README.md for plugin install
# commands.
#
# Idempotent — safe to re-run at any time.
#
# Usage:
#   ./setup.sh                                            # Interactive — prompts for options
#   ./setup.sh --work                                      # Include work tools
#   ./setup.sh --non-interactive                          # No prompts, base only (safe for cron)
#   ./setup.sh --non-interactive --work                   # No prompts, everything enabled

set -uo pipefail

# =============================================================================
# Preflight: Bash version + dependencies
# =============================================================================
if ((BASH_VERSINFO[0] < 4)); then
    echo "Error: Bash 4+ required (you have ${BASH_VERSION})."
    echo "macOS ships with Bash 3.2 — install a newer version:"
    echo "  brew install bash"
    exit 1
fi

if ! command -v jq &>/dev/null; then
    echo "Error: jq is required for JSON processing."
    echo "Install:"
    echo "  macOS:  brew install jq"
    echo "  Ubuntu: sudo apt install jq"
    echo "  Fedora: sudo dnf install jq"
    exit 1
fi

# Source nvm if installed but not loaded (common when running setup.sh directly,
# since nvm is sourced from .bashrc which only runs for interactive shells)
if ! command -v nvm &>/dev/null && [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
fi

# =============================================================================
# Configuration
# =============================================================================
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_COPILOT_DIR="$REPO_ROOT/.copilot"
REPO_SKILLS_DIR="$REPO_COPILOT_DIR/skills"
EXTERNAL_DIR="$REPO_ROOT/external"
MCP_SERVERS_JSON="$REPO_ROOT/mcp-servers.json"

COPILOT_HOME="$HOME/.copilot"
COPILOT_SKILLS_HOME="$COPILOT_HOME/skills"
CONFIG_JSON="$COPILOT_HOME/config.json"
PORTABLE_JSON="$REPO_COPILOT_DIR/config.portable.json"

# Git auth state
GH_AVAILABLE=false
SSH_AVAILABLE=false
PREFER_SSH=false

# Config files to symlink
CONFIG_FILE_LINKS=("copilot-instructions.md")

# Keys allowed to be patched from config.portable.json into config.json
PORTABLE_ALLOWED_KEYS=("banner" "model" "render_markdown" "theme" "experimental" "reasoning_effort")

# External skill repositories (JSON)
# All community and work skills (awesome-copilot, anthropic, msx-mcp) are now
# installed via Copilot CLI plugins — see README.md. No external repos are cloned.
EXTERNAL_REPOS_JSON='[]'

# Plugins to install via `copilot plugin install`
# Each entry: {"name":"...","source":"...","work":true/false}
PLUGINS_JSON='[
  {"name":"msx-mcp","source":"mcaps-microsoft/MSX-MCP","work":true}
]'

# =============================================================================
# Parse command-line flags
# =============================================================================
WORK=false
CLEAN_ORPHANS=false
NON_INTERACTIVE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --work)           WORK=true ;;
        --clean-orphans)  CLEAN_ORPHANS=true ;;
        --non-interactive) NON_INTERACTIVE=true ;;
        -h|--help)
            echo "Usage: $0 [--work] [--clean-orphans] [--non-interactive]"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

# =============================================================================
# Summary counters
# =============================================================================
SUMMARY_BACKED_UP=false
declare -a SUMMARY_CONFIG_LINKED=()
declare -a SUMMARY_CONFIG_SKIPPED=()
SUMMARY_CONFIG_PATCHED=false
SUMMARY_TRUSTED_FOLDER=false
SUMMARY_BEADS_REMOVED=false
declare -a SUMMARY_SKILLS_CREATED=()
declare -a SUMMARY_SKILLS_EXISTED=()
declare -a SUMMARY_SKILLS_SKIPPED=()
declare -a SUMMARY_SKILLS_FAILED=()
declare -a SUMMARY_EXTERNAL_CLONED=()
declare -a SUMMARY_EXTERNAL_PULLED=()
declare -a SUMMARY_EXTERNAL_FAILED=()
declare -a SUMMARY_CONFLICTS=()
declare -a SUMMARY_MCP_BUILT=()
declare -a SUMMARY_MCP_FAILED=()
declare -a SUMMARY_MCP_ENV_MISSING=()
SUMMARY_MCP_GENERATED=false
SUMMARY_LSP_GENERATED=false
SUMMARY_LSP_COUNT=0
SUMMARY_LSP_SKIPPED=()
SUMMARY_PLUGIN_JUNCTIONS_CLEANED=0
declare -a SUMMARY_PLUGINS_INSTALLED=()
declare -a SUMMARY_PLUGINS_SKIPPED=()
declare -a SUMMARY_PLUGINS_FAILED=()
declare -a SUMMARY_OPTIONAL_INSTALLED=()
declare -a SUMMARY_OPTIONAL_SKIPPED=()
declare -a SUMMARY_OPTIONAL_FAILED=()

# =============================================================================
# Helper Functions
# =============================================================================

# Colors & styles
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

write_success() { echo -e "  ${GREEN}✓${NC} $1"; }
write_info()    { echo -e "  ${CYAN}ℹ${NC} ${DIM}$1${NC}"; }
write_warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
write_err()     { echo -e "  ${RED}✗${NC} $1"; }
write_step()    { echo ""; echo -e "${BOLD}${CYAN}  $1${NC}"; }

# Box-drawing helpers
draw_header() {
    local text="$1"
    local extra_width="${2:-0}"
    local len=$(( ${#text} + extra_width ))
    local pad=$((len + 4))
    local line
    line=$(printf '─%.0s' $(seq 1 "$pad"))
    echo ""
    echo -e "  ${CYAN}╭${line}╮${NC}"
    echo -e "  ${CYAN}│${NC}  ${BOLD}$text${NC}  ${CYAN}│${NC}"
    echo -e "  ${CYAN}╰${line}╯${NC}"
}

draw_section() {
    local text="$1"
    local width=40
    local text_len=${#text}
    local left_pad=$(( (width - text_len - 2) / 2 ))
    local right_pad=$(( width - text_len - 2 - left_pad ))
    local left right
    left=$(printf '─%.0s' $(seq 1 "$left_pad"))
    right=$(printf '─%.0s' $(seq 1 "$right_pad"))
    echo ""
    echo -e "  ${CYAN}${left}${NC} ${BOLD}$text${NC} ${CYAN}${right}${NC}"
    echo ""
}

resolve_path() {
    # Portable realpath: works on macOS and Linux
    local target="$1"
    if command -v realpath &>/dev/null; then
        realpath "$target" 2>/dev/null || echo "$target"
    elif command -v python3 &>/dev/null; then
        python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$target"
    elif [[ -d "$target" ]]; then
        (cd "$target" && pwd)
    elif [[ -f "$target" ]]; then
        echo "$(cd "$(dirname "$target")" && pwd)/$(basename "$target")"
    else
        echo "$target"
    fi
}

ensure_dir() {
    [[ -d "$1" ]] || mkdir -p "$1"
}

# Validate that an LSP server binary exists and can actually execute.
# Starts the binary and checks it doesn't crash immediately. A working server
# will stay running (killed by timeout → exit 124), while a broken one (wrong
# platform, missing runtime) crashes with a non-zero/non-124 exit code.
# Usage: validate_lsp_binary <command> [args...]
validate_lsp_binary() {
    local cmd="$1"
    shift
    local args=("$@")

    # Must exist on PATH
    if ! command -v "$cmd" &>/dev/null; then
        return 1
    fi

    # Prefer GNU coreutils timeout; fall back to gtimeout (Homebrew on macOS)
    local timeout_bin=""
    if command -v timeout &>/dev/null; then
        timeout_bin="timeout"
    elif command -v gtimeout &>/dev/null; then
        timeout_bin="gtimeout"
    else
        # No timeout available; binary exists on PATH, assume functional
        return 0
    fi

    # Start the binary briefly — a functional server stays alive when stdin is
    # open (timeout kills it, exit 124). A broken binary crashes immediately.
    # We use process substitution to keep stdin open instead of /dev/null,
    # because LSP servers exit non-zero when stdin closes immediately.
    # sleep 3 slightly outlasts the 2s timeout; the orphaned sleep is harmless
    # and self-terminates quickly.
    local exit_code
    "$timeout_bin" 2 "$cmd" "${args[@]}" < <(sleep 3) >/dev/null 2>&1
    exit_code=$?

    if [[ $exit_code -eq 0 || $exit_code -eq 124 ]]; then
        return 0
    else
        return 1
    fi
}

is_symlink() {
    [[ -L "$1" ]]
}

get_link_target() {
    # Returns the target of a symlink
    if [[ -L "$1" ]]; then
        readlink "$1" 2>/dev/null || true
    fi
}

# Return value for symlink/clone functions
FUNC_RESULT=""

create_file_symlink() {
    # Create a file symlink. Sets FUNC_RESULT to: created | exists | skipped | copied | failed
    local link_path="$1" target_path="$2" display_name="$3"

    if [[ -e "$link_path" ]] || [[ -L "$link_path" ]]; then
        if is_symlink "$link_path"; then
            local existing
            existing=$(get_link_target "$link_path")
            local resolved_target resolved_existing
            resolved_target=$(resolve_path "$target_path")
            resolved_existing=$(resolve_path "$existing" 2>/dev/null || echo "")
            if [[ "$resolved_existing" == "$resolved_target" ]]; then
                FUNC_RESULT="exists"
                return
            fi
            # Wrong target — remove and re-create
            rm -f "$link_path"
        else
            # Real file exists
            write_warn "$display_name already exists as a real file at $link_path"
            if $NON_INTERACTIVE; then
                FUNC_RESULT="skipped"
                return
            fi
            read -rp "    Replace with symlink? [y/N] " answer
            if [[ "${answer,,}" != "y" ]]; then
                FUNC_RESULT="skipped"
                return
            fi
            rm -f "$link_path"
        fi
    fi

    if ln -s "$target_path" "$link_path" 2>/dev/null; then
        FUNC_RESULT="created"
    else
        # Fallback: copy the file
        if cp "$target_path" "$link_path" 2>/dev/null; then
            FUNC_RESULT="copied"
        else
            FUNC_RESULT="failed"
        fi
    fi
}

create_dir_symlink() {
    # Create a directory symlink. Sets FUNC_RESULT to: created | exists | skipped | failed
    local link_path="$1" target_path="$2" display_name="$3" ask_before="${4:-false}"

    if [[ -e "$link_path" ]] || [[ -L "$link_path" ]]; then
        if is_symlink "$link_path"; then
            local existing
            existing=$(get_link_target "$link_path")
            local resolved_target resolved_existing
            resolved_target=$(resolve_path "$target_path")
            resolved_existing=$(resolve_path "$existing" 2>/dev/null || echo "")
            if [[ "$resolved_existing" == "$resolved_target" ]]; then
                FUNC_RESULT="exists"
                return
            fi
            # Wrong target — remove and re-create
            rm -f "$link_path"
        else
            if [[ "$ask_before" == "true" ]]; then
                write_warn "$display_name already exists as a real directory at $link_path"
                read -rp "    Replace with symlink? [y/N] " answer
                if [[ "${answer,,}" != "y" ]]; then
                    FUNC_RESULT="skipped"
                    return
                fi
            fi
            rm -rf "$link_path"
        fi
    fi

    if ln -s "$target_path" "$link_path" 2>/dev/null; then
        FUNC_RESULT="created"
    else
        FUNC_RESULT="failed"
    fi
}

clone_or_pull_repo() {
    # Clone or pull a git repo. Sets FUNC_RESULT to:
    #   cloned | pulled | pull-failed | clone-failed | skipped | aborted | identity-check-failed
    # Also sets RESOLVED_CLONE_PATH if the path changes (manual clone).
    local repo_url="$1" target_path="$2" display_name="$3" category="${4:-base}"
    RESOLVED_CLONE_PATH="$target_path"

    # Resolve preferred URL (SSH when available)
    local clone_url="$repo_url"
    if $PREFER_SSH && [[ "$repo_url" =~ ^https://github\.com/(.+)$ ]]; then
        clone_url="git@github.com:${BASH_REMATCH[1]}"
    fi
    local auth_method="HTTPS"
    [[ "$clone_url" =~ ^git@ ]] && auth_method="SSH"

    if [[ -d "$target_path/.git" ]]; then
        pushd "$target_path" > /dev/null

        # Validate repo identity
        local current_remote
        current_remote=$(git remote get-url origin 2>/dev/null || true)
        if [[ -n "$current_remote" ]]; then
            local expected_slug="" actual_slug=""
            if [[ "$repo_url" =~ github\.com[:/](.+?)(.git)?$ ]]; then
                expected_slug="${BASH_REMATCH[1]%.git}"
            fi
            if [[ "$current_remote" =~ github\.com[:/](.+?)(.git)?$ ]]; then
                actual_slug="${BASH_REMATCH[1]%.git}"
            fi
            if [[ -n "$expected_slug" && -n "$actual_slug" && "$expected_slug" != "$actual_slug" ]]; then
                write_err "$display_name — path contains a different repo ($actual_slug, expected $expected_slug)"
                popd > /dev/null
                FUNC_RESULT="identity-check-failed"
                return
            fi
        fi

        # Upgrade remote to SSH if preferred
        if [[ -n "$current_remote" && "$current_remote" != "$clone_url" ]] && $PREFER_SSH; then
            git remote set-url origin "$clone_url" 2>/dev/null || true
            write_info "$display_name — remote updated to $auth_method"
        fi

        # Pull the current branch (don't force checkout — respect user's branch choice)
        local current_branch
        current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
        if [[ -n "$current_branch" ]]; then
            write_info "$display_name — on branch $current_branch"
        fi

        if git pull --quiet 2>/dev/null; then
            popd > /dev/null
            FUNC_RESULT="pulled"
        else
            write_warn "$display_name — failed to pull (may be offline)"
            popd > /dev/null

            # Interactive recovery for pull failures
            if [[ "$NON_INTERACTIVE" != "true" ]]; then
                echo ""
                echo "    [C] Continue       — use existing local copy (default)"
                echo "    [R] Retry          — try pulling again"
                echo "    [S] Skip           — skip this repo entirely"
                echo "    [A] Abort          — stop processing remaining repos"
                echo ""
                while true; do
                    read -rp "    Choice [C/r/s/a]: " choice
                    choice=$(echo "${choice:-c}" | tr '[:upper:]' '[:lower:]')
                    case "$choice" in
                        a) FUNC_RESULT="aborted"; return ;;
                        s) FUNC_RESULT="skipped"; return ;;
                        r)
                            pushd "$target_path" > /dev/null
                            if git pull --quiet 2>/dev/null; then
                                popd > /dev/null
                                FUNC_RESULT="pulled"
                                return
                            fi
                            popd > /dev/null
                            write_warn "$display_name — pull failed again"
                            continue
                            ;;
                        *)
                            FUNC_RESULT="pull-failed"
                            return
                            ;;
                    esac
                done
            fi

            FUNC_RESULT="pull-failed"
        fi
        return
    fi

    # Clone
    local parent_dir
    parent_dir=$(dirname "$target_path")
    ensure_dir "$parent_dir"

    while true; do
        # Clean up partial clone from prior attempt
        if [[ -e "$target_path" ]]; then
            if [[ -d "$target_path/.git" ]]; then
                FUNC_RESULT="cloned"
                return
            fi
            rm -rf "$target_path" 2>/dev/null || true
        fi

        write_info "$display_name — cloning via $auth_method ($category)"
        local attempted_methods=()

        # Try preferred URL first
        if git clone --quiet "$clone_url" "$target_path" 2>/dev/null; then
            FUNC_RESULT="cloned"
            return
        fi
        attempted_methods+=("git clone ($auth_method)")
        [[ -e "$target_path" ]] && rm -rf "$target_path" 2>/dev/null

        # Try gh CLI with auth token
        if $GH_AVAILABLE; then
            local repo_slug=""
            if [[ "$repo_url" =~ github\.com/([^/]+/[^/]+?)(.git)?$ ]]; then
                repo_slug="${BASH_REMATCH[1]}"
            fi
            if [[ -n "$repo_slug" ]]; then
                write_warn "$display_name — $auth_method clone failed, trying gh CLI..."
                local gh_token
                gh_token=$(gh auth token 2>/dev/null || true)
                if [[ -n "$gh_token" ]]; then
                    local saved_gh_token="${GH_TOKEN:-}"
                    local saved_gh_prompt="${GH_PROMPT_DISABLED:-}"
                    local saved_gcm="${GCM_INTERACTIVE:-}"
                    export GH_TOKEN="$gh_token"
                    export GH_PROMPT_DISABLED="1"
                    export GCM_INTERACTIVE="never"
                    if echo "" | gh repo clone "$repo_slug" "$target_path" 2>/dev/null; then
                        # Restore env
                        [[ -z "$saved_gh_token" ]] && unset GH_TOKEN || export GH_TOKEN="$saved_gh_token"
                        [[ -z "$saved_gh_prompt" ]] && unset GH_PROMPT_DISABLED || export GH_PROMPT_DISABLED="$saved_gh_prompt"
                        [[ -z "$saved_gcm" ]] && unset GCM_INTERACTIVE || export GCM_INTERACTIVE="$saved_gcm"
                        FUNC_RESULT="cloned"
                        return
                    fi
                    # Restore env
                    [[ -z "$saved_gh_token" ]] && unset GH_TOKEN || export GH_TOKEN="$saved_gh_token"
                    [[ -z "$saved_gh_prompt" ]] && unset GH_PROMPT_DISABLED || export GH_PROMPT_DISABLED="$saved_gh_prompt"
                    [[ -z "$saved_gcm" ]] && unset GCM_INTERACTIVE || export GCM_INTERACTIVE="$saved_gcm"
                else
                    write_warn "$display_name — gh CLI not authenticated, skipping gh clone"
                fi
                attempted_methods+=("gh repo clone")
                [[ -e "$target_path" ]] && rm -rf "$target_path" 2>/dev/null
            fi
        fi

        # Final fallback: HTTPS with token auth, no prompts
        if [[ "$clone_url" != "$repo_url" ]]; then
            write_warn "$display_name — falling back to HTTPS (token-only, no browser)..."
            local saved_git_prompt="${GIT_TERMINAL_PROMPT:-}"
            local saved_gcm2="${GCM_INTERACTIVE:-}"
            export GIT_TERMINAL_PROMPT="0"
            export GCM_INTERACTIVE="never"
            local https_url="$repo_url"
            if $GH_AVAILABLE; then
                local token
                token=$(gh auth token 2>/dev/null || true)
                if [[ -n "$token" && "$repo_url" =~ ^https:// ]]; then
                    https_url="${repo_url/https:\/\//https://x-access-token:${token}@}"
                fi
            fi
            if git clone --quiet "$https_url" "$target_path" 2>/dev/null; then
                [[ -z "$saved_git_prompt" ]] && unset GIT_TERMINAL_PROMPT || export GIT_TERMINAL_PROMPT="$saved_git_prompt"
                [[ -z "$saved_gcm2" ]] && unset GCM_INTERACTIVE || export GCM_INTERACTIVE="$saved_gcm2"
                FUNC_RESULT="cloned"
                return
            fi
            [[ -z "$saved_git_prompt" ]] && unset GIT_TERMINAL_PROMPT || export GIT_TERMINAL_PROMPT="$saved_git_prompt"
            [[ -z "$saved_gcm2" ]] && unset GCM_INTERACTIVE || export GCM_INTERACTIVE="$saved_gcm2"
            attempted_methods+=("git clone (HTTPS token-only)")
            [[ -e "$target_path" ]] && rm -rf "$target_path" 2>/dev/null
        fi

        # Interactive recovery
        if ! $NON_INTERACTIVE; then
            echo ""
            write_warn "Failed to clone $display_name after: $(IFS=', '; echo "${attempted_methods[*]}")"
            echo ""
            echo -e "    ${WHITE}[R] Retry          — try again (fix auth in another terminal first)${NC}"
            echo -e "    ${WHITE}[L] Login & retry  — run 'gh auth login' then retry${NC}"
            echo -e "    ${WHITE}[M] Manual clone   — you clone it yourself, tell me the path${NC}"
            echo -e "    ${WHITE}[S] Skip           — skip this repo, continue with others${NC}"
            echo -e "    ${WHITE}[A] Abort          — stop cloning remaining repos${NC}"
            echo ""
            read -rp "    Choice [R/l/m/s/a] " choice
            case "${choice,,}" in
                a) FUNC_RESULT="aborted"; return ;;
                s) FUNC_RESULT="skipped"; return ;;
                l)
                    write_info "Launching 'gh auth login'..."
                    gh auth login || true
                    continue ;;
                m)
                    echo ""
                    echo -e "    ${YELLOW}Clone it yourself using:${NC}"
                    echo -e "    ${CYAN}  git clone $clone_url <path>${NC}"
                    echo ""
                    read -rp "    Enter the path where you cloned it [$target_path] " manual_path
                    [[ -z "$manual_path" ]] && manual_path="$target_path"
                    manual_path="${manual_path/#\~/$HOME}"
                    manual_path=$(resolve_path "$manual_path")
                    if [[ -d "$manual_path/.git" ]]; then
                        write_success "$display_name — found at $manual_path"
                        RESOLVED_CLONE_PATH="$manual_path"
                        FUNC_RESULT="cloned"
                        return
                    else
                        write_err "No git repo found at $manual_path"
                        continue
                    fi ;;
                *) continue ;;
            esac
        fi

        # Non-interactive: just fail
        echo ""
        write_err "Failed to clone $display_name"
        echo -e "    ${YELLOW}You can manually clone:${NC}"
        echo -e "    ${CYAN}  git clone $clone_url $target_path${NC}"
        echo ""
        FUNC_RESULT="clone-failed"
        return
    done
}

get_skill_folders() {
    # Print skill folder names from a directory (folders containing SKILL.md), one per line.
    # Output format: name<TAB>path
    local base_path="$1"
    if [[ -d "$base_path" ]]; then
        for dir in "$base_path"/*/; do
            [[ -d "$dir" ]] || continue
            dir="${dir%/}"
            if [[ -f "$dir/SKILL.md" ]]; then
                echo "$(basename "$dir")"$'\t'"$dir"
            fi
        done
    fi
}

jq_inplace() {
    # jq in-place edit: jq_inplace 'filter' file [args...]
    local filter="$1" file="$2"
    shift 2
    local tmp
    tmp=$(mktemp)
    if jq "$@" "$filter" "$file" > "$tmp"; then
        mv "$tmp" "$file"
    else
        rm -f "$tmp"
        return 1
    fi
}

# =============================================================================
# Main Script
# =============================================================================

draw_header "📦  Copilot Config & Skills Setup" 1

# =============================================================================
# Interactive option prompts
# =============================================================================

INCLUDE_WORK=false
if $WORK; then
    INCLUDE_WORK=true
elif ! $NON_INTERACTIVE; then
    echo ""
    read -rp "  Include work tools? (MSX-MCP plugin + Power BI MCP) [y/N] " answer
    [[ "${answer,,}" == "y" ]] && INCLUDE_WORK=true
fi

INCLUDE_CLEAN_ORPHANS=false
if $CLEAN_ORPHANS; then
    INCLUDE_CLEAN_ORPHANS=true
elif ! $NON_INTERACTIVE; then
    read -rp "  Remove skills not managed by this repo? [y/N] " answer
    [[ "${answer,,}" == "y" ]] && INCLUDE_CLEAN_ORPHANS=true
fi

# No external repos to merge — all skills are installed via plugins
REPOS_JSON="$EXTERNAL_REPOS_JSON"

# ─────────────────────────────────────────────────────────────────────────────
# Preflight: Git authentication
# ─────────────────────────────────────────────────────────────────────────────
write_step "Preflight · Git Authentication"

# Check for GitHub CLI
if command -v gh &>/dev/null; then
    GH_AVAILABLE=true
    local_gh_status=$(gh auth status 2>&1 || true)
    accounts=$(echo "$local_gh_status" | grep -oP 'account \K\S+' || true)
    if [[ -n "$accounts" ]]; then
        account_list=$(echo "$accounts" | tr '\n' ', ' | sed 's/,$//')
        write_success "GitHub CLI — logged in ($account_list)"
    else
        write_warn "GitHub CLI found but not authenticated — run: gh auth login"
    fi
else
    write_warn "GitHub CLI (gh) not installed — credential prompts may appear"
    write_info "Install: https://cli.github.com"
fi

# Check SSH connectivity to github.com
ssh_result=$(ssh -o BatchMode=yes -o ConnectTimeout=5 -T git@github.com 2>&1 || true)
if [[ "$ssh_result" =~ Hi\ (.+)! ]]; then
    SSH_AVAILABLE=true
    PREFER_SSH=true
    ssh_user="${BASH_REMATCH[1]}"
    write_success "SSH to github.com — OK (as $ssh_user, will prefer SSH URLs)"
else
    write_info "SSH to github.com not available — using HTTPS"
    if ! $GH_AVAILABLE; then
        write_warn "No SSH and no gh CLI — git may prompt for credentials"
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Backup
# ─────────────────────────────────────────────────────────────────────────────
write_step "Backup"

BACKUP_TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

if [[ -d "$COPILOT_HOME" ]]; then
    BACKUP_DIR="$HOME/.copilot-backup-$BACKUP_TIMESTAMP"
    ensure_dir "$BACKUP_DIR"

    # Back up config files (not sessions/logs/caches)
    for f in config.json copilot-instructions.md lsp-config.json mcp-config.json; do
        src="$COPILOT_HOME/$f"
        if [[ -e "$src" ]]; then
            cp "$src" "$BACKUP_DIR/$f" 2>/dev/null || true
        fi
    done

    # Back up skills directory
    if [[ -d "$COPILOT_SKILLS_HOME" ]]; then
        skills_backup="$BACKUP_DIR/skills"
        ensure_dir "$skills_backup"
        for dir in "$COPILOT_SKILLS_HOME"/*/; do
            [[ -d "$dir" ]] || continue
            dir="${dir%/}"
            name=$(basename "$dir")
            if [[ -L "$dir" ]]; then
                target=$(get_link_target "$dir")
                echo "$name -> $target" >> "$skills_backup/_junctions.txt"
            else
                cp -r "$dir" "$skills_backup/$name" 2>/dev/null || true
            fi
        done
    fi

    write_success "Backed up to $BACKUP_DIR"
    SUMMARY_BACKED_UP=true

    # Auto-cleanup: keep only 5 most recent backups
    old_backups=()
    while IFS= read -r d; do
        old_backups+=("$d")
    done < <(find "$HOME" -maxdepth 1 -type d -name '.copilot-backup-*' -print 2>/dev/null | sort -r | tail -n +6)
    if [[ ${#old_backups[@]} -gt 0 ]]; then
        for ob in "${old_backups[@]}"; do
            rm -rf "$ob"
        done
        write_info "Cleaned up ${#old_backups[@]} old backup(s)"
    fi
else
    write_info "No existing ~/.copilot/ to back up"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Setup: Directories
# ─────────────────────────────────────────────────────────────────────────────
write_step "Setup · Directories"

ensure_dir "$COPILOT_HOME"
ensure_dir "$COPILOT_SKILLS_HOME"
write_success "~/.copilot/ and ~/.copilot/skills/ exist"

# ─────────────────────────────────────────────────────────────────────────────
# Setup: Config Symlinks
# ─────────────────────────────────────────────────────────────────────────────
write_step "Setup · Config Symlinks"

for cfg_name in "${CONFIG_FILE_LINKS[@]}"; do
    target_path="$REPO_COPILOT_DIR/$cfg_name"
    link_path="$COPILOT_HOME/$cfg_name"

    if [[ ! -f "$target_path" ]]; then
        write_warn "$cfg_name — source not found in repo, skipping"
        continue
    fi

    create_file_symlink "$link_path" "$target_path" "$cfg_name"

    case "$FUNC_RESULT" in
        created)
            write_success "$cfg_name → linked"
            SUMMARY_CONFIG_LINKED+=("$cfg_name") ;;
        copied)
            write_warn "$cfg_name → copied (symlinks may need elevated permissions)"
            SUMMARY_CONFIG_LINKED+=("$cfg_name") ;;
        exists)
            write_info "$cfg_name — already linked correctly" ;;
        skipped)
            write_warn "$cfg_name — skipped (user declined)"
            SUMMARY_CONFIG_SKIPPED+=("$cfg_name") ;;
        failed)
            write_err "$cfg_name — failed to create symlink" ;;
    esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Setup: Patch config.json
# ─────────────────────────────────────────────────────────────────────────────
write_step "Setup · Patch config.json"

# Create config.json if it doesn't exist
if [[ ! -f "$CONFIG_JSON" ]]; then
    echo '{}' > "$CONFIG_JSON"
fi

if [[ -f "$PORTABLE_JSON" ]]; then
    for key in "${PORTABLE_ALLOWED_KEYS[@]}"; do
        val=$(jq ".$key // null" "$PORTABLE_JSON")
        if [[ "$val" != "null" ]]; then
            jq_inplace ".$key = \$v" "$CONFIG_JSON" --argjson v "$val"
        fi
    done
    write_success "Patched config.json with portable settings"
    SUMMARY_CONFIG_PATCHED=true
else
    write_warn "config.portable.json not found in repo — skipping patch"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Setup: Trusted Folders
# ─────────────────────────────────────────────────────────────────────────────
write_step "Setup · Trusted Folders"

RESOLVED_REPO_ROOT=$(resolve_path "$REPO_ROOT")

if jq -e ".trusted_folders // [] | map(select(. == \"$RESOLVED_REPO_ROOT\")) | length > 0" "$CONFIG_JSON" &>/dev/null; then
    write_info "Repo already in trusted_folders"
else
    jq_inplace '.trusted_folders = ((.trusted_folders // []) + [$path])' "$CONFIG_JSON" --arg path "$RESOLVED_REPO_ROOT"
    write_success "Added $RESOLVED_REPO_ROOT to trusted_folders"
    SUMMARY_TRUSTED_FOLDER=true
fi

# ─────────────────────────────────────────────────────────────────────────────
# Setup: Marketplace
# ─────────────────────────────────────────────────────────────────────────────
write_step "Setup · Marketplace"

if jq -e '.marketplaces' "$CONFIG_JSON" &>/dev/null; then
    # Handle object with named keys
    if jq -e '.marketplaces."beads-marketplace"' "$CONFIG_JSON" &>/dev/null; then
        jq_inplace 'del(.marketplaces."beads-marketplace")' "$CONFIG_JSON"
        write_success "Removed beads-marketplace entry"
        SUMMARY_BEADS_REMOVED=true
    # Handle array with name/key/id field
    elif jq -e '.marketplaces | type == "array"' "$CONFIG_JSON" &>/dev/null; then
        original_count=$(jq '.marketplaces | length' "$CONFIG_JSON")
        jq_inplace '.marketplaces = [.marketplaces[] | select((.key // .name // .id) != "beads-marketplace")]' "$CONFIG_JSON"
        new_count=$(jq '.marketplaces | length' "$CONFIG_JSON")
        if [[ "$original_count" != "$new_count" ]]; then
            write_success "Removed beads-marketplace entry"
            SUMMARY_BEADS_REMOVED=true
        else
            write_info "No beads-marketplace found in marketplaces array"
        fi
    else
        write_info "No beads-marketplace found"
    fi
else
    write_info "No marketplaces key in config.json"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Skills: Link
# ─────────────────────────────────────────────────────────────────────────────
write_step "Skills · Link"

# Collect local skills
declare -A LOCAL_SKILL_PATHS=()
while IFS=$'\t' read -r skill_name skill_path; do
    LOCAL_SKILL_PATHS["$skill_name"]="$skill_path"
done < <(get_skill_folders "$REPO_SKILLS_DIR")

local_count=${#LOCAL_SKILL_PATHS[@]}
if [[ $local_count -eq 0 ]]; then
    write_info "No local skills found in $REPO_SKILLS_DIR"
else
    write_info "Local: $local_count skills found in $REPO_SKILLS_DIR"
    for skill_name in $(echo "${!LOCAL_SKILL_PATHS[@]}" | tr ' ' '\n' | sort); do
        skill_path="${LOCAL_SKILL_PATHS[$skill_name]}"
        link_path="$COPILOT_SKILLS_HOME/$skill_name"
        ask=$( ! $NON_INTERACTIVE && echo "true" || echo "false")
        create_dir_symlink "$link_path" "$skill_path" "$skill_name" "$ask"

        case "$FUNC_RESULT" in
            created)
                write_success "$skill_name"
                SUMMARY_SKILLS_CREATED+=("$skill_name") ;;
            exists)
                write_info "$skill_name — already linked"
                SUMMARY_SKILLS_EXISTED+=("$skill_name") ;;
            skipped)
                write_warn "$skill_name — skipped (real dir, user declined)"
                SUMMARY_SKILLS_SKIPPED+=("$skill_name") ;;
            failed)
                write_err "$skill_name — symlink failed"
                SUMMARY_SKILLS_FAILED+=("$skill_name") ;;
        esac
    done
fi

# ─────────────────────────────────────────────────────────────────────────────
# Skills: Legacy Cleanup
# ─────────────────────────────────────────────────────────────────────────────
# These repos are now installed via Copilot CLI plugins, not manual cloning.
write_step "Skills · Legacy Cleanup"

legacy_cleaned=0

if [[ -d "$COPILOT_SKILLS_HOME" ]]; then
    for dir in "$COPILOT_SKILLS_HOME"/*/; do
        [[ ! -d "$dir" ]] && continue
        dir="${dir%/}"
        skill_name=$(basename "$dir")

        if [[ -L "$dir" ]]; then
            target=$(readlink -f "$dir" 2>/dev/null || echo "")
            if [[ "$target" == *"anthropic-skills"* ]] || [[ "$target" == *"awesome-copilot"* ]] || [[ "$target" == *"msx-mcp"* ]] || [[ "$target" == *"MSX-MCP"* ]] || [[ "$target" == *"SPT-IQ"* ]]; then
                write_warn "Removing legacy junction: $skill_name → $target"
                rm -f "$dir" 2>/dev/null || rm -rf "$dir" 2>/dev/null
                ((legacy_cleaned++))
            fi
        fi
    done
fi

# Clean legacy entries from .external-paths.json
EXTERNAL_PATHS_FILE="$REPO_ROOT/.external-paths.json"
if [[ -f "$EXTERNAL_PATHS_FILE" ]]; then
    for key in anthropic github msx-mcp spt-iq; do
        if jq -e "has(\"$key\")" "$EXTERNAL_PATHS_FILE" >/dev/null 2>&1; then
            jq_inplace "del(.$key)" "$EXTERNAL_PATHS_FILE"
            write_info "Cleaned '$key' from .external-paths.json"
        fi
    done
fi

if [[ $legacy_cleaned -gt 0 ]]; then
    write_success "Removed $legacy_cleaned legacy skill junction(s)"
    write_info "Install community skills via plugins instead:"
    echo -e "    ${CYAN}copilot plugin install <name>@awesome-copilot${NC}"
    echo -e "    ${CYAN}copilot plugin marketplace add anthropics/skills${NC}"
    echo -e "    ${CYAN}copilot plugin install document-skills@anthropic-agent-skills${NC}"
    SUMMARY_PLUGIN_JUNCTIONS_CLEANED=$legacy_cleaned
else
    write_info "No legacy junctions to clean up"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Skills: Plugins
# ─────────────────────────────────────────────────────────────────────────────
write_step "Skills · Plugins"

# Filter plugins based on flags
if $INCLUDE_WORK; then
    PLUGINS_TO_INSTALL="$PLUGINS_JSON"
else
    PLUGINS_TO_INSTALL=$(echo "$PLUGINS_JSON" | jq '[.[] | select(.work != true)]')
fi

PLUGIN_COUNT=$(echo "$PLUGINS_TO_INSTALL" | jq 'length')

if [[ $PLUGIN_COUNT -eq 0 ]]; then
    write_info "No plugins to install (use --work to include work plugins)"
else
    # Get currently installed plugins
    INSTALLED_PLUGINS=""
    if command -v copilot &>/dev/null; then
        INSTALLED_PLUGINS=$(copilot plugin list 2>/dev/null || true)
    fi

    for i in $(seq 0 $((PLUGIN_COUNT - 1))); do
        PLUGIN_NAME=$(echo "$PLUGINS_TO_INSTALL" | jq -r ".[$i].name")
        PLUGIN_SOURCE=$(echo "$PLUGINS_TO_INSTALL" | jq -r ".[$i].source")

        if echo "$INSTALLED_PLUGINS" | grep -q "$PLUGIN_NAME"; then
            write_info "$PLUGIN_NAME already installed"
            SUMMARY_PLUGINS_SKIPPED+=("$PLUGIN_NAME")
        else
            write_info "Installing $PLUGIN_NAME from $PLUGIN_SOURCE..."
            if copilot plugin install "$PLUGIN_SOURCE" 2>&1; then
                write_success "$PLUGIN_NAME installed"
                SUMMARY_PLUGINS_INSTALLED+=("$PLUGIN_NAME")
            else
                write_warn "Failed to install $PLUGIN_NAME"
                SUMMARY_PLUGINS_FAILED+=("$PLUGIN_NAME")
            fi
        fi
    done
fi

# ─────────────────────────────────────────────────────────────────────────────
# Skills: External Repos
# ─────────────────────────────────────────────────────────────────────────────
write_step "Skills · External Repos"

# Track all skills: linked_skills[name] = source, skill_paths[name] = path
declare -A LINKED_SKILLS=()
declare -A SKILL_PATHS=()

# Register local skills first (local wins)
for skill_name in "${!LOCAL_SKILL_PATHS[@]}"; do
    LINKED_SKILLS["$skill_name"]="local"
    SKILL_PATHS["$skill_name"]="${LOCAL_SKILL_PATHS[$skill_name]}"
done

# Load or create .external-paths.json
EXTERNAL_PATHS_FILE="$REPO_ROOT/.external-paths.json"
if [[ ! -f "$EXTERNAL_PATHS_FILE" ]]; then
    echo '{}' > "$EXTERNAL_PATHS_FILE"
fi

ABORT_REMAINING_EXTERNAL=false

while IFS= read -r repo_json; do
    $ABORT_REMAINING_EXTERNAL && break

    repo_name=$(echo "$repo_json" | jq -r '.name')
    display_name=$(echo "$repo_json" | jq -r '.displayName')
    repo_url=$(echo "$repo_json" | jq -r '.repo')
    clone_dir=$(echo "$repo_json" | jq -r '.cloneDir')
    skills_subdir=$(echo "$repo_json" | jq -r '.skillsSubdir')
    category=$(echo "$repo_json" | jq -r '.category')

    resolved_path=""

    # 1. Check stored path from .external-paths.json
    stored_path=$(jq -r --arg n "$repo_name" '.[$n] // empty' "$EXTERNAL_PATHS_FILE")
    if [[ -n "$stored_path" && -d "$stored_path" ]]; then
        resolved_path="$stored_path"
        write_info "$display_name — using stored path: $resolved_path"
    fi

    if [[ -z "$resolved_path" ]]; then
        # Auto-detect: check external/<CloneDir>
        detected_path=""
        ext_path="$EXTERNAL_DIR/$clone_dir"
        if [[ -d "$ext_path" ]]; then
            detected_path=$(resolve_path "$ext_path")
        fi

        # 2. Interactive: prompt for parent directory
        if ! $NON_INTERACTIVE; then
            parent_suggestion="${detected_path:+$(dirname "$detected_path")}"
            [[ -z "$parent_suggestion" ]] && parent_suggestion="$EXTERNAL_DIR"
            read -rp "    Clone directory for $display_name [$parent_suggestion] " user_dir
            if [[ -n "$user_dir" ]]; then
                user_dir="${user_dir/#\~/$HOME}"
                resolved_path=$(resolve_path "$user_dir/$clone_dir")
            else
                resolved_path=$(resolve_path "$parent_suggestion/$clone_dir")
            fi
        # 3. Non-interactive: use detected or fallback
        else
            if [[ -n "$detected_path" ]]; then
                resolved_path="$detected_path"
                write_info "$display_name — auto-detected at $resolved_path"
            else
                resolved_path=$(resolve_path "$EXTERNAL_DIR/$clone_dir")
            fi
        fi
    fi

    skills_path="$resolved_path/$skills_subdir"

    clone_or_pull_repo "$repo_url" "$resolved_path" "$display_name" "$category"
    resolved_path="$RESOLVED_CLONE_PATH"

    skip_repo=false
    case "$FUNC_RESULT" in
        cloned)
            write_success "$display_name — cloned"
            SUMMARY_EXTERNAL_CLONED+=("$display_name") ;;
        pulled)
            write_success "$display_name — updated"
            SUMMARY_EXTERNAL_PULLED+=("$display_name") ;;
        skipped)
            write_warn "$display_name — skipped by user"
            skip_repo=true ;;
        aborted)
            write_warn "$display_name — aborting remaining external repo clones"
            ABORT_REMAINING_EXTERNAL=true ;;
        pull-failed)
            write_warn "$display_name — using existing local copy (pull failed)"
            SUMMARY_EXTERNAL_FAILED+=("$display_name") ;;
        *failed*)
            write_err "$display_name — $FUNC_RESULT"
            SUMMARY_EXTERNAL_FAILED+=("$display_name")
            skip_repo=true ;;
    esac
    $ABORT_REMAINING_EXTERNAL && break
    $skip_repo && continue

    # Store resolved path
    jq_inplace --arg n "$repo_name" --arg p "$resolved_path" '.[$n] = $p' "$EXTERNAL_PATHS_FILE"

    # Enumerate skills, respecting exclude list
    skills_path="$resolved_path/$skills_subdir"
    excluded_count=0
    while IFS=$'\t' read -r skill_name skill_path; do
        # Check exclude list
        if echo "$repo_json" | jq -e --arg s "$skill_name" '.exclude | index($s) != null' &>/dev/null; then
            ((excluded_count++))
            continue
        fi

        # Skip if already registered (local wins, first external wins)
        if [[ -n "${LINKED_SKILLS[$skill_name]+x}" ]]; then
            existing_source="${LINKED_SKILLS[$skill_name]}"
            if [[ "$existing_source" == "local" ]]; then
                write_warn "$skill_name — conflict with $display_name (local wins)"
                SUMMARY_CONFLICTS+=("$skill_name (local wins over $display_name)")
            fi
            # If from another external, first one wins (already registered)
            continue
        fi

        LINKED_SKILLS["$skill_name"]="$repo_name"
        SKILL_PATHS["$skill_name"]="$skill_path"
    done < <(get_skill_folders "$skills_path")

    ext_skill_count=$(get_skill_folders "$skills_path" | wc -l)
    write_info "$display_name: $ext_skill_count skills found in $skills_path"
    if [[ $excluded_count -gt 0 ]]; then
        write_info "$display_name: $excluded_count skill(s) excluded"
    fi
done < <(echo "$REPOS_JSON" | jq -c '.[]')

# Link external skills
for skill_name in $(echo "${!LINKED_SKILLS[@]}" | tr ' ' '\n' | sort); do
    source="${LINKED_SKILLS[$skill_name]}"
    [[ "$source" == "local" ]] && continue  # Already linked in Step 7
    skill_path="${SKILL_PATHS[$skill_name]}"
    link_path="$COPILOT_SKILLS_HOME/$skill_name"
    ask=$( ! $NON_INTERACTIVE && echo "true" || echo "false")

    create_dir_symlink "$link_path" "$skill_path" "$skill_name ($source)" "$ask"

    case "$FUNC_RESULT" in
        created)
            write_success "$skill_name ($source)"
            SUMMARY_SKILLS_CREATED+=("$skill_name") ;;
        exists)
            write_info "$skill_name — already linked"
            SUMMARY_SKILLS_EXISTED+=("$skill_name") ;;
        skipped)
            write_warn "$skill_name — skipped"
            SUMMARY_SKILLS_SKIPPED+=("$skill_name") ;;
        failed)
            write_err "$skill_name — symlink failed"
            SUMMARY_SKILLS_FAILED+=("$skill_name") ;;
    esac
done

# ─────────────────────────────────────────────────────────────────────────────
# MCP: Build Servers
# ─────────────────────────────────────────────────────────────────────────────
write_step "MCP · Build Servers"

# Determine enabled categories
ENABLED_CATEGORIES='["base"]'
$INCLUDE_WORK && ENABLED_CATEGORIES=$(echo "$ENABLED_CATEGORIES" | jq '. + ["powerbi"]')

ENABLED_SERVERS=$(jq -c --argjson cats "$ENABLED_CATEGORIES" '[.servers[] | select(.category as $c | $cats | index($c) != null)]' "$MCP_SERVERS_JSON")
ENABLED_COUNT=$(echo "$ENABLED_SERVERS" | jq 'length')

# Load or create .mcp-paths.json
MCP_PATHS_FILE="$REPO_ROOT/.mcp-paths.json"
if [[ ! -f "$MCP_PATHS_FILE" ]]; then
    echo '{}' > "$MCP_PATHS_FILE"
fi

ABORT_REMAINING_MCP=false

while IFS= read -r server_json; do
    $ABORT_REMAINING_MCP && break

    server_type=$(echo "$server_json" | jq -r '.type')
    [[ "$server_type" != "local" ]] && continue

    server_name=$(echo "$server_json" | jq -r '.name')
    server_repo=$(echo "$server_json" | jq -r '.repo')
    server_clone_dir=$(echo "$server_json" | jq -r '.cloneDir')
    server_category=$(echo "$server_json" | jq -r '.category')

    resolved_path=""

    # 1. Check stored path
    stored_path=$(jq -r --arg n "$server_name" '.[$n] // empty' "$MCP_PATHS_FILE")
    if [[ -n "$stored_path" && -d "$stored_path" ]]; then
        resolved_path="$stored_path"
        write_info "$server_name — using stored path: $resolved_path"
    fi

    if [[ -z "$resolved_path" ]]; then
        # Auto-detect from defaultPaths and external/
        detected_path=""
        while IFS= read -r dp; do
            expanded="${dp/#\~/$HOME}"
            if [[ -d "$expanded" ]]; then
                detected_path=$(resolve_path "$expanded")
                break
            fi
        done < <(echo "$server_json" | jq -r '.defaultPaths[]? // empty')

        if [[ -z "$detected_path" ]]; then
            ext_path="$EXTERNAL_DIR/$server_clone_dir"
            if [[ -d "$ext_path" ]]; then
                detected_path=$(resolve_path "$ext_path")
            fi
        fi

        # 2. Interactive: prompt
        if ! $NON_INTERACTIVE; then
            suggestion="${detected_path:-$EXTERNAL_DIR/$server_clone_dir}"
            read -rp "    Path to $server_name repo [$suggestion] " user_path
            if [[ -n "$user_path" ]]; then
                user_path="${user_path/#\~/$HOME}"
                resolved_path=$(resolve_path "$user_path")
            else
                resolved_path=$(resolve_path "$suggestion")
            fi
        # 3. Non-interactive: use detected or fallback
        else
            if [[ -n "$detected_path" ]]; then
                resolved_path="$detected_path"
                write_info "$server_name — auto-detected at $resolved_path"
            else
                resolved_path=$(resolve_path "$EXTERNAL_DIR/$server_clone_dir")
            fi
        fi
    fi

    # Clone if needed
    if [[ ! -d "$resolved_path" ]]; then
        write_info "$server_name — cloning to $resolved_path..."
        clone_or_pull_repo "$server_repo" "$resolved_path" "$server_name" "$server_category"
        resolved_path="$RESOLVED_CLONE_PATH"
        case "$FUNC_RESULT" in
            aborted)
                write_warn "$server_name — aborting remaining MCP clones"
                ABORT_REMAINING_MCP=true
                break ;;
            skipped)
                write_warn "$server_name — skipped by user"
                SUMMARY_MCP_FAILED+=("$server_name")
                continue ;;
            *failed*)
                write_err "$server_name — clone failed: $FUNC_RESULT"
                SUMMARY_MCP_FAILED+=("$server_name")
                continue ;;
        esac
    fi

    # Store resolved path
    jq_inplace --arg n "$server_name" --arg p "$resolved_path" '.[$n] = $p' "$MCP_PATHS_FILE"

    # Build
    build_cmds=$(echo "$server_json" | jq -r '.build[]? // empty')
    if [[ -n "$build_cmds" ]]; then
        write_info "$server_name — building..."
        build_failed=false
        pushd "$resolved_path" > /dev/null
        while IFS= read -r cmd; do
            if ! eval "$cmd" &>/dev/null; then
                write_err "$server_name — '$cmd' failed"
                build_failed=true
                break
            fi
        done <<< "$build_cmds"
        popd > /dev/null

        if $build_failed; then
            SUMMARY_MCP_FAILED+=("$server_name")
        else
            write_success "$server_name — built successfully"
            SUMMARY_MCP_BUILT+=("$server_name")
        fi
    fi
done < <(echo "$ENABLED_SERVERS" | jq -c '.[]')

local_server_count=$(echo "$ENABLED_SERVERS" | jq '[.[] | select(.type == "local")] | length')
if [[ ${#SUMMARY_MCP_BUILT[@]} -eq 0 && ${#SUMMARY_MCP_FAILED[@]} -eq 0 && "$local_server_count" -eq 0 ]]; then
    write_info "No local MCP servers to build"
fi

# ─────────────────────────────────────────────────────────────────────────────
# MCP: Environment
# ─────────────────────────────────────────────────────────────────────────────
write_step "MCP · Environment"

while IFS= read -r server_json; do
    server_name=$(echo "$server_json" | jq -r '.name')
    env_vars=$(echo "$server_json" | jq -r '.envVars[]? // empty')
    [[ -z "$env_vars" ]] && continue

    while IFS= read -r var_name; do
        val="${!var_name:-}"
        if [[ -n "$val" ]]; then
            write_info "$var_name — set ✓"
        elif ! $NON_INTERACTIVE; then
            write_warn "$var_name (required by $server_name) is not set"
            read -rp "    Enter value for $var_name (or press Enter to skip) " input_val
            if [[ -n "$input_val" ]]; then
                export "$var_name=$input_val"
                write_success "$var_name — set for this session"
                write_warn "  To persist, add to your shell profile: export $var_name=\"$input_val\""
            else
                write_warn "$var_name — skipped (MCP server $server_name may not work)"
                SUMMARY_MCP_ENV_MISSING+=("$var_name ($server_name)")
            fi
        else
            write_warn "$var_name (required by $server_name) is not set — server may not work at runtime"
            SUMMARY_MCP_ENV_MISSING+=("$var_name ($server_name)")
        fi
    done <<< "$env_vars"
done < <(echo "$ENABLED_SERVERS" | jq -c '.[]')

# ─────────────────────────────────────────────────────────────────────────────
# MCP: Config
# ─────────────────────────────────────────────────────────────────────────────
write_step "MCP · Config"

MCP_CONFIG='{"mcpServers":{}}'

while IFS= read -r server_json; do
    server_name=$(echo "$server_json" | jq -r '.name')
    server_type=$(echo "$server_json" | jq -r '.type')
    tools=$(echo "$server_json" | jq '.tools')

    entry='{}'
    case "$server_type" in
        npx)
            package=$(echo "$server_json" | jq -r '.package')
            args=$(echo "$server_json" | jq '[.args[]? // empty]')
            npx_args=$(echo "null" | jq --arg pkg "$package" --argjson extra "$args" '["-y", $pkg] + $extra')
            entry=$(jq -n --argjson tools "$tools" --argjson args "$npx_args" \
                '{"type":"local","command":"npx","tools":$tools,"args":$args}')
            ;;
        http)
            url=$(echo "$server_json" | jq -r '.url')
            headers=$(echo "$server_json" | jq '.headers // null')
            entry=$(jq -n --arg url "$url" --argjson tools "$tools" \
                '{"type":"http","url":$url,"tools":$tools}')
            if [[ "$headers" != "null" ]]; then
                entry=$(echo "$entry" | jq --argjson h "$headers" '.headers = $h')
            fi
            ;;
        local)
            command_name=$(echo "$server_json" | jq -r '.command')
            entry_point=$(echo "$server_json" | jq -r '.entryPoint')
            server_path=$(jq -r --arg n "$server_name" '.[$n] // empty' "$MCP_PATHS_FILE")
            if [[ -n "$server_path" ]]; then
                full_entry_point="$server_path/$entry_point"
            else
                clone_dir=$(echo "$server_json" | jq -r '.cloneDir')
                full_entry_point="$EXTERNAL_DIR/$clone_dir/$entry_point"
            fi
            full_entry_point=$(resolve_path "$full_entry_point")
            entry=$(jq -n --arg cmd "$command_name" --argjson tools "$tools" --arg ep "$full_entry_point" \
                '{"type":"local","command":$cmd,"tools":$tools,"args":[$ep]}')
            ;;
    esac

    MCP_CONFIG=$(echo "$MCP_CONFIG" | jq --arg name "$server_name" --argjson entry "$entry" \
        '.mcpServers[$name] = $entry')
done < <(echo "$ENABLED_SERVERS" | jq -c '.[]')

MCP_CONFIG_PATH="$COPILOT_HOME/mcp-config.json"
# Remove stale symlink so redirect can create a regular file
if [ -L "$MCP_CONFIG_PATH" ]; then
    rm -f "$MCP_CONFIG_PATH"
fi
echo "$MCP_CONFIG" | jq '.' > "$MCP_CONFIG_PATH"
write_success "Generated $MCP_CONFIG_PATH ($ENABLED_COUNT servers)"
SUMMARY_MCP_GENERATED=true

# ─────────────────────────────────────────────────────────────────────────────
# LSP: Config
# ─────────────────────────────────────────────────────────────────────────────

LSP_SERVERS_JSON="$REPO_ROOT/lsp-servers.json"

generate_lsp_config() {
    local label="${1:-LSP · Config}"
    write_step "$label"

    local lsp_config='{"lspServers":{}}'
    local lsp_included=0
    local lsp_skipped=()
    local server_name server_json cmd args_json cmd_args

    if [[ -f "$LSP_SERVERS_JSON" ]]; then
        while IFS= read -r server_name; do
            server_json=$(jq -c --arg name "$server_name" '.lspServers[$name]' "$LSP_SERVERS_JSON")
            cmd=$(echo "$server_json" | jq -r '.command')
            args_json=$(echo "$server_json" | jq -r '.args // [] | .[]')

            cmd_args=()
            if [[ -n "$args_json" ]]; then
                readarray -t cmd_args <<< "$args_json"
            fi

            if validate_lsp_binary "$cmd" "${cmd_args[@]}"; then
                lsp_config=$(echo "$lsp_config" | jq --arg name "$server_name" --argjson entry "$server_json" \
                    '.lspServers[$name] = $entry')
                write_success "$server_name — validated and included"
                ((lsp_included++))
            else
                lsp_skipped+=("$server_name")
                if command -v "$cmd" &>/dev/null; then
                    # Binary exists but doesn't work — worth a warning
                    write_warn "$server_name — found on PATH but not functional, skipped"
                else
                    # Binary not installed at all — expected, not alarming
                    write_info "$server_name — not installed (available in optional dependencies below)"
                fi
            fi
        done < <(jq -r '.lspServers | keys[]' "$LSP_SERVERS_JSON")
    else
        write_warn "lsp-servers.json not found in repo — skipping LSP config generation"
    fi

    local lsp_config_path="$COPILOT_HOME/lsp-config.json"
    if [ -L "$lsp_config_path" ]; then
        rm -f "$lsp_config_path"
    fi

    if ((lsp_included > 0)); then
        echo "$lsp_config" | jq '.' > "$lsp_config_path"
        write_success "Generated $lsp_config_path ($lsp_included servers)"
    else
        echo '{"lspServers":{}}' | jq '.' > "$lsp_config_path"
        write_info "No LSP servers installed yet — you can add them in optional dependencies"
    fi

    # Update summary globals
    SUMMARY_LSP_GENERATED=true
    SUMMARY_LSP_COUNT=$lsp_included
    SUMMARY_LSP_SKIPPED=("${lsp_skipped[@]}")
}

generate_lsp_config

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup: Stale Symlinks
# ─────────────────────────────────────────────────────────────────────────────
write_step "Cleanup · Stale Symlinks"

stale_count=0
orphan_count=0

if $INCLUDE_CLEAN_ORPHANS; then
    # Remove ALL items in skills dir that aren't in the linked set
    for dir in "$COPILOT_SKILLS_HOME"/*/; do
        [[ -d "$dir" ]] || continue
        dir="${dir%/}"
        name=$(basename "$dir")
        if [[ -z "${LINKED_SKILLS[$name]+x}" ]]; then
            if [[ -L "$dir" ]]; then
                write_warn "Removing orphan symlink: $name"
                rm -f "$dir"
            else
                write_warn "Removing orphan skill: $name"
                rm -rf "$dir"
            fi
            ((orphan_count++))
        fi
    done
else
    # Default: only remove stale symlinks pointing into managed directories
    managed_repo_root=$(resolve_path "$REPO_ROOT")
    managed_external=$(resolve_path "$EXTERNAL_DIR")

    for dir in "$COPILOT_SKILLS_HOME"/*/; do
        [[ -d "$dir" ]] || continue
        dir="${dir%/}"
        name=$(basename "$dir")
        if [[ -L "$dir" ]]; then
            target=$(get_link_target "$dir")
            if [[ -n "$target" ]]; then
                resolved=$(resolve_path "$target")
                is_managed=false
                [[ "$resolved" == "$managed_repo_root"* ]] && is_managed=true
                [[ "$resolved" == "$managed_external"* ]] && is_managed=true
                if $is_managed && [[ -z "${LINKED_SKILLS[$name]+x}" ]]; then
                    write_warn "Removing stale symlink: $name → $target"
                    rm -f "$dir"
                    ((stale_count++))
                fi
            fi
        fi
    done
fi

total_cleaned=$((stale_count + orphan_count))
if [[ $total_cleaned -eq 0 ]]; then
    write_info "No stale symlinks to clean up"
else
    parts=()
    [[ $stale_count -gt 0 ]] && parts+=("$stale_count stale")
    [[ $orphan_count -gt 0 ]] && parts+=("$orphan_count orphan")
    write_success "Cleaned up $(IFS=', '; echo "${parts[*]}") skill(s)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 12b: Optional Dependencies
# ─────────────────────────────────────────────────────────────────────────────
if ! $NON_INTERACTIVE; then
    draw_section "Optional Dependencies"
    echo -e "  ${DIM}These tools enhance specific skills. You can install them now${NC}"
    echo -e "  ${DIM}or later. The agent works without them but some skills will${NC}"
    echo -e "  ${DIM}be limited.${NC}"
    echo ""

    # --- LSP Server Binaries ---
    # Language servers give the Copilot agent deeper understanding of your code.
    # They provide go-to-definition, find-references, and type information — the
    # same intelligence your IDE uses. Without them the agent still works, but
    # relies on text-based search instead.

    # Detect WSL to give better explanations when Windows binaries are found
    IS_WSL=false
    if [[ -f /proc/version ]] && grep -qi microsoft /proc/version 2>/dev/null; then
        IS_WSL=true
    fi

    # Determine if npm global install needs sudo (system-managed Node, e.g., apt)
    NPM_NEEDS_SUDO=false
    if command -v npm &>/dev/null; then
        npm_prefix=$(npm config get prefix 2>/dev/null)
        if [[ -n "$npm_prefix" ]] && ! [[ -w "$npm_prefix/lib" ]]; then
            NPM_NEEDS_SUDO=true
        fi
    fi
    npm_install_g() {
        if $NPM_NEEDS_SUDO; then
            write_info "Using sudo (Node was installed system-wide, so global packages need root)"
            sudo npm install -g "$@"
        else
            npm install -g "$@"
        fi
    }

    # --- LSP: typescript-language-server (npm) ---
    if validate_lsp_binary typescript-language-server --stdio; then
        write_success "typescript-language-server already installed"
        SUMMARY_OPTIONAL_SKIPPED+=("typescript-language-server")
    else
        if command -v typescript-language-server &>/dev/null; then
            local tsl_path
            tsl_path=$(command -v typescript-language-server 2>/dev/null)
            if $IS_WSL && [[ "$tsl_path" == /mnt/* ]]; then
                write_warn "typescript-language-server found but it's a Windows binary — can't run in WSL"
                write_info "Resolved path: $tsl_path"
                write_info "A native Linux version is needed inside WSL."
            elif $IS_WSL; then
                write_warn "typescript-language-server found on PATH but not functional in WSL"
                write_info "Resolved path: $tsl_path"
            else
                write_warn "typescript-language-server found on PATH but not working"
            fi
        fi
        echo ""
        echo "  TypeScript Language Server gives the agent code intelligence for"
        echo "  .ts, .tsx, .js, and .jsx files (types, definitions, references)."
        echo ""
        read -rp "  Install typescript-language-server? [Y/n] " answer
        if [[ -z "$answer" || "$answer" == "y" || "$answer" == "Y" ]]; then
            write_info "Installing typescript-language-server via npm..."
            if npm_install_g typescript-language-server typescript 2>&1; then
                write_success "typescript-language-server installed"
                SUMMARY_OPTIONAL_INSTALLED+=("typescript-language-server")
            else
                write_err "typescript-language-server install failed"
                SUMMARY_OPTIONAL_FAILED+=("typescript-language-server")
            fi
        else
            write_info "Skipped typescript-language-server"
            SUMMARY_OPTIONAL_SKIPPED+=("typescript-language-server")
        fi
    fi

    # --- LSP: pyright-langserver (npm) ---
    if validate_lsp_binary pyright-langserver --stdio; then
        write_success "pyright-langserver already installed"
        SUMMARY_OPTIONAL_SKIPPED+=("pyright-langserver")
    else
        if command -v pyright-langserver &>/dev/null; then
            local pyr_path
            pyr_path=$(command -v pyright-langserver 2>/dev/null)
            if $IS_WSL && [[ "$pyr_path" == /mnt/* ]]; then
                write_warn "pyright-langserver found but it's a Windows binary — can't run in WSL"
                write_info "Resolved path: $pyr_path"
                write_info "A native Linux version is needed inside WSL."
            elif $IS_WSL; then
                write_warn "pyright-langserver found on PATH but not functional in WSL"
                write_info "Resolved path: $pyr_path"
            else
                write_warn "pyright-langserver found on PATH but not working"
            fi
        fi
        echo ""
        echo "  Pyright gives the agent code intelligence for Python files"
        echo "  (type checking, definitions, references)."
        echo ""
        read -rp "  Install pyright-langserver? [Y/n] " answer
        if [[ -z "$answer" || "$answer" == "y" || "$answer" == "Y" ]]; then
            write_info "Installing pyright via npm..."
            if npm_install_g pyright 2>&1; then
                write_success "pyright-langserver installed"
                SUMMARY_OPTIONAL_INSTALLED+=("pyright-langserver")
            else
                write_err "pyright-langserver install failed"
                SUMMARY_OPTIONAL_FAILED+=("pyright-langserver")
            fi
        else
            write_info "Skipped pyright-langserver"
            SUMMARY_OPTIONAL_SKIPPED+=("pyright-langserver")
        fi
    fi

    # --- LSP: rust-analyzer (rustup) ---
    if validate_lsp_binary rust-analyzer; then
        write_success "rust-analyzer already installed"
        SUMMARY_OPTIONAL_SKIPPED+=("rust-analyzer")
    else
        if command -v rust-analyzer &>/dev/null; then
            local ra_path
            ra_path=$(command -v rust-analyzer 2>/dev/null)
            if $IS_WSL && [[ "$ra_path" == /mnt/* ]]; then
                write_warn "rust-analyzer found but it's a Windows binary — can't run in WSL"
                write_info "Resolved path: $ra_path"
            elif $IS_WSL; then
                write_warn "rust-analyzer found on PATH but not functional in WSL"
                write_info "Resolved path: $ra_path"
            else
                write_warn "rust-analyzer found on PATH but not working"
            fi
        fi
        if ! command -v rustup &>/dev/null; then
            echo ""
            echo "  rust-analyzer gives the agent code intelligence for Rust files"
            echo "  (types, definitions, references)."
            echo ""
            echo "  It requires the Rust toolchain, which isn't installed."
            echo "  To install Rust (includes rustup, cargo, and rustc), run:"
            echo ""
            echo "    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
            echo ""
            echo "  After installing Rust, re-run this setup to add rust-analyzer."
            echo ""
            SUMMARY_OPTIONAL_SKIPPED+=("rust-analyzer")
        else
            echo ""
            echo "  rust-analyzer gives the agent code intelligence for Rust files."
            echo ""
            read -rp "  Install rust-analyzer? [Y/n] " answer
            if [[ -z "$answer" || "$answer" == "y" || "$answer" == "Y" ]]; then
                write_info "Installing rust-analyzer via rustup..."
                if rustup component add rust-analyzer 2>&1; then
                    write_success "rust-analyzer installed"
                    SUMMARY_OPTIONAL_INSTALLED+=("rust-analyzer")
                else
                    write_err "rust-analyzer install failed"
                    SUMMARY_OPTIONAL_FAILED+=("rust-analyzer")
                fi
            else
                write_info "Skipped rust-analyzer"
                SUMMARY_OPTIONAL_SKIPPED+=("rust-analyzer")
            fi
        fi
    fi

    # --- MarkItDown (pipx preferred, pip fallback) ---
    if command -v markitdown &>/dev/null; then
        write_success "MarkItDown already installed"
        SUMMARY_OPTIONAL_SKIPPED+=("markitdown")
    else
        echo ""
        echo "  MarkItDown lets the agent read PDF, Word, Excel, and PowerPoint"
        echo "  files by converting them to markdown text."
        echo ""
        read -rp "  Install MarkItDown? [Y/n] " answer
        if [[ -z "$answer" || "$answer" == "y" || "$answer" == "Y" ]]; then
            # Modern Linux distros (Ubuntu 23.04+, Fedora 38+) block 'pip install'
            # system-wide to prevent breaking the OS Python. pipx solves this by
            # installing Python apps in their own isolated environments.
            if ! command -v pipx &>/dev/null; then
                echo ""
                write_info "MarkItDown is a Python app. Modern Linux distros require 'pipx'"
                write_info "to install Python apps safely (it creates an isolated environment"
                write_info "so the app doesn't interfere with your system Python)."
                echo ""
                if command -v apt &>/dev/null; then
                    read -rp "  Install pipx? (sudo apt install pipx) [Y/n] " pipx_answer
                    if [[ -z "$pipx_answer" || "$pipx_answer" == "y" || "$pipx_answer" == "Y" ]]; then
                        write_info "Installing pipx..."
                        if sudo apt install -y pipx 2>&1; then
                            write_success "pipx installed"
                        else
                            write_err "pipx install failed"
                        fi
                    else
                        write_info "Skipped pipx — will try pip directly (may fail on managed Python)"
                    fi
                elif command -v brew &>/dev/null; then
                    read -rp "  Install pipx via brew? [Y/n] " pipx_answer
                    if [[ -z "$pipx_answer" || "$pipx_answer" == "y" || "$pipx_answer" == "Y" ]]; then
                        write_info "Installing pipx..."
                        if brew install pipx 2>&1; then
                            write_success "pipx installed"
                        else
                            write_err "pipx install failed"
                        fi
                    else
                        write_info "Skipped pipx — will try pip directly (may fail on managed Python)"
                    fi
                else
                    write_warn "Could not find apt or brew to install pipx."
                    write_info "Install pipx manually (https://pipx.pypa.io), then re-run setup."
                fi
            fi

            if command -v pipx &>/dev/null; then
                write_info "Installing markitdown[all] via pipx..."
                if pipx install 'markitdown[all]' 2>&1; then
                    write_success "MarkItDown installed"
                    SUMMARY_OPTIONAL_INSTALLED+=("markitdown")
                else
                    write_err "MarkItDown install failed"
                    SUMMARY_OPTIONAL_FAILED+=("markitdown")
                fi
            elif command -v pip &>/dev/null; then
                write_info "Installing markitdown[all] via pip..."
                if pip install 'markitdown[all]' 2>&1; then
                    write_success "MarkItDown installed"
                    SUMMARY_OPTIONAL_INSTALLED+=("markitdown")
                else
                    write_err "MarkItDown install failed"
                    SUMMARY_OPTIONAL_FAILED+=("markitdown")
                fi
            else
                write_err "Neither pipx nor pip found — cannot install MarkItDown"
                SUMMARY_OPTIONAL_FAILED+=("markitdown")
            fi
        else
            write_info "Skipped MarkItDown"
            SUMMARY_OPTIONAL_SKIPPED+=("markitdown")
        fi
    fi

    # --- QMD (npm, requires Node.js 22+) ---
    if command -v qmd &>/dev/null; then
        write_success "QMD already installed"
        SUMMARY_OPTIONAL_SKIPPED+=("qmd")
    else
        node_ok=false
        if command -v node &>/dev/null; then
            node_ver=$(node --version 2>/dev/null | sed 's/^v//')
            node_major=$(echo "$node_ver" | cut -d. -f1)
            if [[ "$node_major" -ge 22 ]]; then
                node_ok=true
            fi
        fi
        if ! $node_ok; then
            cur_node=$(command -v node &>/dev/null && node --version 2>/dev/null || echo "not found")
            write_warn "QMD requires Node.js 22+ (current: $cur_node)"
            write_info "Skipped QMD"
            SUMMARY_OPTIONAL_SKIPPED+=("qmd")
        else
            echo ""
            echo "  QMD (Query MarkDown) provides local hybrid search for the"
            echo "  agent's memory — it lets the agent search its past conversations"
            echo "  and session notes more effectively. Requires Node.js 22+."
            echo ""
            read -rp "  Install QMD? [Y/n] " answer
            if [[ -z "$answer" || "$answer" == "y" || "$answer" == "Y" ]]; then
                write_info "Installing @tobilu/qmd via npm..."
                if npm_install_g @tobilu/qmd 2>&1; then
                    write_success "QMD installed"
                    SUMMARY_OPTIONAL_INSTALLED+=("qmd")
                else
                    write_err "QMD install failed"
                    SUMMARY_OPTIONAL_FAILED+=("qmd")
                fi
            else
                write_info "Skipped QMD"
                SUMMARY_OPTIONAL_SKIPPED+=("qmd")
            fi
        fi
    fi

    # --- Playwright Edge driver ---
    edge_installed=false
    if [[ -d "$HOME/.cache/ms-playwright" ]]; then
        if ls "$HOME/.cache/ms-playwright"/msedge-* &>/dev/null 2>&1; then
            edge_installed=true
        fi
    fi
    if $edge_installed; then
        write_success "Playwright Edge driver already installed"
        SUMMARY_OPTIONAL_SKIPPED+=("playwright-edge")
    else
        echo ""
        echo "  Playwright lets the agent interact with web browsers — take"
        echo "  screenshots, click buttons, fill forms, and verify web apps."
        echo "  The Edge driver is used for browser automation."
        echo ""
        read -rp "  Install Playwright Edge driver? [y/N] " answer
        if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
            write_info "Installing Playwright Edge driver..."
            if npx playwright install msedge 2>&1; then
                write_success "Playwright Edge driver installed"
                SUMMARY_OPTIONAL_INSTALLED+=("playwright-edge")
            else
                write_err "Playwright Edge install failed"
                SUMMARY_OPTIONAL_FAILED+=("playwright-edge")
            fi
        else
            write_info "Skipped Playwright Edge driver"
            SUMMARY_OPTIONAL_SKIPPED+=("playwright-edge")
        fi
    fi
fi

# Re-generate lsp-config.json if optional deps installed any LSP servers
LSP_INSTALLED_ANY=false
for item in "${SUMMARY_OPTIONAL_INSTALLED[@]}"; do
    case "$item" in
        typescript-language-server|pyright-langserver|rust-analyzer) LSP_INSTALLED_ANY=true; break ;;
    esac
done
if $LSP_INSTALLED_ANY; then
    generate_lsp_config "Regenerate lsp-config.json (new servers installed)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 13: Summary
# ─────────────────────────────────────────────────────────────────────────────
draw_header "✨  Setup Complete" 1
echo ""

if $SUMMARY_BACKED_UP; then
    echo -e "  ${DIM}Backup${NC}           ~/.copilot-backup-$BACKUP_TIMESTAMP/"
fi

linked_count=${#SUMMARY_CONFIG_LINKED[@]}
skipped_cfg=${#SUMMARY_CONFIG_SKIPPED[@]}
if [[ $linked_count -gt 0 || $skipped_cfg -gt 0 ]]; then
    echo -e "  ${DIM}Config${NC}           $linked_count linked, $skipped_cfg skipped"
fi

if $SUMMARY_CONFIG_PATCHED; then
    echo -e "  ${DIM}Patched${NC}          $(IFS=', '; echo "${PORTABLE_ALLOWED_KEYS[*]}")"
fi

if $SUMMARY_TRUSTED_FOLDER; then
    echo -e "  ${DIM}Trusted folder${NC}   $RESOLVED_REPO_ROOT"
fi

if $SUMMARY_BEADS_REMOVED; then
    echo -e "  ${DIM}Marketplace${NC}      beads removed"
fi

created_count=${#SUMMARY_SKILLS_CREATED[@]}
existed_count=${#SUMMARY_SKILLS_EXISTED[@]}
skipped_count=${#SUMMARY_SKILLS_SKIPPED[@]}
failed_count=${#SUMMARY_SKILLS_FAILED[@]}

echo ""
echo -e "  ${BOLD}Skills${NC}"
[[ $created_count -gt 0 ]] && echo -e "    ${GREEN}✓${NC} Created         $created_count"
[[ $existed_count -gt 0 ]] && echo -e "    ${DIM}✓${NC} ${DIM}Already linked  $existed_count${NC}"
[[ $skipped_count -gt 0 ]] && echo -e "    ${YELLOW}⚠${NC} Skipped         $skipped_count"
[[ $failed_count  -gt 0 ]] && echo -e "    ${RED}✗${NC} Failed          $failed_count"
if [[ $created_count -eq 0 && $existed_count -eq 0 && $skipped_count -eq 0 && $failed_count -eq 0 ]]; then
    echo -e "    ${DIM}(none)${NC}"
fi

ext_cloned=${#SUMMARY_EXTERNAL_CLONED[@]}
ext_pulled=${#SUMMARY_EXTERNAL_PULLED[@]}
ext_failed=${#SUMMARY_EXTERNAL_FAILED[@]}
if [[ $ext_cloned -gt 0 || $ext_pulled -gt 0 || $ext_failed -gt 0 ]]; then
    echo ""
    echo -e "  ${BOLD}External Repos${NC}"
    [[ $ext_cloned -gt 0 ]] && echo -e "    ${GREEN}✓${NC} Cloned          $ext_cloned"
    [[ $ext_pulled -gt 0 ]] && echo -e "    ${DIM}✓${NC} ${DIM}Updated         $ext_pulled${NC}"
    [[ $ext_failed -gt 0 ]] && echo -e "    ${RED}✗${NC} Failed          $ext_failed"
fi

if [[ ${#SUMMARY_CONFLICTS[@]} -gt 0 ]]; then
    echo ""
    echo -e "  ${BOLD}Conflicts${NC}"
    for c in "${SUMMARY_CONFLICTS[@]}"; do
        echo -e "    ${YELLOW}⚠${NC} $c"
    done
fi

if $SUMMARY_MCP_GENERATED; then
    echo ""
    echo -e "  ${BOLD}MCP Servers${NC}"
    echo -e "    ${GREEN}✓${NC} Configured      $ENABLED_COUNT"
    if [[ ${#SUMMARY_MCP_BUILT[@]} -gt 0 ]]; then
        echo -e "    ${GREEN}✓${NC} Built           $(IFS=', '; echo "${SUMMARY_MCP_BUILT[*]}")"
    fi
    if [[ ${#SUMMARY_MCP_FAILED[@]} -gt 0 ]]; then
        echo -e "    ${RED}✗${NC} Build failed    $(IFS=', '; echo "${SUMMARY_MCP_FAILED[*]}")"
    fi
    if [[ ${#SUMMARY_MCP_ENV_MISSING[@]} -gt 0 ]]; then
        echo -e "    ${YELLOW}⚠${NC} Env missing     $(IFS=', '; echo "${SUMMARY_MCP_ENV_MISSING[*]}")"
    fi
fi

# LSP servers
if [[ "$SUMMARY_LSP_GENERATED" == true ]]; then
    echo ""
    echo -e "  ${BOLD}LSP Servers${NC}"
    echo -e "    ${GREEN}✓${NC} Configured      $SUMMARY_LSP_COUNT"
    if ((${#SUMMARY_LSP_SKIPPED[@]} > 0)); then
        echo -e "    ${DIM}─${NC} ${DIM}Not installed    ${SUMMARY_LSP_SKIPPED[*]}${NC}"
    fi
fi

if [[ $SUMMARY_PLUGIN_JUNCTIONS_CLEANED -gt 0 ]]; then
    echo ""
    echo -e "  ${BOLD}Legacy Cleanup${NC}"
    echo -e "    ${YELLOW}⚠${NC} Junctions       $SUMMARY_PLUGIN_JUNCTIONS_CLEANED removed"
fi

if [[ ${#SUMMARY_PLUGINS_INSTALLED[@]} -gt 0 || ${#SUMMARY_PLUGINS_SKIPPED[@]} -gt 0 || ${#SUMMARY_PLUGINS_FAILED[@]} -gt 0 ]]; then
    echo ""
    echo -e "  ${BOLD}Plugins${NC}"
    [[ ${#SUMMARY_PLUGINS_INSTALLED[@]} -gt 0 ]] && echo -e "    ${GREEN}✓${NC} Installed       ${SUMMARY_PLUGINS_INSTALLED[*]}"
    [[ ${#SUMMARY_PLUGINS_SKIPPED[@]}  -gt 0 ]] && echo -e "    ${DIM}✓${NC} ${DIM}Already there   ${SUMMARY_PLUGINS_SKIPPED[*]}${NC}"
    [[ ${#SUMMARY_PLUGINS_FAILED[@]}   -gt 0 ]] && echo -e "    ${RED}✗${NC} Failed          ${SUMMARY_PLUGINS_FAILED[*]}"
fi

if [[ ${#SUMMARY_OPTIONAL_INSTALLED[@]} -gt 0 || ${#SUMMARY_OPTIONAL_SKIPPED[@]} -gt 0 || ${#SUMMARY_OPTIONAL_FAILED[@]} -gt 0 ]]; then
    echo ""
    echo -e "  ${BOLD}Optional Tools${NC}"
    [[ ${#SUMMARY_OPTIONAL_INSTALLED[@]} -gt 0 ]] && echo -e "    ${GREEN}✓${NC} Installed       ${SUMMARY_OPTIONAL_INSTALLED[*]}"
    [[ ${#SUMMARY_OPTIONAL_SKIPPED[@]}  -gt 0 ]] && echo -e "    ${DIM}─${NC} ${DIM}Skipped         ${SUMMARY_OPTIONAL_SKIPPED[*]}${NC}"
    [[ ${#SUMMARY_OPTIONAL_FAILED[@]}   -gt 0 ]] && echo -e "    ${RED}✗${NC} Failed          ${SUMMARY_OPTIONAL_FAILED[*]}"
fi

echo ""
