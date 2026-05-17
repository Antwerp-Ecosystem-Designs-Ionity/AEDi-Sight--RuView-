"""Logging handler that publishes records onto the WS bus on topic 'log'.

Also keeps an in-memory ring buffer so the Logs tab can show recent history on
load.
"""
from __future__ import annotations
import collections, logging, time
from typing import Deque
from .wsbus import WsBus


class BusHandler(logging.Handler):
    def __init__(self, bus: WsBus, ring_size: int = 1024):
        super().__init__()
        self.bus = bus
        self.ring: Deque[str] = collections.deque(maxlen=ring_size)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            ts = time.strftime("%H:%M:%S", time.localtime(record.created))
            level = record.levelname[:4]
            msg = record.getMessage()
            line = f"{ts} {level:<4} {record.name} · {msg}"
            self.ring.append(line)
            cls = {"ERR": "err", "WARN": "warn", "INFO": "info", "DEBU": ""}.get(level, "")
            self.bus.publish("log", {"line": line, "cls": cls})
        except Exception:
            pass

    def recent(self, n: int = 200) -> list[str]:
        return list(self.ring)[-n:]
