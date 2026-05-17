"""RuView plugin integration — parse plugins/ruview/{commands,skills,agents}/
into structured cards for the dedicated RuView tab.

Each parser reads the YAML-ish front matter from the Markdown file
(`--- key: value ---`) plus the first paragraph after the title as the
"description". This keeps the UI in sync with whatever lives in the repo
without us re-typing anything.
"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Optional

from .config import SETTINGS

FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)", re.S)
FM_LINE = re.compile(r"^([A-Za-z0-9_\-]+)\s*:\s*(.*)$")


def _read(p: Path) -> Optional[tuple[dict, str]]:
    try:
        raw = p.read_text(errors="replace")
    except Exception:
        return None
    m = FM_RE.match(raw)
    meta: dict = {}
    body = raw
    if m:
        block = m.group(1)
        body = m.group(2)
        for line in block.splitlines():
            mm = FM_LINE.match(line.strip())
            if mm:
                meta[mm.group(1)] = mm.group(2).strip().strip('"')
    # First non-empty paragraph after the H1 title.
    desc = ""
    after_title = re.split(r"^#\s+.*$", body, maxsplit=1, flags=re.M)
    body2 = (after_title[1] if len(after_title) > 1 else body).strip()
    if body2:
        for chunk in re.split(r"\n\s*\n", body2):
            chunk = chunk.strip()
            if chunk and not chunk.startswith(("```", "#", "-", "*", "|")):
                desc = " ".join(chunk.splitlines()).strip()
                break
    return meta, desc


def _list(dirname: str, prefix: str) -> list[dict]:
    out = []
    root = SETTINGS.repo_root / "plugins" / "ruview" / dirname
    if not root.exists():
        return out
    for p in sorted(root.glob("*.md")):
        parsed = _read(p)
        if not parsed:
            continue
        meta, desc = parsed
        out.append({
            "name":        p.stem,
            "kind":        dirname[:-1] if dirname.endswith("s") else dirname,
            "description": meta.get("description") or desc[:200] or "(no description)",
            "argument_hint": meta.get("argument-hint", ""),
            "path":        str(p.relative_to(SETTINGS.repo_root)),
            "slug":        p.stem if prefix not in p.stem else p.stem,
        })
    return out


def commands() -> list[dict]: return _list("commands", "/")
def skills()   -> list[dict]: return _list("skills",   "")
def agents()   -> list[dict]:
    # Agents may be .md *or* .json or directories — be permissive.
    out = []
    root = SETTINGS.repo_root / "plugins" / "ruview" / "agents"
    if not root.exists():
        return out
    for entry in sorted(root.iterdir()):
        if entry.is_dir():
            md = entry / "agent.md"
            if md.exists():
                parsed = _read(md)
                if parsed:
                    meta, desc = parsed
                    out.append({
                        "name": entry.name,
                        "kind": "agent",
                        "description": meta.get("description") or desc[:200] or "(agent)",
                        "path": str(entry.relative_to(SETTINGS.repo_root)),
                    })
                    continue
            out.append({"name": entry.name, "kind": "agent",
                        "description": "(directory)", "path": str(entry.relative_to(SETTINGS.repo_root))})
        elif entry.suffix == ".md":
            parsed = _read(entry)
            if parsed:
                meta, desc = parsed
                out.append({
                    "name": entry.stem, "kind": "agent",
                    "description": meta.get("description") or desc[:200] or "(agent)",
                    "path": str(entry.relative_to(SETTINGS.repo_root)),
                })
    return out


def snapshot() -> dict:
    return {
        "commands": commands(),
        "skills":   skills(),
        "agents":   agents(),
    }


def file_content(rel_path: str) -> Optional[str]:
    """Return the raw markdown for a known plugins/ruview/* path.
    Path traversal is guarded: must stay under plugins/ruview/.
    """
    base = SETTINGS.repo_root / "plugins" / "ruview"
    full = (SETTINGS.repo_root / rel_path).resolve()
    try:
        full.relative_to(base.resolve())
    except ValueError:
        return None
    if not full.exists() or not full.is_file():
        return None
    try:
        return full.read_text(errors="replace")
    except Exception:
        return None
