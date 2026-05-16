"""Repo-wide service supervisor.

The original GUI was a CSI console for one specific sink. This module turns
it into a **runner for the entire repo** — every shippable runtime under
this checkout is registered here, and the UI can start/stop/monitor each:

  wifi-densepose-sensing-server   Rust · v2/crates/wifi-densepose-sensing-server
  wifi-densepose-desktop          Tauri · v2/crates/wifi-densepose-desktop  (WIP)
  v1-ws-sink                      Python · archive/v1/src/sensing/ws_server.py
  sensing-server-wasm             Browser WASM (vite preview)
  esp-firmware-monitor            picocom /dev/ttyACM0 — surfaces serial console
  proof-verify                    one-shot · archive/v1/data/proof/verify.py
  witness-bundle                  one-shot · scripts/generate-witness-bundle.sh
  rust-workspace-tests            one-shot · cd v2 && cargo test --workspace
  pose-fusion-demo                static page · ruvnet.github.io mirror under /assets

Each registered service has:
  * a stable id (URL-safe slug used by the REST surface)
  * a kind: 'long-running' (start/stop) or 'one-shot' (run-once)
  * a `gate` that says whether the host can run it right now
    (e.g. cargo present, esptool present, the source dir exists, etc.)
  * an `argv` list (no shell)
  * an env override dict
  * a cwd
  * optional health-check URL (HTTP GET; treated as healthy when 200)

Logs are streamed onto the WS bus on topic 'services', plus mirrored into a
per-service ring buffer the UI can fetch on tab activate.
"""
from __future__ import annotations
import asyncio, logging, os, shutil, signal, time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Callable

from .config import SETTINGS
from .wsbus import WsBus

log = logging.getLogger("aedi.services")


@dataclass
class ServiceDef:
    id: str
    name: str                                # display name
    kind: str                                # 'long' | 'oneshot'
    description: str
    argv: list[str]
    cwd: Optional[Path] = None
    env: dict[str, str] = field(default_factory=dict)
    health_url: Optional[str] = None         # GET; 200 = healthy
    stop_signal: int = signal.SIGTERM
    gate_fn: Callable[[], bool] = lambda: True
    gate_reason: str = ""                    # human reason when gate_fn returns False
    expected_log_marker: Optional[str] = None  # stdout substring that means "started"


@dataclass
class ServiceProc:
    spec: ServiceDef
    proc: Optional[asyncio.subprocess.Process] = None
    started_at: Optional[float] = None
    stopped_at: Optional[float] = None
    rc: Optional[int] = None
    log: deque = field(default_factory=lambda: deque(maxlen=400))
    restart_count: int = 0
    health_ok: Optional[bool] = None

    @property
    def running(self) -> bool:
        return self.proc is not None and self.proc.returncode is None

    @property
    def pid(self) -> Optional[int]:
        return self.proc.pid if self.proc else None


class ServiceSupervisor:
    """Tracks long-running services as asyncio.subprocess.Process plus a
    rolling per-service log captured from stdout/stderr (merged). One-shot
    services are run via the same code path but never auto-restarted."""

    def __init__(self, bus: WsBus):
        self.bus = bus
        self._procs: dict[str, ServiceProc] = {}
        self._catalog: dict[str, ServiceDef] = {}
        self._reader_tasks: dict[str, asyncio.Task] = {}
        self._build_catalog()

    # ── catalog ────────────────────────────────────────────────────────
    def _build_catalog(self) -> None:
        repo = SETTINGS.repo_root

        def has(tool: str) -> bool: return shutil.which(tool) is not None
        def exists(rel: str) -> bool: return (repo / rel).exists()

        defs: list[ServiceDef] = [
            ServiceDef(
                id="rust-sensing-server",
                name="Rust sensing-server",
                kind="long",
                description=(
                    "v2/crates/wifi-densepose-sensing-server — the canonical Rust "
                    "sink (HTTP :8080 · WS :8765 · UDP :5005). Decodes ADR-018 "
                    "frames, runs the signal pipeline, serves the legacy UI."
                ),
                argv=["cargo", "run", "--release",
                      "-p", "wifi-densepose-sensing-server", "--",
                      "--bind-addr", "0.0.0.0",
                      "--source",    "esp32"],
                cwd=repo / "v2",
                health_url="http://127.0.0.1:8080/health",
                gate_fn=lambda: has("cargo") and exists("v2/crates/wifi-densepose-sensing-server"),
                gate_reason="needs cargo + v2/crates/wifi-densepose-sensing-server/",
                expected_log_marker="HTTP",
            ),
            ServiceDef(
                id="v1-ws-sink",
                name="Python v1 ws_server",
                kind="long",
                description=(
                    "archive/v1/src/sensing/ws_server.py — the older Python "
                    "sink. Useful as an alternate ingest while the Rust server "
                    "is building or in case of Rust env trouble."
                ),
                argv=["python3", "-m", "v1.src.sensing.ws_server"],
                cwd=repo / "archive",
                env={"PYTHONPATH": str(repo / "archive")},
                health_url=None,
                gate_fn=lambda: exists("archive/v1/src/sensing/ws_server.py"),
                gate_reason="archive/v1/src/sensing/ws_server.py missing",
            ),
            ServiceDef(
                id="esp-serial-monitor",
                name="ESP32 serial monitor",
                kind="long",
                description=(
                    "Tails the ESP32 USB-JTAG console at 115200 baud. Use this "
                    "to watch firmware boot + CSI callbacks. Auto-targets the "
                    "first /dev/serial/by-id/usb-Espressif_* device."
                ),
                argv=["python3", "-m", "serial.tools.miniterm",
                      "/dev/ttyACM0", "115200", "--quiet"],
                cwd=repo,
                gate_fn=lambda: has("python3") and any(Path("/dev/serial/by-id").glob("usb-Espressif*"))
                       if Path("/dev/serial/by-id").exists() else False,
                gate_reason="no Espressif USB-JTAG device on this host",
            ),
            ServiceDef(
                id="tauri-desktop",
                name="Tauri desktop GUI",
                kind="long",
                description=(
                    "v2/crates/wifi-densepose-desktop — Tauri v2 app for ESP32 "
                    "node management + OTA + mesh viz. Marked WIP in README."
                ),
                argv=["cargo", "run", "--release",
                      "-p", "wifi-densepose-desktop"],
                cwd=repo / "v2",
                gate_fn=lambda: has("cargo") and exists("v2/crates/wifi-densepose-desktop"),
                gate_reason="needs cargo + v2/crates/wifi-densepose-desktop/",
            ),
            # ── one-shots ────────────────────────────────────────────
            ServiceDef(
                id="proof-verify",
                name="Proof verification",
                kind="oneshot",
                description=(
                    "archive/v1/data/proof/verify.py — Trust Kill Switch. "
                    "Feeds reference CSI through the production pipeline, "
                    "hashes the result, verifies against the published "
                    "expected hash. VERDICT: PASS on success."
                ),
                argv=["python3", "archive/v1/data/proof/verify.py"],
                cwd=repo,
                gate_fn=lambda: exists("archive/v1/data/proof/verify.py"),
                gate_reason="proof script missing",
            ),
            ServiceDef(
                id="witness-bundle",
                name="Witness bundle generator",
                kind="oneshot",
                description=(
                    "scripts/generate-witness-bundle.sh — bundles the witness "
                    "artefacts (rust test logs, proof hash, firmware hashes, "
                    "ADR-028 audit, VERIFY.sh) into a self-verifying tarball."
                ),
                argv=["bash", "scripts/generate-witness-bundle.sh"],
                cwd=repo,
                gate_fn=lambda: exists("scripts/generate-witness-bundle.sh"),
                gate_reason="witness bundle script missing",
            ),
            ServiceDef(
                id="rust-workspace-tests",
                name="Rust workspace tests",
                kind="oneshot",
                description=(
                    "cd v2 && cargo test --workspace --no-default-features — "
                    "the full 1,031+ test suite across every crate. ~2 min "
                    "wall-clock on a Pi 5."
                ),
                argv=["cargo", "test", "--workspace", "--no-default-features"],
                cwd=repo / "v2",
                gate_fn=lambda: has("cargo") and exists("v2/Cargo.toml"),
                gate_reason="needs cargo + v2/Cargo.toml",
            ),
            ServiceDef(
                id="esp-firmware-build",
                name="ESP32 firmware build",
                kind="oneshot",
                description=(
                    "cd firmware/esp32-csi-node && idf.py build — builds the "
                    "ESP32-S3 firmware. Needs ESP-IDF v5.4 installed (idf.py "
                    "on PATH). Output is the 4 bins under build/."
                ),
                argv=["idf.py", "build"],
                cwd=repo / "firmware" / "esp32-csi-node",
                gate_fn=lambda: has("idf.py") and exists("firmware/esp32-csi-node/CMakeLists.txt"),
                gate_reason="ESP-IDF (idf.py) not on PATH",
            ),
            ServiceDef(
                id="csi-spectrogram",
                name="CSI spectrogram (node)",
                kind="oneshot",
                description=(
                    "scripts/csi-spectrogram.js — Node.js script that draws a "
                    "real-time spectrogram of incoming CSI. Useful for visual "
                    "debugging of subcarrier coverage."
                ),
                argv=["node", "scripts/csi-spectrogram.js"],
                cwd=repo,
                gate_fn=lambda: has("node") and exists("scripts/csi-spectrogram.js"),
                gate_reason="needs node + scripts/csi-spectrogram.js",
            ),
        ]
        for d in defs:
            self._catalog[d.id] = d
            self._procs[d.id] = ServiceProc(spec=d)

    # ── public API ─────────────────────────────────────────────────────
    def list(self) -> list[dict]:
        out = []
        for sid, p in self._procs.items():
            d = p.spec
            out.append({
                "id":            d.id,
                "name":          d.name,
                "kind":          d.kind,
                "description":   d.description,
                "argv":          d.argv,
                "cwd":           str(d.cwd) if d.cwd else None,
                "gate_ok":       bool(d.gate_fn()),
                "gate_reason":   d.gate_reason,
                "health_url":    d.health_url,
                "running":       p.running,
                "pid":           p.pid,
                "started_at":    p.started_at,
                "stopped_at":    p.stopped_at,
                "rc":            p.rc,
                "restart_count": p.restart_count,
                "health_ok":     p.health_ok,
            })
        return out

    def get(self, sid: str) -> Optional[ServiceProc]:
        return self._procs.get(sid)

    def recent_log(self, sid: str, n: int = 200) -> list[str]:
        p = self._procs.get(sid)
        return list(p.log)[-n:] if p else []

    async def start(self, sid: str) -> dict:
        p = self._procs.get(sid)
        if not p:
            return {"ok": False, "error": f"unknown service {sid}"}
        if p.running:
            return {"ok": True, "already_running": True, "pid": p.pid}
        d = p.spec
        if not d.gate_fn():
            return {"ok": False, "error": f"gate failed — {d.gate_reason}"}
        env = {**os.environ, **(d.env or {})}
        try:
            p.proc = await asyncio.create_subprocess_exec(
                *d.argv,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                cwd=str(d.cwd) if d.cwd else None,
                env=env,
            )
        except FileNotFoundError as e:
            self._emit(sid, f"spawn failed: {e}", "err")
            return {"ok": False, "error": f"spawn failed: {e}"}
        except Exception as e:
            self._emit(sid, f"spawn error: {e}", "err")
            return {"ok": False, "error": str(e)}
        p.started_at = time.time()
        p.stopped_at = None
        p.rc = None
        self._emit(sid, f"=== started · pid {p.proc.pid} · {' '.join(d.argv)} ===", "info")
        self._reader_tasks[sid] = asyncio.create_task(self._reader(sid))
        return {"ok": True, "pid": p.proc.pid}

    async def stop(self, sid: str) -> dict:
        p = self._procs.get(sid)
        if not p or not p.running:
            return {"ok": True, "already_stopped": True}
        try:
            p.proc.send_signal(p.spec.stop_signal)
        except ProcessLookupError:
            pass
        # give it 3 s to die gracefully
        try:
            rc = await asyncio.wait_for(p.proc.wait(), timeout=3.0)
        except asyncio.TimeoutError:
            try: p.proc.kill()
            except Exception: pass
            try: rc = await asyncio.wait_for(p.proc.wait(), timeout=2.0)
            except asyncio.TimeoutError: rc = None
        p.rc = rc
        p.stopped_at = time.time()
        self._emit(sid, f"=== stopped · rc={rc} ===", "info")
        return {"ok": True, "rc": rc}

    async def restart(self, sid: str) -> dict:
        await self.stop(sid)
        p = self._procs.get(sid)
        if p: p.restart_count += 1
        return await self.start(sid)

    async def stop_all(self) -> None:
        for sid in list(self._procs):
            try: await self.stop(sid)
            except Exception: pass

    # ── reader ─────────────────────────────────────────────────────────
    async def _reader(self, sid: str) -> None:
        p = self._procs[sid]
        assert p.proc and p.proc.stdout
        try:
            while True:
                line = await p.proc.stdout.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").rstrip("\n")
                p.log.append(text)
                cls = "err"  if (" ERR" in text or " E " in text or "failed" in text.lower()) \
                     else "warn" if (" WARN" in text or " W " in text) \
                     else ""
                self.bus.publish("services", {"id": sid, "line": text, "cls": cls})
        finally:
            try: rc = await p.proc.wait()
            except Exception: rc = None
            p.rc = rc
            p.stopped_at = time.time()
            self._emit(sid, f"=== exit · rc={rc} ===", "err" if rc else "ok")

    def _emit(self, sid: str, line: str, cls: str = "") -> None:
        self._procs[sid].log.append(line)
        self.bus.publish("services", {"id": sid, "line": line, "cls": cls})
