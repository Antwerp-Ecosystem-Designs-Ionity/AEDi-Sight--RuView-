# Changelog — AEDi-Sight RuView · GUI

All notable changes to the cross-platform sensing console. The repo-wide
[CHANGELOG.md](../CHANGELOG.md) is the canonical source for everything else.

## [0.1.0] — 2026-05-16

### Added
- Cross-platform GUI console (`aedi-sight-gui/`) — Python · aiohttp · vanilla JS.
- **Tabs**: Home · Provision · Sink · Visualizer · ML · Chat · Tools · Logs · Updates · About.
- **Provision** tab + backend: wraps `python -m esptool ... write_flash` (optional) and `firmware/esp32-csi-node/provision.py`. Form covers SSID / password / sink IP / sink port / node-id 0–7 / TDM slot 0–7 / TDM total / channel / edge-tier / filter MAC. Auto-suggests the next free node-id by walking the fleet table.
- **Sink** — asyncio UDP listener on `:5005`. Decodes ADR-018 frames (magic `0xC5110001`, 20 B header). Per-node stats: source, frames, rate (rolling 5 s), RSSI, last seq, last seen.
- **Visualizer** — scrolling subcarrier waterfall in canvas. Amplitude · phase · amp Δ modes. Per-node filter.
- **ML** tab — lists local `.rvf`/`.onnx`/`.pt` models. Jobs: contrastive pretrain · pose head fine-tune · vital-sign benchmark (with deterministic stubs when the underlying scripts aren't checked in).
- **Chat** tab — terminal style. `/help`, `/ip`, `/ports`, `/fleet`, `/status`, `/git status`. Forwards to `claude-flow` CLI when present + `ANTHROPIC_API_KEY` is set.
- **Tools** tab — whitelisted helpers (verify proof, list ports, git status, esptool read_mac).
- **Logs** tab — live tail of the combined log via WS bus.
- **Updates** tab — `git status` / `pull --rebase --autostash` / `fetch` / `log -n 10` + embedded `CHANGELOG.md`.
- **Launcher scripts**: `launch.sh` (Linux/macOS), `launch.bat` + `launch.ps1` (Windows). Splash via `aedi_sight.ansi`. Self-installs missing pip deps.
- **Installer**: `install.sh` (Linux/macOS), `install.ps1` (Windows). Clones the repo, installs deps, drops a `~/.local/bin/aedi-sight` shim, writes a `.desktop` entry on Linux / Start-menu shortcut on Windows.
- **Watchdog** — `--watchdog` re-spawns the server with 1.6× backoff (cap 30 s) on any non-zero exit.
- **WS multiplex** — single `/ws` endpoint, topic-routed: `csi`, `log`, `provision`, `fleet`, `ml`, `chat`.
- **REST API** — see `README.md` (`/api/status`, `/api/provision`, `/api/sink/...`, `/api/fleet`, `/api/ml/...`, `/api/chat`, `/api/git/...`, `/api/changelog`, `/api/tools`).
- **Assets** — SVG favicon, SVG header mark, intro veil SVG (animated pulse).
- **Theme** — blue / white / black palette via CSS custom properties.
- **License** — MIT + IONITY Policy 986 / 900 / 990 AED addendum. Author: Johan Wilhelm van Antwerp.

### Known limitations
- The Tauri desktop provisioner under `v2/crates/wifi-densepose-desktop/` is unchanged — still WIP, and not on the Pi build path. The web GUI here is the supported cross-platform provisioner.
- `claude-flow` chat requires `ANTHROPIC_API_KEY` to actually call out. Without the env var the chat tab falls back to local `/commands` and a hint.
- The ML training jobs are stubs unless the corresponding scripts (`scripts/train_contrastive.py`, `scripts/train_pose.py`) are present.
- Linux: when run as a non-root user, the `aedi-sight` shim assumes `~/.local/bin` is on `$PATH` (most modern distros do this — otherwise add it to your shell rc).
