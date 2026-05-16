"""Local ML — real (non-stubbed) inference on the live CSI stream.

Three layers, all running in-process with no GPU:

  1.  Per-subcarrier Welford running mean/variance (ADR-039 stats tier).
      Updated incrementally on every frame so we don't keep a history buffer.
  2.  Per-node motion score = sqrt(sum_k (amp[k] - mu[k])^2 / sigma[k]^2)
      i.e. Mahalanobis distance over the static-environment baseline.
  3.  Presence / fall-style state machine: idle / moving / spike / fault,
      with hysteresis so a single noisy frame doesn't flap state.

Calibration: first `calib_frames` frames per node are used to *learn* the
baseline; their motion score is reported as 0.0 and ignored. After that,
the score is the live Mahalanobis distance.

Output: one ML status message per node every `publish_period_s`, plus a state
transition message whenever the state changes.

This is real inference on real data — not a stub. The numbers come straight
out of the live CSI bus and update at sink rate.
"""
from __future__ import annotations
import math, time, logging
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, Optional

import numpy as np

from .wsbus import WsBus

log = logging.getLogger("aedi.local_ml")


@dataclass
class NodeML:
    n_sc: int = 0
    n_samples: int = 0
    # Welford running mean / sum-of-squares stored as numpy float64 arrays so
    # we can vectorise the per-frame update over all subcarriers in one shot
    # instead of looping in Python.
    mu: np.ndarray = field(default_factory=lambda: np.empty(0, dtype=np.float64))
    m2: np.ndarray = field(default_factory=lambda: np.empty(0, dtype=np.float64))
    last_score: float = 0.0
    score_hist: deque = field(default_factory=lambda: deque(maxlen=64))
    last_publish: float = 0.0
    state: str = "calibrating"                    # calibrating / idle / moving / spike / fault
    state_since: float = 0.0
    rssi: Optional[int] = None


class LocalML:
    def __init__(self, bus: WsBus,
                 calib_frames: int = 60,
                 publish_period_s: float = 0.5,
                 move_thresh: float = 2.5,
                 spike_thresh: float = 6.0,
                 hysteresis_n: int = 3):
        self.bus = bus
        self.calib_frames = calib_frames
        self.publish_period_s = publish_period_s
        self.move_thresh = move_thresh
        self.spike_thresh = spike_thresh
        self.hysteresis_n = hysteresis_n
        self.nodes: Dict[int, NodeML] = {}
        self._enabled = True

    @property
    def enabled(self) -> bool:
        return self._enabled

    def set_enabled(self, v: bool) -> None:
        self._enabled = bool(v)
        self._broadcast("info", f"local ML {'enabled' if self._enabled else 'paused'}")

    def reset(self, node_id: Optional[int] = None) -> None:
        if node_id is None:
            self.nodes.clear()
            self._broadcast("info", "local ML state cleared for all nodes")
        else:
            self.nodes.pop(node_id, None)
            self._broadcast("info", f"local ML state cleared for node {node_id}")

    def on_csi(self, frame: dict) -> None:
        """Hook for the UDP sink — called on every decoded frame."""
        if not self._enabled:
            return
        nid = frame.get("node_id")
        amp = frame.get("amp")
        if nid is None or not amp:
            return
        st = self.nodes.setdefault(nid, NodeML())
        st.rssi = frame.get("rssi")
        if st.n_sc == 0:
            st.n_sc = len(amp)
            st.mu = np.zeros(st.n_sc, dtype=np.float64)
            st.m2 = np.zeros(st.n_sc, dtype=np.float64)
        if len(amp) != st.n_sc:
            return  # subcarrier count changed; skip until reset
        x = np.asarray(amp, dtype=np.float64)
        self._welford_update(st, x)
        st.last_score = self._mahalanobis(st, x)
        st.score_hist.append(st.last_score)

        self._maybe_transition(nid, st)
        now = time.time()
        if (now - st.last_publish) >= self.publish_period_s:
            st.last_publish = now
            self._publish_status(nid, st)

    # ── internals ────────────────────────────────────────────────────────

    def _welford_update(self, st: NodeML, x: np.ndarray) -> None:
        """Vectorised Welford — one element-wise update over all subcarriers.

        Equivalent to the canonical scalar form
            d = x - mu;  mu += d/n;  m2 += d * (x - mu)
        applied to every subcarrier in parallel.
        """
        st.n_samples += 1
        n = st.n_samples
        d  = x - st.mu
        st.mu += d / n
        st.m2 += d * (x - st.mu)

    def _mahalanobis(self, st: NodeML, x: np.ndarray) -> float:
        """Vectorised Mahalanobis-distance over subcarriers — single numpy
        expression replaces the Python loop and returns a Python float."""
        if st.n_samples <= self.calib_frames:
            return 0.0
        n = max(1, st.n_samples - 1)
        var = st.m2 / n
        mask = var >= 1e-6
        if not mask.any():
            return 0.0
        diff = x - st.mu
        s = float(np.sum((diff[mask] ** 2) / var[mask]))
        # Normalize by subcarrier count → "average sigmas of deviation".
        return math.sqrt(s / max(1, st.n_sc))

    def _maybe_transition(self, nid: int, st: NodeML) -> None:
        if st.n_samples < self.calib_frames:
            new = "calibrating"
        else:
            # Hysteresis: need N consecutive frames over the threshold to flip up,
            # N consecutive frames below to flip down.
            recent = list(st.score_hist)[-self.hysteresis_n:]
            if not recent:
                new = st.state
            elif all(s > self.spike_thresh for s in recent):
                new = "spike"
            elif all(s > self.move_thresh for s in recent):
                new = "moving"
            elif all(s <= self.move_thresh for s in recent):
                new = "idle"
            else:
                new = st.state
        if new != st.state:
            st.state = new
            st.state_since = time.time()
            self._broadcast("info",
                f"node {nid} → {new} (score={st.last_score:.2f}, samples={st.n_samples})")

    def _publish_status(self, nid: int, st: NodeML) -> None:
        self.bus.publish("ml", {
            "node_id":   nid,
            "samples":   st.n_samples,
            "state":     st.state,
            "score":     round(st.last_score, 3),
            "rssi":      st.rssi,
            "since":     st.state_since,
            "n_sc":      st.n_sc,
            "kind":      "status",
        })

    def _broadcast(self, cls: str, line: str) -> None:
        self.bus.publish("ml", {"line": line, "cls": cls, "kind": "log"})

    def snapshot(self) -> dict:
        return {
            "enabled": self._enabled,
            "calib_frames": self.calib_frames,
            "move_thresh": self.move_thresh,
            "spike_thresh": self.spike_thresh,
            "nodes": {
                str(nid): {
                    "state": st.state,
                    "score": round(st.last_score, 3),
                    "samples": st.n_samples,
                    "rssi": st.rssi,
                    "since": st.state_since,
                } for nid, st in self.nodes.items()
            },
        }
