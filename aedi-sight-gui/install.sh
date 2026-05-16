#!/usr/bin/env bash
# AEDi-Sight RuView · cross-platform bootstrap installer (Linux / macOS).
#
#   curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash
#   ./install.sh                   # local copy
#   AEDI_DIR=/opt/aedi ./install.sh
#   ./install.sh --headless        # skip browser/desktop entry
#   ./install.sh --no-bootstrap    # don't try to apt/brew install git/python
#
# What it does, in order:
#   1. detect git + python3 (3.10+). If missing and a known package manager is
#      available (apt-get / dnf / pacman / zypper / apk / brew / pkg), prompt for
#      sudo and install them. Skipped if --no-bootstrap.
#   2. clone (or update) the repo at $AEDI_DIR.
#   3. install Python deps to the user site (no venv required).
#   4. drop ~/.local/bin/aedi-sight + a .desktop entry on Linux.
#   5. print next steps.
set -euo pipefail

REPO_URL="${AEDI_REPO_URL:-https://github.com/Antwerp-Ecosystem-Designs-Ionity/AEDi-Sight--RuView-.git}"
REPO_BRANCH="${AEDI_REPO_BRANCH:-main}"
DIR="${AEDI_DIR:-$HOME/AEDi-Sight-RuView}"
HEADLESS=0
NO_BOOTSTRAP=0
for a in "$@"; do
  case "$a" in
    --headless)     HEADLESS=1 ;;
    --no-bootstrap) NO_BOOTSTRAP=1 ;;
    --branch=*)     REPO_BRANCH="${a#--branch=}" ;;
  esac
done

c_blue='\033[38;2;58;139;255m'; c_dim='\033[38;2;140;150;170m'
c_ok='\033[38;2;46;204;113m';   c_warn='\033[38;2;245;180;0m'
c_rst='\033[0m'
say() { printf "${c_blue}%s${c_rst}\n" "$1"; }
hint(){ printf "${c_dim}%s${c_rst}\n" "$1"; }
ok()  { printf "${c_ok}%s${c_rst}\n"  "$1"; }
warn(){ printf "${c_warn}%s${c_rst}\n" "$1"; }

say "AEDi-Sight RuView · installer"
hint "  repo   $REPO_URL"
hint "  branch $REPO_BRANCH"
hint "  dest   $DIR"

# ── 1. bootstrap system deps ─────────────────────────────────────────────
need=()
command -v git    >/dev/null 2>&1 || need+=("git")
if command -v python3 >/dev/null 2>&1; then
  python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>/dev/null \
    || need+=("python>=3.10")
else
  need+=("python3")
fi

if [ "${#need[@]}" -gt 0 ] && [ "$NO_BOOTSTRAP" = 0 ]; then
  warn "missing: ${need[*]}"
  OS="$(uname -s)"
  SUDO="$( [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && echo "sudo " || echo "" )"
  if [ "$OS" = "Linux" ]; then
    if   command -v apt-get >/dev/null 2>&1; then
         say "→ apt-get install git python3 python3-pip"
         ${SUDO}apt-get update -y && ${SUDO}apt-get install -y git python3 python3-pip
    elif command -v dnf      >/dev/null 2>&1; then
         say "→ dnf install git python3 python3-pip"
         ${SUDO}dnf install -y git python3 python3-pip
    elif command -v pacman   >/dev/null 2>&1; then
         say "→ pacman -S git python python-pip"
         ${SUDO}pacman -Sy --noconfirm git python python-pip
    elif command -v zypper   >/dev/null 2>&1; then
         say "→ zypper install git python3 python3-pip"
         ${SUDO}zypper install -y git python3 python3-pip
    elif command -v apk      >/dev/null 2>&1; then
         say "→ apk add git python3 py3-pip bash"
         ${SUDO}apk add --no-cache git python3 py3-pip bash
    else
         warn "no known package manager — install git + python3.10+ manually, then re-run"; exit 2
    fi
  elif [ "$OS" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      say "→ brew install git python"
      brew install git python
    else
      warn "Homebrew not found — install from https://brew.sh then re-run (or pass --no-bootstrap)"
      exit 2
    fi
  elif [ "$OS" = "FreeBSD" ] && command -v pkg >/dev/null 2>&1; then
    say "→ pkg install git python311"
    ${SUDO}pkg install -y git python311
  else
    warn "unsupported OS $OS — install git + python3.10+ manually"
    exit 2
  fi
  ok "bootstrap deps installed"
fi

# Re-check post-bootstrap.
command -v git    >/dev/null 2>&1 || { warn "git still missing after bootstrap"; exit 3; }
command -v python3 >/dev/null 2>&1 || { warn "python3 still missing after bootstrap"; exit 3; }
python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>/dev/null \
  || { warn "python3 < 3.10 — please upgrade"; exit 3; }

# ── 2. clone / update repo ────────────────────────────────────────────────
mkdir -p "$DIR"
if [ ! -d "$DIR/.git" ]; then
  say "→ cloning into $DIR"
  git clone --branch "$REPO_BRANCH" --depth 1 "$REPO_URL" "$DIR"
else
  say "→ updating existing checkout in $DIR"
  (cd "$DIR" && git fetch --all --prune && git checkout "$REPO_BRANCH" && git pull --rebase --autostash) || true
fi

GUI_DIR="$DIR/aedi-sight-gui"
[ -d "$GUI_DIR" ] || { warn "$GUI_DIR not found in repo. Stopping."; exit 4; }
chmod +x "$GUI_DIR/launch.sh" 2>/dev/null || true
chmod +x "$DIR/aedi-sight"     2>/dev/null || true

# ── 3. Python deps ────────────────────────────────────────────────────────
say "→ installing Python deps (user site)"
python3 -m pip install --user --break-system-packages \
  aiohttp websockets pyserial esptool esp_idf_nvs_partition_gen scipy numpy \
  >/tmp/aedi-pip.log 2>&1 || {
    warn "pip install failed:"; tail -20 /tmp/aedi-pip.log; exit 5;
  }
ok "deps installed"

# ── 4. user-facing shims ──────────────────────────────────────────────────
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/aedi-sight" <<EOF
#!/usr/bin/env bash
exec "$GUI_DIR/launch.sh" "\$@"
EOF
chmod +x "$HOME/.local/bin/aedi-sight"

if [ "$HEADLESS" = 0 ] && [ "$(uname -s)" = "Linux" ]; then
  mkdir -p "$HOME/.local/share/applications"
  cat > "$HOME/.local/share/applications/aedi-sight.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=AEDi-Sight RuView
Comment=WiFi-CSI sensing console (IONITY)
Exec=$GUI_DIR/launch.sh
Icon=$GUI_DIR/static/img/favicon.svg
Categories=Network;Science;Utility;
Terminal=false
EOF
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  ok "desktop entry installed"
fi

# Heads-up if ~/.local/bin isn't on PATH.
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *)
  hint "  note: \$HOME/.local/bin is not on PATH — add this to your shell rc:"
  hint "         export PATH=\"\$HOME/.local/bin:\$PATH\""
  ;;
esac

printf "\n${c_ok}done.${c_rst}\n"
printf "  start ·  ${c_blue}aedi-sight${c_rst}                 (or:  ${GUI_DIR}/launch.sh)\n"
printf "  ui    ·  http://localhost:8088\n"
printf "  udp   ·  0.0.0.0:5005 (ADR-018 CSI ingest)\n"
printf "${c_dim}  flags · --auto-update, --no-open, --headless, --no-bootstrap${c_rst}\n"
