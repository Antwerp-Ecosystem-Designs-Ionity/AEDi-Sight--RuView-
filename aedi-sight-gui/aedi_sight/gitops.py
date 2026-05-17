"""Git status / pull / fetch / log + CHANGELOG reader."""
from __future__ import annotations
import asyncio, subprocess
from .config import SETTINGS


def _git(*args: str, timeout: float = 8.0) -> tuple[int, str, str]:
    try:
        p = subprocess.run(["git", "-C", str(SETTINGS.repo_root), *args],
                           capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout, p.stderr
    except Exception as e:
        return 1, "", f"git: {e}"


def status() -> dict:
    rc, branch, _ = _git("rev-parse", "--abbrev-ref", "HEAD")
    branch = (branch.strip() if rc == 0 else "")
    rc, head, _ = _git("rev-parse", "HEAD")
    head = (head.strip() if rc == 0 else "")
    rc, sub, _ = _git("log", "-1", "--pretty=%s")
    head_subject = (sub.strip() if rc == 0 else "")
    behind = None
    rc, out, _ = _git("rev-list", "--left-right", "--count", f"{branch}...origin/{branch}")
    if rc == 0 and out.strip():
        try:
            _ahead, _behind = out.strip().split()
            behind = int(_behind)
        except Exception:
            pass
    return {"branch": branch, "head": head, "head_subject": head_subject, "behind": behind}


def pull() -> dict:
    rc, out, err = _git("pull", "--rebase", "--autostash")
    return {"rc": rc, "stdout": out, "stderr": err}


def fetch() -> dict:
    rc, out, err = _git("fetch", "--all", "--prune")
    return {"rc": rc, "stdout": out, "stderr": err}


def log(n: int = 10) -> dict:
    rc, out, err = _git("log", f"-n{n}", "--oneline", "--decorate")
    return {"rc": rc, "stdout": out, "stderr": err}


def changelog() -> dict:
    p = SETTINGS.repo_root / "CHANGELOG.md"
    if not p.exists():
        return {"text": ""}
    try:
        # Trim to a sane size for the browser.
        data = p.read_text(errors="replace")
        if len(data) > 200_000:
            data = data[:200_000] + "\n…(truncated)\n"
        return {"text": data}
    except Exception as e:
        return {"text": f"error reading CHANGELOG: {e}"}
