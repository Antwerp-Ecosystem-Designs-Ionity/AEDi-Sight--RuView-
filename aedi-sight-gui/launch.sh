#!/usr/bin/env bash
# AEDi-Sight RuView · Linux / macOS launcher
# - prints IONITY splash
# - resolves a working Python 3.10+
# - installs missing deps to the user site
# - starts the server with the watchdog
# - opens the browser
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

PY="${AEDI_PY:-}"
if [ -z "${PY}" ]; then
  for cand in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$cand" >/dev/null 2>&1; then PY="$cand"; break; fi
  done
fi
[ -n "${PY:-}" ] || { echo "python 3.10+ required"; exit 1; }

# Make sure user-installed scripts are on PATH (esptool is installed there).
export PATH="$HOME/.local/bin:$PATH"

# Optional auto-update on launch — `--auto-update` or `AEDI_AUTO_UPDATE=1`.
# Runs `git pull --rebase --autostash` from the repo root and re-execs the
# launcher *once* with --skip-auto-update so we don't loop on stuck refs.
case "${1:-}" in --auto-update) shift; AEDI_AUTO_UPDATE=1 ;; --skip-auto-update) shift; AEDI_AUTO_UPDATE=0 ;; esac
if [ "${AEDI_AUTO_UPDATE:-0}" = "1" ]; then
  REPO_ROOT="$(cd .. && pwd)"
  if [ -d "$REPO_ROOT/.git" ] && command -v git >/dev/null 2>&1; then
    echo "→ auto-update: git pull --rebase --autostash in $REPO_ROOT"
    if git -C "$REPO_ROOT" pull --rebase --autostash >/tmp/aedi-auto-update.log 2>&1; then
      echo "  ok — re-executing launcher"
      exec "$0" --skip-auto-update "$@"
    else
      echo "  auto-update failed (see /tmp/aedi-auto-update.log) — continuing with current checkout"
    fi
  else
    echo "  not a git checkout — skipping auto-update"
  fi
fi

# Splash via the package
PYTHONPATH="$PWD:${PYTHONPATH:-}" "$PY" -m aedi_sight.ansi || true

# Deps — installed to the user site (no sudo, no venv mandate).
# We keep this idempotent and quiet on success.
DEPS=(aiohttp websockets pyserial esptool esp_idf_nvs_partition_gen scipy numpy)
MISSING=()
for d in "${DEPS[@]}"; do
  "$PY" -c "import importlib, sys; sys.exit(0 if importlib.util.find_spec('${d/esp_idf_/esp_idf_}') else 1)" 2>/dev/null || MISSING+=("$d")
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "→ installing missing Python deps: ${MISSING[*]}"
  "$PY" -m pip install --user --break-system-packages "${MISSING[@]}" >/tmp/aedi-pip.log 2>&1 || {
    echo "pip install failed — see /tmp/aedi-pip.log"; tail -20 /tmp/aedi-pip.log; exit 2;
  }
fi

HOST="${AEDI_HOST:-0.0.0.0}"
PORT="${AEDI_PORT:-8088}"
EXTRA=()
if [ "${1:-}" = "--no-open" ]; then shift; else EXTRA+=(--open-browser); fi
if [ "${AEDI_WATCHDOG:-1}" = "1" ]; then EXTRA+=(--watchdog); fi

PYTHONPATH="$PWD:${PYTHONPATH:-}" exec "$PY" -m aedi_sight \
  --host "$HOST" --port "$PORT" --no-banner "${EXTRA[@]}" "$@"
