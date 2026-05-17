"""Per-node settings persistence — `var/fleet-state.json`.

We remember the last-used provisioning args per node-id so the UI can pre-fill
the form. Passwords are *never* persisted (would be a credential leak).
"""
from __future__ import annotations
import json, logging, threading
from pathlib import Path
from typing import Optional

from .config import SETTINGS

log = logging.getLogger("aedi.state")

_LOCK = threading.Lock()
_FILE = SETTINGS.state_dir / "fleet-state.json"
_BANNED = {"password"}              # never persist these keys


def _load() -> dict:
    if not _FILE.exists():
        return {}
    try:
        with _FILE.open("r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception as e:
        log.warning("state load failed: %s", e)
        return {}


def _save(d: dict) -> None:
    try:
        SETTINGS.ensure_dirs()
        tmp = _FILE.with_suffix(".json.tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(d, f, indent=2, sort_keys=True)
        tmp.replace(_FILE)
    except Exception as e:
        log.warning("state save failed: %s", e)


def all_nodes() -> dict:
    """Return the whole table — {node_id: {fields}}."""
    with _LOCK:
        return _load().get("nodes", {})


def remember(node_id: int, body: dict) -> None:
    """Persist the provisioning args for `node_id`, stripping anything in _BANNED."""
    safe = {k: v for k, v in body.items() if k not in _BANNED and v not in (None, "")}
    with _LOCK:
        d = _load()
        nodes = d.setdefault("nodes", {})
        nodes[str(node_id)] = safe
        _save(d)


def forget(node_id: int) -> None:
    with _LOCK:
        d = _load()
        d.get("nodes", {}).pop(str(node_id), None)
        _save(d)


def get(node_id: int) -> Optional[dict]:
    with _LOCK:
        return _load().get("nodes", {}).get(str(node_id))
