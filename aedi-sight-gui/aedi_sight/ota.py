"""OTA reflash helper — posts the prebuilt `esp32-csi-node.bin` to a
running node's `POST http://<ip>:8032/ota` endpoint.

This is destructive (replaces firmware), so the GUI gates it behind an
explicit user click + a node-id + IP from the watchdog. We do not do
silent reflashes — `auto_heal` in the watchdog is read-only.
"""
from __future__ import annotations
import asyncio, logging, time
from pathlib import Path

import aiohttp

from .config import SETTINGS
from .wsbus import WsBus

log = logging.getLogger("aedi.ota")


def firmware_path(variant: str = "8mb") -> Path:
    if variant == "4mb":
        return SETTINGS.release_bins / "esp32-csi-node-4mb.bin"
    return SETTINGS.release_bins / "esp32-csi-node.bin"


async def reflash(bus: WsBus, ip: str, port: int = 8032, variant: str = "8mb",
                  timeout_s: float = 60.0) -> dict:
    """POST the prebuilt application firmware to <ip>:<port>/ota.
    Returns a dict with rc / message / bytes_sent for the caller.
    Streams progress messages on the WS bus on topic 'log'.
    """
    fw = firmware_path(variant)
    if not fw.exists():
        msg = f"OTA: firmware not found at {fw}"
        bus.publish("log", {"line": msg, "cls": "err"})
        return {"rc": 2, "error": msg}

    url = f"http://{ip}:{port}/ota"
    size = fw.stat().st_size
    bus.publish("log", {"line": f"OTA → {url} :: {fw.name} ({size:,} B)", "cls": "info"})
    started = time.time()
    try:
        timeout = aiohttp.ClientTimeout(total=timeout_s)
        data = fw.read_bytes()
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.post(url, data=data,
                              headers={"Content-Type": "application/octet-stream"}) as r:
                body = await r.text()
                ok = (r.status == 200)
                line = f"OTA ← {r.status} in {time.time()-started:.1f}s — {body[:120]}"
                bus.publish("log", {"line": line, "cls": "ok" if ok else "err"})
                return {
                    "rc":         0 if ok else 1,
                    "http_status": r.status,
                    "bytes_sent": size,
                    "elapsed_s":  round(time.time() - started, 2),
                    "body":       body[:512],
                }
    except Exception as e:
        msg = f"OTA failed for {ip}: {e}"
        bus.publish("log", {"line": msg, "cls": "err"})
        return {"rc": 1, "error": msg}
