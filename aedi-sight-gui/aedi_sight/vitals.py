"""Real-time vitals estimator — scipy.signal.welch on a rolling per-node
mean-amplitude buffer.

For each node we keep a short ring buffer of `mean(amp)` per frame (i.e. a
single scalar per CSI frame, robust against per-subcarrier noise). When the
buffer has enough samples we run Welch's PSD and pick the dominant peak in
two bands:

    breathing    0.10 .. 0.50 Hz   (6  ..  30 BPM)
    heart rate   0.80 .. 3.00 Hz   (48 .. 180 BPM)

Estimates are published on WS topic `vitals` once per second. The estimator
is also resilient to variable frame rate — every push records its timestamp,
and we compute the dominant frequency in Hz directly from inter-sample
spacing (Welch's `fs` is the median 1/Δt over the window).

Real numbers, no simulation. If scipy isn't available, this module is a
no-op (we just import numpy below — if even numpy is missing we degrade to
silent skip).
"""
from __future__ import annotations
import logging, math, time
from collections import deque
from typing import Optional

from .wsbus import WsBus

log = logging.getLogger("aedi.vitals")

try:
    import numpy as np
    from scipy.signal import welch, detrend
    _BACKEND = "scipy"
except Exception as e:                              # pragma: no cover
    np = None
    welch = None
    _BACKEND = f"missing ({e})"


class Vitals:
    """One instance per app — shared across all nodes."""
    def __init__(self, bus: WsBus,
                 window_s: float = 12.0,
                 min_samples: int = 32,
                 publish_period_s: float = 1.0,
                 nperseg: int = 64):
        self.bus = bus
        self.window_s = window_s
        self.min_samples = min_samples
        self.publish_period_s = publish_period_s
        self.nperseg = nperseg
        # per-node: deque[(ts, mean_amp)]
        self._buf: dict[int, "deque"] = {}
        self._last_pub: dict[int, float] = {}
        self._enabled = (welch is not None)
        if not self._enabled:
            log.warning("vitals disabled — scipy unavailable (%s)", _BACKEND)

    @property
    def enabled(self) -> bool:
        return self._enabled

    def on_csi(self, frame: dict) -> None:
        if not self._enabled:
            return
        nid = frame.get("node_id")
        amp = frame.get("amp")
        if nid is None or not amp:
            return
        m = sum(amp) / len(amp)
        ts = time.time()
        buf = self._buf.setdefault(nid, deque(maxlen=2048))
        buf.append((ts, m))
        # drop entries older than window_s
        cutoff = ts - self.window_s
        while buf and buf[0][0] < cutoff:
            buf.popleft()
        if (ts - self._last_pub.get(nid, 0.0)) < self.publish_period_s:
            return
        if len(buf) < self.min_samples:
            return
        self._last_pub[nid] = ts
        self._estimate_and_publish(nid, buf)

    def _estimate_and_publish(self, nid: int, buf) -> None:
        ts_arr = np.fromiter((t for t, _ in buf), dtype=float)
        x      = np.fromiter((v for _, v in buf), dtype=float)
        if len(x) < self.min_samples:
            return
        # Variable-rate ⇒ resample to uniform median fs (no scipy interp needed —
        # linear interp via numpy is fine here, the deviations are small).
        dt = np.diff(ts_arr)
        if len(dt) == 0:
            return
        med_dt = float(np.median(dt))
        if med_dt <= 0:
            return
        fs = 1.0 / med_dt
        # build a uniform grid spanning the window
        n = max(self.min_samples, int(round((ts_arr[-1] - ts_arr[0]) * fs)))
        if n < self.min_samples:
            return
        grid = np.linspace(ts_arr[0], ts_arr[-1], n)
        xs = np.interp(grid, ts_arr, x)
        xs = detrend(xs, type="linear")

        nperseg = min(self.nperseg, len(xs))
        try:
            f, p = welch(xs, fs=fs, nperseg=nperseg, scaling="density")
        except Exception as e:
            log.debug("welch failed: %s", e); return

        br_bpm, br_conf = _pick_peak(f, p, 0.10, 0.50)   # breathing band
        hr_bpm, hr_conf = _pick_peak(f, p, 0.80, 3.00)   # heart-rate band

        self.bus.publish("vitals", {
            "node_id":         nid,
            "fs":              round(fs, 2),
            "samples":         int(n),
            "window_s":        round(self.window_s, 2),
            "breathing_bpm":   br_bpm,
            "breathing_conf":  br_conf,
            "heart_rate_bpm":  hr_bpm,
            "heart_rate_conf": hr_conf,
        })


def _pick_peak(f, p, fmin: float, fmax: float) -> tuple[Optional[float], float]:
    if np is None or f is None:
        return None, 0.0
    mask = (f >= fmin) & (f <= fmax)
    if not mask.any():
        return None, 0.0
    band  = p[mask]
    f_band = f[mask]
    k = int(np.argmax(band))
    peak_p = float(band[k])
    f_peak = float(f_band[k])
    # confidence = peak / (median of in-band power)
    median = float(np.median(band))
    conf = float(peak_p / max(1e-12, median))
    bpm = round(f_peak * 60.0, 1)
    return bpm, round(min(conf, 50.0), 2)


__all__ = ["Vitals"]
