"""Tools tab — auto-discovers every shippable repo script + the RuView
plugin's slash-commands, plus a small set of hand-curated favourites.

Discovery rules:
  * scripts/*.{py,sh,js}  → grouped by extension/topic
  * plugins/ruview/commands/*.md → "RuView" group (each command card shows the
    matching shell invocation extracted from the markdown's first fenced block)
  * the curated favourites (verify proof, list ports, git status, esptool MAC)
    stay at the top.

All commands are run via `JobRunner`, output streams onto the WS bus on topic
'log'. Nothing arbitrary from the browser ever reaches the shell — the UI just
sends an id, the server resolves it against the catalog.
"""
from __future__ import annotations
import sys, re
from pathlib import Path
from typing import Optional
from .config import SETTINGS
from .jobs import JobSpec

PY = sys.executable


# ── favourites (hand curated) ──────────────────────────────────────────────
FAVOURITES = [
    {
        "title": "Verification",
        "desc":  "Deterministic CSI pipeline proof + audit.",
        "items": [
            {"id": "verify-proof", "label": "verify proof",
             "cmd": [PY, str(SETTINGS.repo_root / "archive" / "v1" / "data" / "proof" / "verify.py")]},
            {"id": "verify-verbose", "label": "verify --verbose",
             "cmd": [PY, str(SETTINGS.repo_root / "archive" / "v1" / "data" / "proof" / "verify.py"), "--verbose"]},
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
            {"id": "git-fetch",  "label": "git fetch --all",
             "cmd": ["git", "-C", str(SETTINGS.repo_root), "fetch", "--all", "--prune"]},
            {"id": "git-pull",   "label": "git pull --rebase",
             "cmd": ["git", "-C", str(SETTINGS.repo_root), "pull", "--rebase", "--autostash"]},
        ],
    },
    {
        "title": "ESP32",
        "desc":  "Hardware diagnostics.",
        "items": [
            {"id": "esp-mac",         "label": "read MAC",
             "cmd": [PY, "-m", "esptool", "read_mac"]},
            {"id": "esp-chip-id",     "label": "chip ID",
             "cmd": [PY, "-m", "esptool", "chip_id"]},
            {"id": "esp-flash-id",    "label": "flash ID",
             "cmd": [PY, "-m", "esptool", "flash_id"]},
            {"id": "list-ports", "label": "list serial ports",
             "cmd": [PY, "-c",
                 "from serial.tools import list_ports\n"
                 "for p in list_ports.comports():\n"
                 "    print(f'{p.device:>16}  {p.description}')"]},
        ],
    },
]


# ── discovery ──────────────────────────────────────────────────────────────

_SCRIPT_EXT_LABELS = {".py": "python", ".sh": "shell", ".js": "node"}


def _label_for(name: str, ext: str) -> str:
    return f"{name}  · {_SCRIPT_EXT_LABELS.get(ext, ext)}"


def _build_cmd(path: Path) -> list[str]:
    ext = path.suffix.lower()
    if ext == ".py":  return [PY, str(path)]
    if ext == ".sh":  return ["bash", str(path)]
    if ext == ".js":  return ["node", str(path)]
    return [str(path)]


def _discover_repo_scripts() -> list[dict]:
    root = SETTINGS.repo_root / "scripts"
    if not root.exists():
        return []
    items = []
    for p in sorted(root.iterdir()):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        if ext not in _SCRIPT_EXT_LABELS:
            continue
        # Skip files that are clearly support data, not entry-points.
        if p.name.startswith("_") or p.name in {"fix-markers.json"}:
            continue
        items.append({
            "id":    f"script:{p.name}",
            "label": _label_for(p.stem, ext),
            "cmd":   _build_cmd(p),
        })
    if not items:
        return []
    return [{"title": "scripts/", "desc": f"Auto-discovered from {root.relative_to(SETTINGS.repo_root)} — {len(items)} entries.",
             "items": items}]


_FENCE_RE = re.compile(r"```(?:bash|sh)?\s*\n(.*?)```", re.DOTALL)


def _extract_first_command(md_text: str) -> Optional[str]:
    m = _FENCE_RE.search(md_text)
    if not m:
        return None
    body = m.group(1).strip().splitlines()
    # Take first non-comment, non-blank line.
    for ln in body:
        s = ln.strip()
        if s and not s.startswith("#") and not s.startswith("//"):
            return s
    return None


def _discover_ruview_commands() -> list[dict]:
    root = SETTINGS.repo_root / "plugins" / "ruview" / "commands"
    if not root.exists():
        return []
    items = []
    for p in sorted(root.glob("ruview-*.md")):
        try:
            text = p.read_text(errors="replace")
        except Exception:
            continue
        cmd_line = _extract_first_command(text) or ""
        if not cmd_line:
            continue
        # Drop here-docs and pipes to keep things safe + reproducible.
        if "<<" in cmd_line or "|" in cmd_line or "$(" in cmd_line:
            cmd_line = ""
        # Skip commands with placeholders (<...>) — they require user input.
        if not cmd_line or "<" in cmd_line:
            items.append({
                "id": f"ruview:{p.stem}-help",
                "label": p.stem + " — show docs",
                "cmd": ["less", "--no-init", str(p)] if cmd_line == "" else [PY, "-c", f"print({text[:400]!r})"],
            })
            continue
        items.append({
            "id": f"ruview:{p.stem}",
            "label": p.stem,
            "cmd": ["bash", "-lc", cmd_line],
        })
    if not items:
        return []
    return [{"title": "RuView · /ruview-*", "desc": "Slash-commands from plugins/ruview/commands/ (extracted shell from each docs page).",
             "items": items}]


def _build_catalog() -> list[dict]:
    cat = list(FAVOURITES)
    cat += _discover_ruview_commands()
    cat += _discover_repo_scripts()
    return cat


def _flat() -> dict[str, dict]:
    flat = {}
    for g in _build_catalog():
        for it in g["items"]:
            flat[it["id"]] = it
    return flat


# ── public API ─────────────────────────────────────────────────────────────

def public_groups() -> list[dict]:
    """Browser-safe catalog (no raw cmd)."""
    return [
        {"title": g["title"], "desc": g["desc"],
         "items": [{"id": it["id"], "label": it["label"]} for it in g["items"]]}
        for g in _build_catalog()
    ]


def spec_for(item_id: str) -> Optional[JobSpec]:
    it = _flat().get(item_id)
    if not it:
        return None
    return JobSpec(cmd=[it["cmd"]], cwd=str(SETTINGS.repo_root), topic="log",
                   label=it["label"])
