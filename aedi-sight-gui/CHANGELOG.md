# Changelog — AEDi-Sight RuView · GUI

All notable changes to the cross-platform sensing console. The repo-wide
[CHANGELOG.md](../CHANGELOG.md) is the canonical source for everything else.

## [0.5.0] — 2026-05-16 · React port

### Added
- **Full React 18 + TypeScript + Vite front-end** in [`web/`](web/), built to
  [`static/dist/`](static/dist/). The aiohttp `/` handler now prefers
  `static/dist/index.html` when present, falls back to the vanilla
  `templates/index.html` otherwise — both UIs share the same `/api/*` + `/ws`
  contracts and the same Python backend.
- **Hooks**:
  - `useWebSocket()` — topic-multiplexed `/ws` bus, typed `subscribe<T>` /
    `send`, auto-reconnect with exponential backoff.
  - `usePolled<T>(url, intervalMs, active)` — re-fetches on a timer; cleans
    up on unmount.
  - `api<T>(method, url, body?)` — typed one-shot REST helper.
- **Shared types** in [`web/src/types.ts`](web/src/types.ts) mirror every server
  contract: `Status`, `SinkStats`, `CsiFrame`, `VitalsPayload`, `MlSnapshot`,
  `LibsManifest`, `RuViewSnapshot`, `FleetSnapshot`, `SerialPort`, …
- **Components**:
  - `<Intro/>` — Canvas radar sweep + concentric rings + 8 mesh nodes lighting
    up + central core pulse + "IONITY" word lock-in + progress bar. 2.2 s
    sequence, fades out, then unmounts.
  - `<Header/>` — gradient brand mark + dual-line title + 5 labelled status
    pills (sink fps + dot, SSID, IP, version, WS state).
  - `<Sparkline channel="…"/>` — DPR-aware canvas with a shared per-key ring
    buffer; the gradient fill + last-point dot match the legacy vanilla look.
  - `<Icon.*/>` — 16 inline-SVG line icons as JSX components.
- **13 tabs** ported, all live-data backed (no simulation):
  Home · Provision · Sink · Visualizer · MLVitals · Debug · Chat · Libraries ·
  RuView · Tools · Logs · Updates · About.
  - **Provision**: form auto-fills SSID / IP / channel from host status,
    pulls per-node persisted args from `/api/fleet/state`, has a
    *Plan fleet* button that walks the live fleet table to pick the next
    free `node_id` / `tdm_slot`.
  - **Sink**: per-row inline rate + RSSI sparklines and a `confirm()`-gated
    OTA reflash button (POSTs to `<node-ip>:8032/ota`).
  - **MLVitals**: per-node Mahalanobis σ sparkline with stroke colour tied
    to state (green idle / amber moving / red spike), plus BR / HR columns
    from `scipy.signal.welch` output.
  - **Visualizer**: scrolling subcarrier waterfall in canvas, with a
    top-left overlay showing per-node state badge + BR / HR (repaints
    every 500 ms).
  - **Tools**: modal opens on every script with a `--help` / source
    preview pulled from `/api/tools/help?id=…` and a shlex-split args
    input before running.
  - **Debug**: live ESP32 serial monitor, NVS dump + parse, sink counters.
- **Launcher / installer auto-build**: `launch.sh` and `install.sh` run
  `npm install --no-bin-links` + `vite build` when Node/npm are present.
  `--no-bin-links` is mandatory on exFAT (no symlink support) and harmless
  on real filesystems. `AEDI_SKIP_WEB_BUILD=1` forces the vanilla path.
- **Vite dev server** proxies `/api` (HTTP) and `/ws` (WebSocket) to the
  Python backend on `:8088` — `cd web && npm run dev` gives you HMR while
  hitting the live UDP sink.

### Changed
- `aiohttp` `index` handler — picks `static/dist/index.html` first, then
  `templates/index.html`.
- Bundle output: **~199 KB JS / ~62 KB gzipped / 0.67 KB HTML** on the first
  build. Source map shipped alongside.

### Notes
- The vanilla JS modules in `static/js/*` are still on disk and still work;
  they're the off-by-default fallback for environments without Node.
- `web/node_modules/`, `web/dist/`, `static/dist/`, and `*.tsbuildinfo` are
  gitignored. The committed surface is sources only.

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
