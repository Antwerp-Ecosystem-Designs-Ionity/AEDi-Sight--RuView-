"""SDK / library manifest — full inventory of the repo's shippable units.

Walks the checkout and produces a JSON-friendly manifest grouped by stack:

  rust    — every `v2/crates/<name>/Cargo.toml` (name, version, description, deps)
  firmware — `firmware/esp32-csi-node/` + the prebuilt bin set
  python  — `archive/v1/src/` packages + this app's `aedi_sight/`
  vendor  — `vendor/rvcsi/crates/*` and any other vendor submodules
  apps    — `dashboard/`, `ui/`, the Tauri desktop (`v2/crates/wifi-densepose-desktop`)
  scripts — `scripts/*` (handed off to tools.py; this module just summarises)

Each entry has enough metadata for the Libraries tab to render cards with a
title, description, type, paths, and (where relevant) a list of binaries or
entry-points the user can run.
"""
from __future__ import annotations
import re, json
from pathlib import Path
from typing import Optional

from .config import SETTINGS

CRATE_RE_NAME = re.compile(r'^\s*name\s*=\s*"([^"]+)"', re.M)
CRATE_RE_VER  = re.compile(r'^\s*version\s*=\s*"([^"]+)"', re.M)
CRATE_RE_DESC = re.compile(r'^\s*description\s*=\s*"([^"]+)"', re.M)
CRATE_RE_BIN  = re.compile(r'^\[\[bin\]\][^\[]*?name\s*=\s*"([^"]+)"', re.M | re.S)


def _read_text(p: Path, limit: int = 2_000) -> str:
    try: return p.read_text(errors="replace")[:limit]
    except Exception: return ""


def _crate_card(toml_path: Path) -> Optional[dict]:
    raw = _read_text(toml_path)
    if not raw:
        return None
    name = (CRATE_RE_NAME.search(raw) or [None, ""])[1] or toml_path.parent.name
    ver  = (CRATE_RE_VER.search(raw)  or [None, ""])[1]
    desc = (CRATE_RE_DESC.search(raw) or [None, ""])[1]
    # Bins
    bins = []
    for m in CRATE_RE_BIN.finditer(raw):
        bins.append(m.group(1))
    readme = toml_path.parent / "README.md"
    readme_present = readme.exists()
    return {
        "name":    name,
        "version": ver,
        "description": desc,
        "path":    str(toml_path.parent.relative_to(SETTINGS.repo_root)),
        "binaries": bins,
        "readme":  str(readme.relative_to(SETTINGS.repo_root)) if readme_present else None,
        "stack":   "rust",
    }


def _rust_crates() -> list[dict]:
    out = []
    root = SETTINGS.repo_root / "v2" / "crates"
    if root.exists():
        for sub in sorted(root.iterdir()):
            if not sub.is_dir():
                continue
            toml = sub / "Cargo.toml"
            if toml.exists():
                card = _crate_card(toml)
                if card: out.append(card)
    return out


def _vendor_crates() -> list[dict]:
    out = []
    root = SETTINGS.repo_root / "vendor"
    if not root.exists():
        return out
    for toml in sorted(root.rglob("Cargo.toml")):
        # Only first-level crates inside a vendor submodule's crates/ dir.
        if "crates" not in toml.parts:
            continue
        card = _crate_card(toml)
        if card:
            card["stack"] = "vendor"
            out.append(card)
    return out


def _python_packages() -> list[dict]:
    out = []
    # v1 archived python
    v1_src = SETTINGS.repo_root / "archive" / "v1" / "src"
    if v1_src.exists():
        for sub in sorted(v1_src.iterdir()):
            if sub.is_dir() and (sub / "__init__.py").exists():
                desc = ""
                init = (sub / "__init__.py")
                txt = _read_text(init, 400)
                m = re.search(r'"""(.+?)"""', txt, re.S)
                if m: desc = m.group(1).strip().splitlines()[0][:140]
                out.append({
                    "name":  f"v1.src.{sub.name}",
                    "description": desc,
                    "path":  str(sub.relative_to(SETTINGS.repo_root)),
                    "stack": "python",
                })
    # this app
    me = SETTINGS.repo_root / "aedi-sight-gui" / "aedi_sight"
    if me.exists():
        out.append({
            "name": "aedi_sight",
            "description": "this console — aiohttp server + asyncio UDP sink + WS bus + LocalML + scipy vitals",
            "path": str(me.relative_to(SETTINGS.repo_root)),
            "stack": "python",
        })
    return out


def _firmware() -> list[dict]:
    out = []
    fw = SETTINGS.firmware_dir
    if not fw.exists():
        return out
    bins = []
    rb = fw / "release_bins"
    if rb.exists():
        for p in sorted(rb.iterdir()):
            if p.is_file() and p.suffix == ".bin":
                try: size = p.stat().st_size
                except Exception: size = 0
                bins.append({"name": p.name, "size": size,
                             "path": str(p.relative_to(SETTINGS.repo_root))})
    out.append({
        "name":  "esp32-csi-node",
        "description": "ESP32-S3 CSI sensing firmware (ADR-018). Promiscuous CSI capture → ADR-018 frame → UDP.",
        "path":  str(fw.relative_to(SETTINGS.repo_root)),
        "stack": "firmware",
        "binaries": bins,
    })
    return out


def _apps() -> list[dict]:
    out = []
    for sub, kind, desc in [
        ("dashboard",                            "TypeScript", "RuView dashboard (TypeScript / Vite)"),
        ("ui",                                   "TypeScript", "Sensing server static UI"),
        ("v2/crates/wifi-densepose-desktop",     "Tauri v2",   "Desktop node manager (WIP)"),
        ("plugins/ruview",                       "Claude plug","RuView plugin — 9 skills, 7 commands, 3 agents"),
    ]:
        p = SETTINGS.repo_root / sub
        if p.exists():
            out.append({
                "name":  sub.split("/")[-1],
                "kind":  kind,
                "description": desc,
                "path":  sub,
                "stack": "apps",
                "url":   None,
            })
    return out


def manifest() -> dict:
    return {
        "rust":     _rust_crates(),
        "vendor":   _vendor_crates(),
        "firmware": _firmware(),
        "python":   _python_packages(),
        "apps":     _apps(),
        "repo_root": str(SETTINGS.repo_root),
    }
