"""Runtime config + path resolution.

The GUI is designed to live at <repo>/aedi-sight-gui/. We resolve repo root by
walking up from this file. All paths are pathlib.Path objects.
"""
from __future__ import annotations
import os, sys, socket, subprocess
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional


def _find_repo_root(start: Path) -> Path:
    p = start.resolve()
    for _ in range(8):
        if (p / ".git").exists() or (p / "firmware" / "esp32-csi-node").exists():
            return p
        if p.parent == p:
            break
        p = p.parent
    return start.resolve().parents[1]  # best effort


HERE      = Path(__file__).resolve()
PKG_DIR   = HERE.parent
APP_DIR   = PKG_DIR.parent
REPO_ROOT = _find_repo_root(APP_DIR)


@dataclass
class Settings:
    host: str = "0.0.0.0"
    port: int = 8088
    udp_host: str = "0.0.0.0"
    udp_port: int = 5005
    static_dir: Path = APP_DIR / "static"
    template_dir: Path = APP_DIR / "templates"
    repo_root: Path = REPO_ROOT
    firmware_dir: Path = REPO_ROOT / "firmware" / "esp32-csi-node"
    release_bins: Path = REPO_ROOT / "firmware" / "esp32-csi-node" / "release_bins"
    provision_py: Path = REPO_ROOT / "firmware" / "esp32-csi-node" / "provision.py"
    models_dir: Path = REPO_ROOT / "data" / "models"
    state_dir: Path = APP_DIR / "var"
    log_path: Path = APP_DIR / "var" / "aedi-sight.log"

    def ensure_dirs(self):
        for p in (self.state_dir, self.models_dir):
            try: p.mkdir(parents=True, exist_ok=True)
            except Exception: pass


SETTINGS = Settings()


def host_ip() -> str:
    """Pick the outbound-facing IP without actually sending a packet."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("1.1.1.1", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def host_ssid() -> Optional[str]:
    """Best-effort: read the WLAN SSID on Linux (iwgetid) or macOS (airport)."""
    if sys.platform.startswith("linux"):
        try:
            out = subprocess.check_output(["iwgetid", "-r"], timeout=1.5).decode().strip()
            return out or None
        except Exception:
            return None
    if sys.platform == "darwin":
        try:
            out = subprocess.check_output(
                ["/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport", "-I"],
                timeout=1.5).decode()
            for line in out.splitlines():
                if " SSID:" in line and " BSSID:" not in line:
                    return line.split(":", 1)[1].strip()
        except Exception:
            return None
    return None


def host_channel() -> Optional[int]:
    """Best-effort current Wi-Fi channel — Linux iw."""
    if not sys.platform.startswith("linux"):
        return None
    try:
        out = subprocess.check_output(["iw", "dev"], timeout=1.5).decode()
        iface = None
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("Interface "):
                iface = line.split()[1]; break
        if not iface:
            return None
        out = subprocess.check_output(["iw", "dev", iface, "info"], timeout=1.5).decode()
        for line in out.splitlines():
            if "channel" in line:
                tok = line.strip().split()
                # "channel 11 (2462 MHz), width: ..."
                for i, t in enumerate(tok):
                    if t == "channel" and i + 1 < len(tok):
                        return int(tok[i + 1])
    except Exception:
        return None
    return None
