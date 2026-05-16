"""ESP32 self-healing watchdog.

Per-node heartbeat tracker. For each node we've ever seen, we keep last_seen
plus its source IP (from the UDP socket). Every `tick_period_s` we walk the
table and:

  * mark nodes that haven't sent a frame in > stale_s as **stale**
  * mark nodes that haven't sent in > lost_s as **lost**
  * if `auto_heal` is on, attempt a recovery probe:
      - GET http://<node_ip>:8032/ota/status   (firmware OTA HTTP server)
      - if it responds, log it
      - if `force_reflash` is set and it's been lost > heal_after_s, optionally
        POST /api/ota/reset to nudge the firmware to reboot
      The actual OTA upload is gated behind a UI confirmation — we don't
      reflash silently.

Everything is reported on the WS bus on topic 'fleet' (status changes) and
'log' (info/warn lines). The Provision tab's fleet table already subscribes.
"""
from __future__ import annotations
import asyncio, time, logging, json
from typing import Dict, Optional, Tuple

from .wsbus import WsBus
from .sink import UdpSink

log = logging.getLogger("aedi.esp_watchdog")


class EspWatchdog:
    def __init__(self, bus: WsBus, sink: UdpSink,
                 tick_period_s: float = 2.0,
                 stale_s: float = 8.0,
                 lost_s: float = 30.0,
                 heal_after_s: float = 90.0,
                 auto_heal: bool = True):
        self.bus = bus
        self.sink = sink
        self.tick_period_s = tick_period_s
        self.stale_s = stale_s
        self.lost_s = lost_s
        self.heal_after_s = heal_after_s
        self.auto_heal = auto_heal
        self._state: Dict[int, str] = {}      # node_id -> 'live'|'stale'|'lost'
        self._lost_at: Dict[int, float] = {}
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop(), name="esp_watchdog")
        log.info("ESP watchdog started (stale=%.0fs lost=%.0fs heal_after=%.0fs auto_heal=%s)",
                 self.stale_s, self.lost_s, self.heal_after_s, self.auto_heal)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try: await self._task
            except Exception: pass
            self._task = None

    async def _loop(self) -> None:
        while self._running:
            try:
                self._tick()
            except Exception as e:
                log.warning("watchdog tick error: %s", e)
            await asyncio.sleep(self.tick_period_s)

    def _tick(self) -> None:
        now = time.time()
        for nid, st in self.sink.nodes.items():
            dt = now - st.last_seen
            if dt < self.stale_s:
                new = "live"
            elif dt < self.lost_s:
                new = "stale"
            else:
                new = "lost"
            prev = self._state.get(nid)
            if new != prev:
                self._state[nid] = new
                if new == "lost":
                    self._lost_at[nid] = now
                    self._emit_log("warn", f"node {nid} LOST — no frames in {dt:.0f}s, last src {st.source}")
                elif new == "stale":
                    self._emit_log("warn", f"node {nid} stale — last frame {dt:.1f}s ago")
                else:
                    self._lost_at.pop(nid, None)
                    self._emit_log("info", f"node {nid} back live")
                self.bus.publish("fleet", {
                    "node_id": nid, "status": new, "last_seen": st.last_seen,
                    "rssi": st.rssi, "source": st.source,
                })
            # Heal: only after a node has been lost long enough.
            if new == "lost" and self.auto_heal:
                lost_for = now - self._lost_at.get(nid, now)
                if lost_for > self.heal_after_s and lost_for < self.heal_after_s + self.tick_period_s:
                    asyncio.create_task(self._heal(nid, st.source))

    async def _heal(self, nid: int, source: str) -> None:
        """Best-effort, non-destructive recovery — only checks the OTA endpoint.

        Actual reflash requires a user click in the GUI (POST /api/ota/reflash).
        """
        ip = (source or "").split(":")[0] if source else None
        if not ip:
            self._emit_log("warn", f"node {nid}: cannot heal — no source IP")
            return
        url = f"http://{ip}:8032/ota/status"
        try:
            import aiohttp
            async with aiohttp.ClientSession() as s:
                async with s.get(url, timeout=aiohttp.ClientTimeout(total=4)) as r:
                    body = await r.text()
                    self._emit_log("info", f"node {nid} OTA endpoint reachable @ {ip}:8032 — {body[:120]}")
        except Exception as e:
            self._emit_log("warn", f"node {nid} unreachable on :8032 ({e}) — power cycle suggested")

    def _emit_log(self, cls: str, line: str) -> None:
        self.bus.publish("log", {"line": line, "cls": cls})

    def snapshot(self) -> dict:
        return {
            "tick_period_s": self.tick_period_s,
            "stale_s": self.stale_s,
            "lost_s": self.lost_s,
            "heal_after_s": self.heal_after_s,
            "auto_heal": self.auto_heal,
            "state": {str(nid): s for nid, s in self._state.items()},
        }
