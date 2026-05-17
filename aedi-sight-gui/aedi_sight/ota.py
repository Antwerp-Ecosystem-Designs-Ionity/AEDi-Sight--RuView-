"""OTA reflash helper — posts the prebuilt `esp32-csi-node.bin` to a
running node's `POST http://<ip>:8032/ota` endpoint.

This is destructive (replaces firmware), so the GUI gates it behind an
explicit user click + a node-id + IP from the watchdog. We do not do
silent reflashes — `auto_heal` in the watchdog is read-only.
"""
from __future__ import annotations
import asyncio, ipaddress, logging, time
from pathlib import Path

import aiohttp

from .config import SETTINGS
from .wsbus import WsBus

log = logging.getLogger("aedi.ota")


def firmware_path(variant: str = "8mb") -> Path:
    if variant == "4mb":
        return SETTINGS.release_bins / "esp32-csi-node-4mb.bin"
    return SETTINGS.release_bins / "esp32-csi-node.bin"


def _validate_lan_ip(ip: str) -> ipaddress.IPv4Address | None:
    """Accept only a literal IPv4 address inside a private/link-local subnet
    (RFC1918 / 169.254.0.0/16). Returns the parsed address on success, None
    otherwise. SSRF guard — we never resolve hostnames or follow redirects,
    so an attacker controlling `ip` can't pivot to arbitrary remote hosts.
    """
    try:
        addr = ipaddress.IPv4Address(ip.strip())
    except (ipaddress.AddressValueError, ValueError):
        return None
    if not (addr.is_private or addr.is_link_local):
        return None
    if addr.is_loopback or addr.is_multicast or addr.is_unspecified or addr.is_reserved:
        return None
    return addr


async def reflash(bus: WsBus, ip: str, port: int = 8032, variant: str = "8mb",
                  timeout_s: float = 60.0) -> dict:
    """POST the prebuilt application firmware to <ip>:<port>/ota.
    Returns a dict with rc / message / bytes_sent for the caller.
    Streams progress messages on the WS bus on topic 'log'.

    Hardened against SSRF: `ip` must be a literal IPv4 address in a private
    or link-local subnet (the only places real ESP32 nodes ever live).
    Hostnames and public addresses are rejected before any request fires.
    """
    addr = _validate_lan_ip(ip)
    if addr is None:
        msg = f"OTA: refused — '{ip}' is not a private/link-local IPv4 (RFC1918 / 169.254/16)"
        bus.publish("log", {"line": msg, "cls": "err"})
        return {"rc": 3, "error": msg}
    if not (1 <= int(port) <= 65535):
        msg = f"OTA: invalid port {port}"
        bus.publish("log", {"line": msg, "cls": "err"})
        return {"rc": 3, "error": msg}
    if variant not in ("8mb", "4mb"):
        msg = f"OTA: unknown variant {variant!r}"
        bus.publish("log", {"line": msg, "cls": "err"})
        return {"rc": 3, "error": msg}

    fw = firmware_path(variant)
    if not fw.exists():
        msg = f"OTA: firmware not found at {fw}"
        bus.publish("log", {"line": msg, "cls": "err"})
        return {"rc": 2, "error": msg}

    url = f"http://{addr}:{int(port)}/ota"
    size = fw.stat().st_size
    bus.publish("log", {"line": f"OTA → {url} :: {fw.name} ({size:,} B)", "cls": "info"})
    started = time.time()
    try:
        timeout = aiohttp.ClientTimeout(total=timeout_s)
        data = fw.read_bytes()
        # allow_redirects=False keeps an attacker from bouncing through 30x
        # to anywhere unexpected even though we already pinned to a literal
        # private IPv4 above.
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.post(url, data=data,
                              allow_redirects=False,
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
