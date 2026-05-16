#!/usr/bin/env bash
# AEDi-Sight RuView · cross-platform installer (Linux / macOS)
#   ./install.sh                  # default install to ~/AEDi-Sight-RuView
#   AEDI_DIR=/opt/aedi ./install.sh
#   ./install.sh --headless       # skip browser/desktop entry steps
#
# Steps:
#   1. ensure git + python3.10+ available (best-effort; suggests installs if not)
#   2. clone (or update) the repo
#   3. install Python deps (user site, no venv mandate)
#   4. install a desktop entry on Linux, an `aedi-sight` shim on $PATH
#   5. print next steps
set -euo pipefail

REPO_URL="${AEDI_REPO_URL:-https://github.com/Antwerp-Ecosystem-Designs-Ionity/AEDi-Sight--RuView-.git}"
REPO_BRANCH="${AEDI_REPO_BRANCH:-main}"
DIR="${AEDI_DIR:-$HOME/AEDi-Sight-RuView}"
HEADLESS=0
for a in "$@"; do
  case "$a" in --headless) HEADLESS=1 ;; --branch=*) REPO_BRANCH="${a#--branch=}" ;; esac
done

c_blue='\033[38;2;58;139;255m'; c_rst='\033[0m'; c_dim='\033[38;2;140;150;170m'
printf "${c_blue}AEDi-Sight RuView · installer${c_rst}\n"
printf "${c_dim}  repo  · ${REPO_URL}\n  branch· ${REPO_BRANCH}\n  dest  · ${DIR}\n${c_rst}\n"

need_git=1
need_py=1
command -v git    >/dev/null 2>&1 && need_git=0
command -v python3 >/dev/null 2>&1 && need_py=0

OS="$(uname -s)"
if [ "$need_git" = 1 ] || [ "$need_py" = 1 ]; then
  printf "${c_dim}missing: %s%s%s\n${c_rst}" \
    "$( [ $need_git = 1 ] && echo 'git ')" \
    "$( [ $need_py  = 1 ] && echo 'python3 ')"
  if [ "$OS" = "Linux" ] && command -v apt-get >/dev/null 2>&1; then
    echo "→ run:  sudo apt-get install -y git python3 python3-pip"
  elif [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    echo "→ run:  brew install git python"
  fi
  exit 2
fi

mkdir -p "$DIR"
if [ ! -d "$DIR/.git" ]; then
  printf "→ cloning into ${DIR}\n"
  git clone --branch "$REPO_BRANCH" --depth 1 "$REPO_URL" "$DIR"
else
  printf "→ updating existing checkout in ${DIR}\n"
  (cd "$DIR" && git fetch --all --prune && git checkout "$REPO_BRANCH" && git pull --rebase --autostash) || true
fi

GUI_DIR="$DIR/aedi-sight-gui"
if [ ! -d "$GUI_DIR" ]; then
  echo "ERROR: $GUI_DIR not found in repo. Stopping."; exit 3
fi
chmod +x "$GUI_DIR/launch.sh" 2>/dev/null || true

printf "→ installing Python deps\n"
python3 -m pip install --user --break-system-packages \
  aiohttp websockets pyserial esptool esp_idf_nvs_partition_gen scipy numpy \
  >/tmp/aedi-pip.log 2>&1 || {
    echo "pip install failed:"; tail -20 /tmp/aedi-pip.log; exit 4;
  }

# Shim on $PATH so the user can type 'aedi-sight' from anywhere.
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/aedi-sight" <<EOF
#!/usr/bin/env bash
exec "$GUI_DIR/launch.sh" "\$@"
EOF
chmod +x "$HOME/.local/bin/aedi-sight"

# Linux .desktop entry — only if a graphical session looks plausible.
if [ "$HEADLESS" = 0 ] && [ "$OS" = "Linux" ] && [ -d "$HOME/.local/share/applications" -o -w "$HOME/.local/share" ]; then
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
fi

printf "\n${c_blue}done.${c_rst}\n"
printf "  start ·  ${c_blue}aedi-sight${c_rst}    (or:  ${GUI_DIR}/launch.sh)\n"
printf "  ui    ·  http://localhost:8088\n"
printf "  udp   ·  0.0.0.0:5005 (ADR-018 CSI ingest)\n"
printf "${c_dim}  pass --headless to skip the desktop entry on Linux.\n${c_rst}"
