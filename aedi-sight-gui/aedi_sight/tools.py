"""Whitelisted shell helpers — the 'Tools' tab.

Anything not on this list cannot be invoked from the UI.
"""
from __future__ import annotations
import sys
from typing import Optional
from .config import SETTINGS
from .jobs import JobSpec

PY = sys.executable

CATALOG = [
    {
        "title": "Verification",
        "desc":  "Deterministic CSI pipeline proof + audit.",
        "items": [
            {"id": "verify-proof",  "label": "verify proof",
             "cmd": [PY, str(SETTINGS.repo_root / "archive" / "v1" / "data" / "proof" / "verify.py")]},
        ],
    },
    {
        "title": "Sensing",
        "desc":  "Quick capture / decode utilities.",
        "items": [
            {"id": "list-ports", "label": "list serial ports",
             "cmd": [PY, "-c", "from serial.tools import list_ports;\nfor p in list_ports.comports(): print(p.device, '—', p.description)"]},
            {"id": "csi-spectrogram", "label": "CSI spectrogram",
             "cmd": ["node", str(SETTINGS.repo_root / "scripts" / "csi-spectrogram.js")]},
        ],
    },
    {
        "title": "Repo",
        "desc":  "Inspect repo state.",
        "items": [
            {"id": "git-status", "label": "git status",
             "cmd": ["git", "-C", str(SETTINGS.repo_root), "status", "-sb"]},
            {"id": "git-log",    "label": "git log -n 10",
             "cmd": ["git", "-C", str(SETTINGS.repo_root), "log", "--oneline", "-n", "10"]},
        ],
    },
    {
        "title": "ESP32",
        "desc":  "Hardware diagnostics.",
        "items": [
            {"id": "esp-mac",    "label": "read MAC",
             "cmd": [PY, "-m", "esptool", "read_mac"]},
        ],
    },
]


def find_item(item_id: str) -> Optional[dict]:
    for g in CATALOG:
        for it in g["items"]:
            if it["id"] == item_id:
                return it
    return None


def public_groups() -> list[dict]:
    """Strip raw `cmd` from the JSON sent to the browser."""
    return [
        {"title": g["title"], "desc": g["desc"],
         "items": [{"id": it["id"], "label": it["label"]} for it in g["items"]]}
        for g in CATALOG
    ]


def spec_for(item_id: str) -> Optional[JobSpec]:
    it = find_item(item_id)
    if not it:
        return None
    return JobSpec(cmd=[it["cmd"]], cwd=str(SETTINGS.repo_root), topic="log",
                   label=it["label"])
