"""Server-side WebSocket bus — multiplexes all topics onto /ws.

All publish() calls fan out to every connected client. Consumers filter by topic.
"""
from __future__ import annotations
import asyncio, json, logging, weakref
from typing import Any, Set
from aiohttp import web, WSMsgType

log = logging.getLogger("aedi.wsbus")


class WsBus:
    def __init__(self) -> None:
        self._clients: Set[web.WebSocketResponse] = set()
        self._lock = asyncio.Lock()

    async def attach(self, ws: web.WebSocketResponse) -> None:
        self._clients.add(ws)
        log.debug("ws attach (now %d)", len(self._clients))

    async def detach(self, ws: web.WebSocketResponse) -> None:
        self._clients.discard(ws)
        log.debug("ws detach (now %d)", len(self._clients))

    @property
    def count(self) -> int:
        return len(self._clients)

    def publish(self, topic: str, data: Any) -> None:
        """Fire-and-forget publish. Failed sends are silently dropped + the
        socket is removed on next attempt."""
        payload = json.dumps({"topic": topic, "data": data}, separators=(",", ":"))
        dead = []
        for ws in list(self._clients):
            try:
                if ws.closed:
                    dead.append(ws); continue
                # send_str returns a coroutine; schedule it without awaiting.
                asyncio.create_task(self._safe_send(ws, payload))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)

    async def _safe_send(self, ws: web.WebSocketResponse, payload: str) -> None:
        try:
            await ws.send_str(payload)
        except Exception:
            self._clients.discard(ws)


async def ws_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(heartbeat=20.0, max_msg_size=4 << 20)
    await ws.prepare(request)
    bus: WsBus = request.app["bus"]
    await bus.attach(ws)
    # Greet the client so the JS can confirm the bus is alive.
    await ws.send_str('{"topic":"hello","data":{"ok":true}}')
    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                try:
                    obj = json.loads(msg.data)
                except Exception:
                    continue
                # The client can push to topics too; we just re-publish so other
                # tabs (or the watchdog) can react.
                t = obj.get("topic")
                if isinstance(t, str):
                    bus.publish(t, obj.get("data"))
            elif msg.type in (WSMsgType.CLOSED, WSMsgType.ERROR):
                break
    finally:
        await bus.detach(ws)
    return ws
