# AEDi-Sight RuView · IONITY edition

Cross-platform sensing console for the WiFi-CSI · ESP32-S3 TDMA mesh.

One process · React UI · WebSocket bus · UDP CSI ingest · ESP32 flash + provision · live ML + vitals · `claude-flow` chat · git updates. Linux / macOS / Windows. Theme: **blue · white · black**.

Author · **Johan Wilhelm van Antwerp** · [ionity.today](https://www.ionity.today) · [ionity.world](https://ionity.world)
Antwerp Designs · 2018 – 2026 · *All rights reserved · Policy 986 AED license · 900 / 990 AED · MIT where applies.*

Two front-ends ship in the same process:

- **React + TypeScript + Vite** (default) — sources in [`web/`](web/), built to `static/dist/`. Used by `aiohttp`'s `/` handler when present.
- **Vanilla JS modules** (fallback) — `static/js/` + `templates/index.html`. Used when Node/npm isn't available or the React build was skipped (`AEDI_SKIP_WEB_BUILD=1`).

---

## Quick start (Linux / macOS)

```bash
# 1. one-shot install (clones repo if missing, installs Python deps,
#    drops an `aedi-sight` shim on $PATH + a desktop entry)
curl -fsSL https://raw.githubusercontent.com/Antwerp-Ecosystem-Designs-Ionity/AEDi-Sight--RuView-/main/aedi-sight-gui/install.sh | bash
# or, if you already cloned the repo:
./aedi-sight-gui/install.sh

# 2. launch (always available afterwards)
aedi-sight
#  → web UI on http://localhost:8088
#  → UDP CSI ingest on 0.0.0.0:5005
#  → opens the browser automatically
```

## Quick start (Windows)

```powershell
# PowerShell, from anywhere:
powershell -ExecutionPolicy Bypass -File .\aedi-sight-gui\install.ps1
# then double-click the new Start-menu entry, or:
.\aedi-sight-gui\launch.bat
```

---

## What's in the console

| Tab          | What it does                                                                                  |
|--------------|------------------------------------------------------------------------------------------------|
| **Home**     | At-a-glance summary · quick-action buttons.                                                    |
| **Provision**| Form: port · SSID · password · sink IP · node id (0–7) · TDM slot · TDM total · channel · edge tier · MAC filter. Submits to the backend, which runs `python -m esptool` (optional) followed by `firmware/esp32-csi-node/provision.py`. Live log streams over the WS bus. |
| **Sink**     | Start / stop the in-process UDP listener on `:5005`. Per-node stats: source, frames, rate, RSSI, last seq, last seen. |
| **Visualizer**| CSI waterfall canvas. Modes: amplitude · phase · amp Δ. Filter by node id.                   |
| **ML**       | Lists local `.rvf` / `.onnx` / `.pt` models. Buttons for contrastive pretrain, pose head fine-tune, vital-sign benchmark. Falls back to deterministic stub jobs when the underlying scripts aren't present. |
| **Chat**     | Terminal. `/help`, `/ip`, `/ports`, `/fleet`, `/status`, `/git status`. Anything else is forwarded to `claude-flow` if installed (and `ANTHROPIC_API_KEY` is set). |
| **Tools**    | Whitelisted shell helpers (verify proof, list ports, git status, esptool read_mac…). Output streams into the Logs tab. |
| **Logs**     | Live tail of the app's combined log, plus history on tab activation.                           |
| **Updates**  | `git status` / `pull` / `fetch` / `log -n 10` · embedded `CHANGELOG.md` view.                 |
| **About**    | Author · license · stack.                                                                      |

## Provisioning, in detail

Each ESP32-S3 node holds two pieces of state:

1. **Firmware** — flash once per device (pre-built bins at `firmware/esp32-csi-node/release_bins/`). The form has a *"Also flash firmware"* checkbox for the very first time on a fresh chip.
2. **NVS config** — re-writable. The form maps 1:1 onto `firmware/esp32-csi-node/provision.py` flags. Re-running the NVS write **replaces the whole `csi_cfg` namespace** (issue #391), so the form always submits the full set.

**Mesh multiplex.** 8-node deployment = 8 TDM slots. Node *N* gets `node_id N`, `tdm_slot N`, `tdm_total 8`. In each ~4 ms slot one node transmits and seven receive; over a 30 ms cycle every node is both TX and RX. The Provisioning tab's *Plan fleet* button auto-suggests the next free `node_id` / `tdm_slot` by looking at the live fleet table.

## Front-end (React)

The default UI is a single-page React app under [`web/`](web/), bundled with Vite.

```bash
cd aedi-sight-gui/web
npm install --no-bin-links   # exFAT-safe; standard npm install on real filesystems
npm run build                # → ../static/dist/index.html + assets/
npm run dev                  # → http://localhost:5173 with /api + /ws proxied to :8088
```

The launcher (`launch.sh` / `install.sh`) runs the install + build automatically the first time it sees a missing `static/dist/`. Set `AEDI_SKIP_WEB_BUILD=1` to opt out and use the vanilla-JS UI instead. The server's `/` handler picks whichever is available, so iteration loops are: edit TSX → `npm run build` → reload.

Project layout under `web/`:

```
web/
├── index.html          # Vite entry — loads /src/main.tsx
├── package.json        # react 18 · react-dom · typescript · vite · @vitejs/plugin-react
├── tsconfig.json
├── vite.config.ts      # base: /static/dist/ · outDir: ../static/dist
└── src/
    ├── main.tsx        # createRoot(...).render(<App/>)
    ├── App.tsx         # shell · sidebar · tab routing · AppCtx provider
    ├── types.ts        # mirrors every server contract
    ├── hooks/
    │   ├── useWebSocket.ts   # topic-multiplexed /ws bus with auto-reconnect
    │   └── useApi.ts         # usePolled<T> + api<T>(method,url,body)
    ├── components/
    │   ├── Header.tsx        # gradient brand mark + status pills
    │   └── Intro.tsx         # Canvas radar sweep → mesh → core pulse → IONITY lock-in
    ├── lib/
    │   ├── icons.tsx         # 16 inline-SVG icons as JSX
    │   └── sparkline.tsx     # shared ring buffer + DPR canvas
    └── tabs/                 # 13 tabs: Home Provision Sink Visualizer MLVitals
                              #         Debug Chat Tools Libraries RuView Logs Updates About
```

## Architecture

```
┌──────────────┐    POST /api/provision    ┌──────────────────┐
│ Browser (JS) │────────────────────────▶  │ aiohttp server   │── subprocess ──▶ esptool / provision.py
│ tabbed SPA   │◀──── WebSocket /ws ────── │ + WsBus + Sink   │
└──────────────┘                            └────────▲─────────┘
                                                    │ UDP :5005 (ADR-018)
                                            ┌───────┴──────┐
                                            │ ESP32 mesh   │
                                            │ (8 nodes)    │
                                            └──────────────┘
```

- **Server** — single asyncio process. `aiohttp` for HTTP + WS multiplex. `asyncio` `DatagramProtocol` for the UDP ingest. Subprocess job runner streams stdout into the WS bus.
- **Frontend** — vanilla JS modules (no build step). Single WebSocket multiplexes topics: `csi`, `log`, `provision`, `fleet`, `ml`, `chat`, `git`.
- **Watchdog** — `--watchdog` flag respawns the server with backoff after any non-zero exit. Used by default in `launch.sh` / `launch.bat`.

## Endpoints

```
GET  /                      → index.html
GET  /static/*              → static
GET  /api/status            → host_ip / host_ssid / sink stats / version
GET  /api/serial-ports
POST /api/provision         → {port,ssid,password,target_ip,target_port,node_id,tdm_slot,tdm_total,channel?,filter_mac?,edge_tier?,flash_firmware?,firmware_variant?,dry_run?}
POST /api/sink/start|stop|reset
GET  /api/sink/stats        → per-node stats
GET  /api/fleet             → status for all 8 node ids
GET  /api/ml/models
POST /api/ml/job            → {"job":"contrastive"|"pose"|"benchmark"}
POST /api/chat              → {"text":"..."}
GET  /api/logs/recent
GET  /api/git/status
POST /api/git/pull|fetch|log
GET  /api/changelog
GET  /api/tools
POST /api/tools/run         → {"id":"<tool-id>"}
GET  /ws                    → WebSocket
```

## Self-maintenance

- **Watchdog.** `aedi-sight --watchdog` re-spawns on any crash, with 1.6× backoff capped at 30 s.
- **Self-update.** The Updates tab runs `git pull --rebase --autostash`. Restart the launcher to pick up new code.
- **Health.** `GET /api/status` is a single-call health probe (uptime · sink fps · ESP32 port · WS clients · nodes seen). Suitable for an external monitor.

## Licensing

- This sub-project is licensed under the **MIT License** *(file: [LICENSE](LICENSE))* with the addition of the **IONITY Policy 986 / 900 / 990 AED** clauses where they apply per the repo's overall licensing terms.
- © 2018 – 2026 · Antwerp Designs · Johan Wilhelm van Antwerp.
- Trademarks (IONITY, AEDi-Sight) remain with their owner.
