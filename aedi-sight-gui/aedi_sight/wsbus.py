"""Server-side WebSocket bus — multiplexes all topics onto /ws.

All publish() calls fan out to every connected client. Consumers filter by topic.
"""
from __future__ import annotations
import asyncio, json, logging
from typing import Any
from aiohttp import web, WSMsgType

log = logging.getLogger("aedi.wsbus")


class WsBus:
    """Server-side fan-out bus.

    aiohttp's `WebSocketResponse.send_str` is **not** safe under concurrent
    callers — overlapping writes raise `RuntimeError: Concurrent call to
    send_*`. We give every attached client its own `asyncio.Lock` so a publish
    burst serialises per-socket while still fanning out across sockets in
    parallel.
    """
    def __init__(self) -> None:
        self._clients: dict[web.WebSocketResponse, asyncio.Lock] = {}

    async def attach(self, ws: web.WebSocketResponse) -> None:
        self._clients[ws] = asyncio.Lock()
        log.debug("ws attach (now %d)", len(self._clients))

    async def detach(self, ws: web.WebSocketResponse) -> None:
        self._clients.pop(ws, None)
        log.debug("ws detach (now %d)", len(self._clients))

    @property
    def count(self) -> int:
        return len(self._clients)

    def publish(self, topic: str, data: Any) -> None:
        """Fire-and-forget publish. Failed sends drop the client on next attempt."""
        payload = json.dumps({"topic": topic, "data": data}, separators=(",", ":"))
        for ws, lock in list(self._clients.items()):
            if ws.closed:
                self._clients.pop(ws, None)
                continue
            asyncio.create_task(self._safe_send(ws, lock, payload))

    async def _safe_send(self, ws: web.WebSocketResponse,
                         lock: asyncio.Lock, payload: str) -> None:
        # The per-client lock serialises send_str on this socket so concurrent
        # publish() calls can't race each other into aiohttp's single writer.
        try:
            async with lock:
                if ws.closed:
                    self._clients.pop(ws, None); return
                await ws.send_str(payload)
        except Exception:
            self._clients.pop(ws, None)


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
