"""In-process UDP sink for ADR-018 CSI frames.

Frame layout (little-endian, 20 B header + I/Q int8 payload):
    magic    u32   = 0xC5110001
    node_id  u8
    n_ant    u8
    n_sc     u16
    freq_hz  u32
    seq      u32
    rssi     i8     (signed; 0xff = -1)
    noise    i8
    pad      u16   (always 0)
    payload  int8 * (n_ant * n_sc * 2)   # I, Q interleaved
"""
from __future__ import annotations
import asyncio, math, struct, time, logging
from dataclasses import dataclass, field
from typing import Dict, Optional

from .wsbus import WsBus

log = logging.getLogger("aedi.sink")

MAGIC       = 0xC5110001
HEADER_FMT  = "<IBBHIIBB2x"      # 20 bytes
HEADER_SIZE = struct.calcsize(HEADER_FMT)


@dataclass
class NodeStats:
    frames: int = 0
    last_seq: Optional[int] = None
    last_seen: float = 0.0
    rssi: Optional[int] = None
    source: str = ""
    rate_window: list = field(default_factory=list)  # timestamps for fps calc


class UdpSink:
    """Asyncio UDP listener that decodes ADR-018 frames and publishes them on the
    WS bus. Keeps per-node stats; broadcast rate-limited to ~10 Hz so the bus
    doesn't melt for higher CSI rates."""
    def __init__(self, bus: WsBus, host: str = "0.0.0.0", port: int = 5005,
                 broadcast_hz: float = 10.0):
        self.bus = bus
        self.host = host
        self.port = port
        self._transport: Optional[asyncio.DatagramTransport] = None
        self._proto: Optional["_Proto"] = None
        self.broadcast_interval = 1.0 / broadcast_hz
        self._last_broadcast: Dict[int, float] = {}
        self.total = 0
        self.nodes: Dict[int, NodeStats] = {}
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        loop = asyncio.get_running_loop()
        self._proto = _Proto(self)
        try:
            self._transport, _ = await loop.create_datagram_endpoint(
                lambda: self._proto, local_addr=(self.host, self.port),
                reuse_port=False, allow_broadcast=True,
            )
            self._running = True
            log.info("UDP sink bound %s:%d", self.host, self.port)
        except OSError as e:
            log.warning("UDP sink bind failed: %s", e)
            raise

    async def stop(self) -> None:
        if self._transport:
            self._transport.close()
            self._transport = None
        self._running = False
        log.info("UDP sink stopped")

    @property
    def running(self) -> bool:
        return self._running

    def reset(self) -> None:
        self.total = 0
        self.nodes.clear()
        self._last_broadcast.clear()

    def stats(self, ws_clients: int = 0) -> dict:
        now = time.time()
        nodes = {}
        for nid, st in self.nodes.items():
            # rolling fps over last 5 s
            recent = [t for t in st.rate_window if (now - t) < 5.0]
            st.rate_window = recent[-200:]
            nodes[str(nid)] = {
                "source":    st.source,
                "frames":    st.frames,
                "rssi":      st.rssi,
                "last_seq":  st.last_seq,
                "last_seen": st.last_seen,
                "rate":      len(recent) / 5.0,
            }
        return {
            "bind":       f"{self.host}:{self.port}" if self._running else None,
            "total":      self.total,
            "nodes":      nodes,
            "last_seen":  max((s.last_seen for s in self.nodes.values()), default=0.0),
            "ws_clients": ws_clients,
        }

    # called by the asyncio protocol
    def _on_datagram(self, data: bytes, addr) -> None:
        if len(data) < HEADER_SIZE:
            return
        try:
            magic, nid, n_ant, n_sc, freq, seq, rssi_b, noise_b = struct.unpack_from(HEADER_FMT, data, 0)
        except struct.error:
            return
        if magic != MAGIC:
            return
        rssi  = rssi_b  - 256 if rssi_b  >= 128 else rssi_b
        noise = noise_b - 256 if noise_b >= 128 else noise_b

        st = self.nodes.setdefault(nid, NodeStats())
        st.frames += 1
        st.last_seq = seq
        st.last_seen = time.time()
        st.rssi = rssi
        st.source = f"{addr[0]}:{addr[1]}"
        st.rate_window.append(st.last_seen)
        self.total += 1

        last = self._last_broadcast.get(nid, 0.0)
        if (st.last_seen - last) < self.broadcast_interval:
            return
        self._last_broadcast[nid] = st.last_seen
        # Decode IQ → amplitude + phase (downsample by 1 — full subcarrier set is fine).
        iq_count = n_ant * n_sc
        need = HEADER_SIZE + iq_count * 2
        if len(data) < need:
            return
        iq = struct.unpack_from(f"<{iq_count*2}b", data, HEADER_SIZE)
        amps = [0.0] * iq_count
        phases = [0.0] * iq_count
        for k in range(iq_count):
            i = iq[2*k]; q = iq[2*k + 1]
            amps[k]   = math.sqrt(i*i + q*q)
            phases[k] = math.atan2(q, i)

        self.bus.publish("csi", {
            "node_id": nid,
            "freq_hz": freq,
            "seq":     seq,
            "rssi":    rssi,
            "noise":   noise,
            "n_ant":   n_ant,
            "n_sc":    n_sc,
            "amp":     amps,
            "phase":   phases,
        })
        # also publish a lightweight fleet ping for the provision tab
        self.bus.publish("fleet", {"node_id": nid, "rssi": rssi, "seq": seq, "ts": st.last_seen})


class _Proto(asyncio.DatagramProtocol):
    def __init__(self, sink: UdpSink): self.sink = sink
    def datagram_received(self, data: bytes, addr) -> None:
        try: self.sink._on_datagram(data, addr)
        except Exception as e: log.debug("decode err: %s", e)
    def error_received(self, exc) -> None:
        log.debug("udp error: %s", exc)
