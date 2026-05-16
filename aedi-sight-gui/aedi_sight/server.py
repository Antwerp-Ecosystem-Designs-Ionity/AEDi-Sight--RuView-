"""AEDi-Sight RuView — aiohttp server.

One process binds:
  * HTTP  (default :8088) — UI + REST API + /ws WebSocket multiplex
  * UDP   (default :5005) — ADR-018 CSI ingest

Routes (all under HTTP port):
  GET  /                      → index.html
  GET  /static/*              → static assets
  GET  /api/status            → JSON {host_ip, host_ssid, sink, ...}
  GET  /api/serial-ports      → list available USB serial ports
  POST /api/provision         → submit a provision job (returns job_id)
  POST /api/sink/{start,stop,reset}
  GET  /api/sink/stats
  GET  /api/fleet
  GET  /api/ml/models
  POST /api/ml/job            → {"job":"contrastive"|"pose"|"benchmark"}
  POST /api/ml/infer/{start,stop}
  POST /api/chat              → {"text":"..."}
  GET  /api/logs/recent
  GET  /api/git/status
  POST /api/git/{pull,fetch,log}
  GET  /api/changelog
  GET  /api/tools
  POST /api/tools/run         → {"id":"<tool-id>"}
  GET  /ws                    → WebSocket multiplex
"""
from __future__ import annotations
import asyncio, json, logging, time
from aiohttp import web
from pathlib import Path

from . import __version__
from .config  import SETTINGS, host_ip, host_ssid, host_channel
from .wsbus   import WsBus, ws_handler
from .sink    import UdpSink
from .jobs    import JobRunner
from .provision import build_spec as build_prov_spec, list_serial_ports
from .chat    import handle as chat_handle
from . import gitops, ml, tools
from .logbridge import BusHandler
from .local_ml import LocalML
from .esp_watchdog import EspWatchdog
from .vitals import Vitals
from . import state, ota, chat_stream

log = logging.getLogger("aedi.server")
STARTED = time.time()


# ─── HTTP handlers ──────────────────────────────────────────────────────────

async def index(_request: web.Request) -> web.Response:
    p = SETTINGS.template_dir / "index.html"
    return web.Response(body=p.read_bytes(), content_type="text/html",
                        headers={"Cache-Control": "no-cache"})


async def api_status(request: web.Request) -> web.Response:
    sink: UdpSink = request.app["sink"]
    bus: WsBus    = request.app["bus"]
    stats = sink.stats(ws_clients=bus.count)
    # Rough fps = sum of per-node rates
    fps = sum((n.get("rate", 0.0) for n in stats["nodes"].values()), 0.0)
    ports = list_serial_ports()
    return web.json_response({
        "version":         __version__,
        "uptime_s":        time.time() - STARTED,
        "host_ip":         host_ip(),
        "host_ssid":       host_ssid(),
        "host_channel":    host_channel(),
        "sink_listening":  sink.running,
        "sink_bind":       stats["bind"],
        "sink_total":      stats["total"],
        "sink_fps":        round(fps, 2),
        "ws_clients":      bus.count,
        "esp32_serial":    (ports[0]["device"] if ports else None),
        "nodes_seen":      len(stats["nodes"]),
    })


async def api_serial_ports(_request: web.Request) -> web.Response:
    return web.json_response(list_serial_ports())


async def api_provision(request: web.Request) -> web.Response:
    body = await request.json()
    spec, err = build_prov_spec(body)
    if err:
        return web.json_response({"error": err}, status=400)
    jid = request.app["jobs"].submit(spec)
    # Persist non-secret args so we can pre-fill the form on next visit.
    try:
        state.remember(int(body.get("node_id", -1)), body)
    except Exception:
        pass
    return web.json_response({"job_id": jid, "label": spec.label})


async def api_fleet_state(_request: web.Request) -> web.Response:
    """Return the persisted-args table (passwords stripped)."""
    return web.json_response({"nodes": state.all_nodes()})


async def api_fleet_forget(request: web.Request) -> web.Response:
    nid = int(request.match_info["nid"])
    state.forget(nid)
    return web.json_response({"forgot": nid})


async def api_ota_reflash(request: web.Request) -> web.Response:
    """Manually-triggered OTA reflash.

    POST { "ip": "<addr>", "variant": "8mb"|"4mb"  }   (variant optional)
    Returns the OTA result. Logs progress on WS topic 'log'.
    """
    body = await request.json()
    ip = (body or {}).get("ip", "").strip()
    variant = (body or {}).get("variant", "8mb")
    if not ip:
        return web.json_response({"error": "ip required"}, status=400)
    res = await ota.reflash(request.app["bus"], ip, variant=variant)
    return web.json_response(res, status=200 if res.get("rc", 1) == 0 else 502)


async def api_chat_stream(request: web.Request) -> web.Response:
    body = await request.json()
    prompt = (body or {}).get("text", "").strip()
    if not prompt:
        return web.json_response({"error": "text required"}, status=400)
    # Fire and forget — output streams via the 'chat' WS topic.
    asyncio.create_task(chat_stream.stream_chat(request.app["bus"], prompt))
    return web.json_response({"streaming": True, "prompt": prompt})


async def api_sink_op(request: web.Request) -> web.Response:
    op = request.match_info["op"]
    sink: UdpSink = request.app["sink"]
    if op == "start":
        if not sink.running:
            try:
                await sink.start()
            except OSError as e:
                return web.json_response({"error": str(e)}, status=409)
        return web.json_response({"bind": f"{sink.host}:{sink.port}", "running": True})
    if op == "stop":
        await sink.stop()
        return web.json_response({"running": False})
    if op == "reset":
        sink.reset()
        return web.json_response({"ok": True})
    return web.json_response({"error": "unknown op"}, status=404)


async def api_sink_stats(request: web.Request) -> web.Response:
    sink: UdpSink = request.app["sink"]
    bus: WsBus    = request.app["bus"]
    return web.json_response(sink.stats(ws_clients=bus.count))


async def api_fleet(request: web.Request) -> web.Response:
    sink: UdpSink = request.app["sink"]
    now = time.time()
    nodes = {}
    for i in range(8):
        st = sink.nodes.get(i)
        if not st:
            nodes[i] = {"node_id": i, "status": "absent", "last_seen": None, "rssi": None}
            continue
        dt = now - st.last_seen
        status = "live" if dt < 6 else ("stale" if dt < 60 else "lost")
        nodes[i] = {"node_id": i, "status": status,
                    "last_seen": st.last_seen, "rssi": st.rssi}
    return web.json_response({"nodes": nodes})


async def api_ml_models(_request: web.Request) -> web.Response:
    return web.json_response({"models": ml.list_models()})


async def api_ml_job(request: web.Request) -> web.Response:
    body = await request.json()
    spec = ml.job_spec(body.get("job", ""))
    if not spec:
        return web.json_response({"error": "unknown job"}, status=400)
    jid = request.app["jobs"].submit(spec)
    return web.json_response({"job_id": jid})


async def api_ml_infer(request: web.Request) -> web.Response:
    op = request.match_info["op"]
    local: LocalML = request.app["local_ml"]
    if op == "start":
        local.set_enabled(True)
    elif op == "stop":
        local.set_enabled(False)
    elif op == "reset":
        local.reset()
    else:
        return web.json_response({"error": "unknown op"}, status=404)
    return web.json_response({"enabled": local.enabled, "snapshot": local.snapshot()})


async def api_ml_snapshot(request: web.Request) -> web.Response:
    """One-shot snapshot of LocalML state — used by the ML tab for the table."""
    return web.json_response(request.app["local_ml"].snapshot())


async def api_watchdog_snapshot(request: web.Request) -> web.Response:
    return web.json_response(request.app["esp_watchdog"].snapshot())


async def api_chat(request: web.Request) -> web.Response:
    body = await request.json()
    text = (body or {}).get("text", "")
    res = chat_handle(text)
    return web.json_response(res)


async def api_logs_recent(request: web.Request) -> web.Response:
    h: BusHandler = request.app["log_handler"]
    return web.json_response({"lines": h.recent(400)})


async def api_git(request: web.Request) -> web.Response:
    op = request.match_info["op"]
    if op == "status":
        return web.json_response(gitops.status())
    if op == "pull":
        return web.json_response(gitops.pull())
    if op == "fetch":
        return web.json_response(gitops.fetch())
    if op == "log":
        return web.json_response(gitops.log(10))
    return web.json_response({"error": "unknown op"}, status=404)


async def api_changelog(_request: web.Request) -> web.Response:
    return web.json_response(gitops.changelog())


async def api_tools_list(_request: web.Request) -> web.Response:
    return web.json_response({"groups": tools.public_groups()})


async def api_tools_run(request: web.Request) -> web.Response:
    body = await request.json()
    spec = tools.spec_for(body.get("id", ""))
    if not spec:
        return web.json_response({"error": "unknown tool id"}, status=404)
    jid = request.app["jobs"].submit(spec)
    return web.json_response({"job_id": jid})


# ─── app wiring ─────────────────────────────────────────────────────────────

def build_app() -> web.Application:
    SETTINGS.ensure_dirs()
    bus = WsBus()
    sink = UdpSink(bus, host=SETTINGS.udp_host, port=SETTINGS.udp_port)
    jobs = JobRunner(bus)

    # Logging → bus + file
    handler = BusHandler(bus)
    handler.setFormatter(logging.Formatter("%(message)s"))
    handler.setLevel(logging.INFO)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    if SETTINGS.log_path.parent.exists():
        try:
            fh = logging.FileHandler(SETTINGS.log_path)
            fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)-5s %(name)s · %(message)s"))
            root.addHandler(fh)
        except Exception:
            pass

    local_ml = LocalML(bus)
    sink.add_consumer(local_ml.on_csi)
    vitals_  = Vitals(bus)
    if vitals_.enabled:
        sink.add_consumer(vitals_.on_csi)
    watchdog = EspWatchdog(bus, sink)

    app = web.Application(client_max_size=4 << 20)
    app["bus"] = bus
    app["sink"] = sink
    app["jobs"] = jobs
    app["log_handler"] = handler
    app["local_ml"] = local_ml
    app["vitals"] = vitals_
    app["esp_watchdog"] = watchdog

    app.add_routes([
        web.get("/",                       index),
        web.get("/index.html",             index),
        web.get("/api/status",             api_status),
        web.get("/api/serial-ports",       api_serial_ports),
        web.post("/api/provision",         api_provision),
        web.post("/api/sink/{op}",         api_sink_op),
        web.get("/api/sink/stats",         api_sink_stats),
        web.get("/api/fleet",              api_fleet),
        web.get("/api/ml/models",          api_ml_models),
        web.post("/api/ml/job",            api_ml_job),
        web.post("/api/ml/infer/{op}",     api_ml_infer),
        web.get("/api/ml/snapshot",        api_ml_snapshot),
        web.get("/api/watchdog/snapshot",  api_watchdog_snapshot),
        web.get("/api/fleet/state",        api_fleet_state),
        web.post("/api/fleet/forget/{nid}", api_fleet_forget),
        web.post("/api/ota/reflash",       api_ota_reflash),
        web.post("/api/chat/stream",       api_chat_stream),
        web.post("/api/chat",              api_chat),
        web.get("/api/logs/recent",        api_logs_recent),
        web.get("/api/git/status",         lambda r: api_git_status_passthrough(r)),
        web.post("/api/git/{op}",          api_git),
        web.get("/api/changelog",          api_changelog),
        web.get("/api/tools",              api_tools_list),
        web.post("/api/tools/run",         api_tools_run),
        web.get("/ws",                     ws_handler),
        web.static("/static",              str(SETTINGS.static_dir), show_index=False),
    ])

    async def on_startup(app):
        try:
            await sink.start()
        except OSError as e:
            log.warning("sink start failed: %s — start it from the Sink tab.", e)
        try:
            await watchdog.start()
        except Exception as e:
            log.warning("watchdog start failed: %s", e)

    async def on_cleanup(app):
        try: await watchdog.stop()
        except Exception: pass
        try: await sink.stop()
        except Exception: pass

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


# Helper so /api/git/status maps to the same handler.
async def api_git_status_passthrough(request: web.Request) -> web.Response:
    request.match_info["op"] = "status"
    return await api_git(request)


def serve(host: str | None = None, port: int | None = None) -> None:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)-5s %(name)s · %(message)s")
    web.run_app(build_app(),
                host=host or SETTINGS.host,
                port=port or SETTINGS.port,
                print=lambda *_a, **_k: None,
                handle_signals=True)
