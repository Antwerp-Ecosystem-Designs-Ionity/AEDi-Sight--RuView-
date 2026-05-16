# AEDi-Sight RuView — IONITY console (`aedi-sight-gui`)

Cross-platform, single-process control surface for the WiFi-CSI · ESP32-S3
TDMA mesh. Source under [`aedi-sight-gui/`](../aedi-sight-gui/) in the repo root.

> Author · **Johan Wilhelm van Antwerp** · [ionity.today](https://www.ionity.today) · [ionity.world](https://ionity.world)
> Antwerp Designs · 2018 – 2026 · *All rights reserved · Policy 986 AED licence · 900 / 990 AED · MIT where applicable.*

---

## Purpose

`aedi-sight-gui` is the supported way to bring up the AEDi-Sight RuView stack
on a machine. It is one Python process that binds:

| Surface | Default | Used for |
|---|---|---|
| HTTP  | `:8088` | The React UI + REST API |
| WebSocket | `:8088 /ws` | Topic-multiplexed live bus (`csi`, `ml`, `vitals`, `fleet`, `serial`, `provision`, `log`, `chat`) |
| UDP | `:5005` | ADR-018 binary CSI frame ingest from ESP32 nodes |

There are two front-ends in the bundle, picked automatically:

1. **React 18 + TypeScript + Vite** (default) — source in
   [`aedi-sight-gui/web/`](../aedi-sight-gui/web/), bundled to
   `aedi-sight-gui/static/dist/`. Used whenever that `dist/index.html` exists.
2. **Vanilla JS modules** (fallback) — `aedi-sight-gui/static/js/` +
   `aedi-sight-gui/templates/index.html`. Used when Node/npm isn't installed
   or `AEDI_SKIP_WEB_BUILD=1` was set during launch.

Both UIs talk to the same Python backend; switching is a server-side decision
in [`server.py`'s `index()`](../aedi-sight-gui/aedi_sight/server.py) handler.

## Install + launch

```bash
# Linux / macOS — installer bootstraps git + python + Node where needed
./aedi-sight-gui/install.sh

# launcher (auto-builds the React app on first run if Node is present)
./aedi-sight-gui/launch.sh
#  → http://localhost:8088
#  → UDP CSI ingest on 0.0.0.0:5005
```

Windows users have [`launch.bat`](../aedi-sight-gui/launch.bat) and
[`install.ps1`](../aedi-sight-gui/install.ps1).

The repo also has a top-level [`./aedi-sight`](../aedi-sight) shim that just
calls `aedi-sight-gui/launch.sh`.

## Tabs

| Group | Tab | What it does |
|---|---|---|
| **OPERATE** | Overview | Hero with eyebrow chip + 4 live stat tiles (nodes live · sink fps · host IP · SSID) + four explainer cards. |
| | Provision | Flash + NVS form (port, SSID, password, sink IP/port, node_id 0–7, tdm_slot 0–7, tdm_total, channel, edge_tier, MAC filter). Auto-fills host context, pre-fills from persisted state, *Plan fleet* button picks the next free slot. Live job log via WS topic `provision`. |
| | Sink | UDP `:5005` listener controls + per-node table with inline rate / RSSI sparklines + per-row OTA `reflash` button (gated by `confirm()`). |
| | Visualizer | CSI subcarrier waterfall (amp / phase / amp-Δ) + canvas overlay showing per-node state badge + BR / HR. |
| | ML · Vitals | Live Mahalanobis σ table with state chips and per-node σ sparklines; BR / HR from `scipy.signal.welch`; inference start / stop / reset; train jobs (contrastive, pose, vital-sign bench). |
| | Debug | ESP32 serial monitor (live tail), NVS dump + parse (esptool `read_flash 0x9000 0x6000` → key heuristics), sink counters. |
| | Chat | Terminal style. `/help`, `/ip`, `/ports`, `/fleet`, `/status`, `/git status` work offline. Bare prompts stream through `claude-flow` when `ANTHROPIC_API_KEY` is set. |
| **EXPLORE** | Libraries | Auto-discovered SDK manifest — walks `v2/crates/`, `firmware/`, `vendor/`, `archive/v1/src/`, `dashboard/`, `ui/`, `plugins/ruview/`. Group filter + text search. Click a card → details with binaries / readme / path. |
| | RuView | The `plugins/ruview/` plugin surfaced as cards: 7 `/ruview-*` commands · skills · agents. Click any card → markdown viewer with the full spec. |
| | Tools | 60+ repo scripts grouped (Verification, Repo, ESP32, RuView, `scripts/`). Click a tool → modal with `--help` / source preview + a shlex-split args input. |
| **MANAGE** | Logs | Live tail of the combined app log via WS topic `log`, with history on tab activation. |
| | Updates | `git status` / `pull --rebase --autostash` / `fetch` / `log -n 10` + embedded `CHANGELOG.md` view. |
| | About | Author · license · stack. |

## API + WS contracts

REST (all under `:8088`):

```
GET  /                          → index.html (React dist or vanilla template)
GET  /static/*                  → static assets
GET  /api/status                → host_ip / host_ssid / sink stats / version
GET  /api/serial-ports
POST /api/provision             → {port,ssid,password,target_ip,target_port,node_id,
                                   tdm_slot,tdm_total,channel?,filter_mac?,edge_tier?,
                                   flash_firmware?,firmware_variant?,dry_run?}
POST /api/sink/{start,stop,reset}
GET  /api/sink/stats
GET  /api/fleet
GET  /api/fleet/state           POST /api/fleet/forget/{nid}
POST /api/ota/reflash           {ip, variant?}
POST /api/chat                  /api/chat/stream
GET  /api/ml/snapshot           POST /api/ml/infer/{start,stop,reset}
GET  /api/ml/models             POST /api/ml/job  {"job":"contrastive"|"pose"|"benchmark"}
GET  /api/watchdog/snapshot
GET  /api/libs                  GET /api/ruview   GET /api/ruview/file?path=…
POST /api/serial/{start,stop,status}
POST /api/nvs/dump              GET /api/nvs/parse
GET  /api/tools                 GET /api/tools/help?id=…    POST /api/tools/run
GET  /api/logs/recent
GET  /api/git/status            POST /api/git/{pull,fetch,log}
GET  /api/changelog
GET  /ws                        → WebSocket multiplex (JSON {topic,data})
```

WS topics: `csi`, `ml`, `vitals`, `fleet`, `serial`, `provision`, `log`, `chat`.

## Server modules

| File | Responsibility |
|---|---|
| [`aedi_sight/server.py`](../aedi-sight-gui/aedi_sight/server.py) | aiohttp app, route table, app-context wiring |
| [`aedi_sight/sink.py`](../aedi-sight-gui/aedi_sight/sink.py) | asyncio UDP listener, ADR-018 decoder, consumer fan-out, per-node stats |
| [`aedi_sight/local_ml.py`](../aedi-sight-gui/aedi_sight/local_ml.py) | Welford running stats + Mahalanobis motion score + hysteresis state machine |
| [`aedi_sight/vitals.py`](../aedi-sight-gui/aedi_sight/vitals.py) | `scipy.signal.welch` PSD on a rolling per-node amp buffer (BR + HR) |
| [`aedi_sight/esp_watchdog.py`](../aedi-sight-gui/aedi_sight/esp_watchdog.py) | Per-node heartbeat / stale-loss tracking · non-destructive OTA probe |
| [`aedi_sight/ota.py`](../aedi-sight-gui/aedi_sight/ota.py) | POSTs prebuilt firmware to `http://<node>:8032/ota` |
| [`aedi_sight/state.py`](../aedi-sight-gui/aedi_sight/state.py) | Per-node settings persistence at `var/fleet-state.json` (passwords stripped) |
| [`aedi_sight/provision.py`](../aedi-sight-gui/aedi_sight/provision.py) | Wraps `esptool` + `firmware/esp32-csi-node/provision.py` into JobSpecs |
| [`aedi_sight/debug_tools.py`](../aedi-sight-gui/aedi_sight/debug_tools.py) | Async serial monitor + NVS dump / parse |
| [`aedi_sight/chat.py`](../aedi-sight-gui/aedi_sight/chat.py) | Sync chat: local `/commands` + best-effort `claude-flow` round-trip |
| [`aedi_sight/chat_stream.py`](../aedi-sight-gui/aedi_sight/chat_stream.py) | Async streaming chat — pumps subprocess stdout onto WS `chat` |
| [`aedi_sight/libs.py`](../aedi-sight-gui/aedi_sight/libs.py) | SDK manifest — walks `v2/crates/`, `firmware/`, `vendor/`, `archive/v1/src/`, apps |
| [`aedi_sight/ruview.py`](../aedi-sight-gui/aedi_sight/ruview.py) | `plugins/ruview/{commands,skills,agents}/` parser |
| [`aedi_sight/tools.py`](../aedi-sight-gui/aedi_sight/tools.py) | Auto-discovered repo scripts + RuView commands |
| [`aedi_sight/gitops.py`](../aedi-sight-gui/aedi_sight/gitops.py) | `git status / pull / fetch / log` + CHANGELOG reader |
| [`aedi_sight/jobs.py`](../aedi-sight-gui/aedi_sight/jobs.py) | Async subprocess runner, stdout → WS bus |
| [`aedi_sight/wsbus.py`](../aedi-sight-gui/aedi_sight/wsbus.py) | Server-side fan-out bus |
| [`aedi_sight/logbridge.py`](../aedi-sight-gui/aedi_sight/logbridge.py) | `logging.Handler` that publishes to WS + keeps a ring buffer |
| [`aedi_sight/ansi.py`](../aedi-sight-gui/aedi_sight/ansi.py) | Terminal truecolor IONITY splash for the launcher |
| [`aedi_sight/__main__.py`](../aedi-sight-gui/aedi_sight/__main__.py) | Entry point with `--watchdog` supervised respawn |

## React app structure

```
aedi-sight-gui/web/
├── index.html              # Vite entry; loads /src/main.tsx
├── package.json            # react · react-dom · typescript · vite · @vitejs/plugin-react
├── tsconfig.json
├── vite.config.ts          # base /static/dist/ · outDir ../static/dist · /api + /ws proxy for `npm run dev`
└── src/
    ├── main.tsx
    ├── App.tsx             # AppCtx · sidebar · tab routing
    ├── types.ts            # mirrors every server contract
    ├── hooks/{useWebSocket.ts, useApi.ts}
    ├── components/{Header.tsx, Intro.tsx}
    ├── lib/{icons.tsx, sparkline.tsx}
    └── tabs/               # 13 .tsx files
```

## Self-healing

- **`--watchdog`** re-spawns the server on any non-zero exit with 1.6× backoff
  capped at 30 s. Enabled by default in `launch.sh` / `launch.bat`.
- **`launch.sh --auto-update`** runs `git pull --rebase --autostash` and
  re-execs once.
- **ESP32 watchdog** flags nodes that stop streaming as `stale` (> 8 s) →
  `lost` (> 30 s), and probes `http://<node>:8032/ota/status` after 90 s
  before suggesting a power cycle. The per-row `reflash` button in the
  Sink tab gates an actual OTA push behind a `confirm()`.

## CI

[`.github/workflows/aedi-sight-gui.yml`](../.github/workflows/aedi-sight-gui.yml)
runs on every push touching `aedi-sight-gui/`:

- Matrix: Ubuntu × macOS × Windows · Python 3.11 / 3.12.
- Byte-compile + import + ANSI splash smoke on every OS.
- Linux job additionally runs the full HTTP / WS / UDP end-to-end smoke:
  bind the server, inject a synthetic ADR-018 frame, verify the `csi` topic
  delivers via WebSocket.
- Shell launcher syntax checks on every OS.
