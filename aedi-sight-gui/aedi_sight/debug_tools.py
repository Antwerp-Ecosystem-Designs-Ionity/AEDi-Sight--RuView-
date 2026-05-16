"""Debug tab backend — ESP32 serial monitor + NVS dump.

The serial monitor runs in a background asyncio task that pumps every line
from `/dev/ttyACM*` (or a user-chosen port) onto WS topic 'serial'. A single
monitor at a time — starting a second call stops the first.

The NVS dump shells out to esptool to read the 24 KiB partition at 0x9000.
We hex-dump it and try to parse the known keys (ssid / target_ip / channel
/ node_id / tdm_slot / tdm_total) without depending on the ESP-IDF
nvs_partition_gen package's read mode.
"""
from __future__ import annotations
import asyncio, logging, struct, sys, time
from pathlib import Path
from typing import Optional

from .wsbus import WsBus
from .config import SETTINGS

log = logging.getLogger("aedi.debug")


class SerialMonitor:
    """One-at-a-time pyserial reader pumped into the WS bus."""
    def __init__(self, bus: WsBus):
        self.bus = bus
        self._task: Optional[asyncio.Task] = None
        self._port: Optional[str] = None
        self._baud: int = 115200

    @property
    def running(self) -> bool:
        return bool(self._task and not self._task.done())

    @property
    def port(self) -> Optional[str]:
        return self._port

    async def start(self, port: str, baud: int = 115200) -> dict:
        await self.stop()
        try:
            import serial
        except ImportError:
            return {"ok": False, "error": "pyserial not installed"}
        self._port = port
        self._baud = baud
        self._task = asyncio.create_task(self._loop(), name="serial_monitor")
        self.bus.publish("serial", {"line": f"--- monitor opened {port}@{baud} ---", "cls": "info"})
        return {"ok": True, "port": port, "baud": baud}

    async def stop(self) -> dict:
        if self._task:
            self._task.cancel()
            try: await self._task
            except Exception: pass
        self._task = None
        if self._port:
            self.bus.publish("serial", {"line": f"--- monitor closed {self._port} ---", "cls": "info"})
            self._port = None
        return {"ok": True}

    async def _loop(self) -> None:
        import serial  # type: ignore
        loop = asyncio.get_running_loop()
        try:
            ser = await loop.run_in_executor(None, lambda: serial.Serial(self._port, self._baud, timeout=0.2))
        except Exception as e:
            self.bus.publish("serial", {"line": f"open {self._port} failed: {e}", "cls": "err"})
            return
        try:
            while True:
                # readline can block — push to a worker thread
                line = await loop.run_in_executor(None, ser.readline)
                if not line:
                    await asyncio.sleep(0.05); continue
                text = line.decode("utf-8", errors="replace").rstrip("\n").rstrip("\r")
                cls = "err" if (" E " in text) else "warn" if (" W " in text) else ""
                self.bus.publish("serial", {"line": text, "cls": cls})
        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.bus.publish("serial", {"line": f"monitor error: {e}", "cls": "err"})
        finally:
            try: ser.close()
            except Exception: pass


def nvs_dump_argv(port: str) -> list[str]:
    """esptool argv for reading the 24 KiB NVS partition into a file."""
    return [
        sys.executable, "-m", "esptool", "--chip", "esp32s3",
        "--port", port, "--baud", "460800",
        "read_flash", "0x9000", "0x6000", str(SETTINGS.state_dir / "nvs.bin"),
    ]


def _walk_nvs(buf: bytes) -> dict:
    """Crude NVS reader — scans for printable strings + tagged u8/u16/u32 fields.

    This won't beat the official esp_idf_nvs_partition_gen but is good enough
    for a UI confirm-it-stuck check: we look for the canonical key names we
    know we wrote and pull the value bytes that follow.
    """
    keys = ["ssid", "password", "target_ip", "target_port",
            "node_id", "tdm_slot", "tdm_nodes",
            "csi_channel", "edge_tier", "hop_count", "filter_mac"]
    out: dict = {}
    for k in keys:
        kb = k.encode()
        i = buf.find(kb)
        if i < 0:
            continue
        # NVS layout: <ns:u8><type:u8><span:u8><chunk:u8><key_pad:16><crc:u32><data:8>
        # The key sits at offset key_pad start. We can't fully parse — peek the next
        # 32 bytes and offer them as raw hex for the UI, plus a printable ASCII guess.
        chunk = buf[i: i + 32]
        try:
            ascii_guess = "".join(c if 32 <= ord(c) < 127 else "." for c in chunk.decode("latin1"))
        except Exception:
            ascii_guess = ""
        out[k] = {
            "offset": i,
            "raw_hex": chunk.hex(),
            "ascii":   ascii_guess,
        }
    return out


def parse_nvs_file(path: Path) -> dict:
    if not path.exists():
        return {"error": f"NVS file not found: {path}"}
    try:
        return {"size": path.stat().st_size, "keys": _walk_nvs(path.read_bytes())}
    except Exception as e:
        return {"error": str(e)}
