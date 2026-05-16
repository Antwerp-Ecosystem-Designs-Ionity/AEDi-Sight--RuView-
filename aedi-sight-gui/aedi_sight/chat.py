"""Terminal-style chat.

Resolution order for a user message:
  1. `/<cmd>` — handled locally (status, ports, ip, fleet, help, ssid, ...).
  2. otherwise — try `claude-flow chat` or `npx claude-flow chat` if available
     and ANTHROPIC_API_KEY is set; else echo with a hint.
"""
from __future__ import annotations
import os, shutil, subprocess
from .config import SETTINGS, host_ip, host_ssid, host_channel


HELP = """\
/help            — this message
/ip              — show host IP / SSID / channel
/ports           — list serial ports
/fleet           — show last-seen node statuses
/status          — backend snapshot (json)
/git status      — branch + HEAD + behind
/run <cmd>       — run a whitelisted script (verify, install, etc.)

Anything else is forwarded to Claude (claude-flow CLI) if installed.
"""


def _which(prog: str) -> str | None:
    return shutil.which(prog)


def _claude_flow_available() -> bool:
    return bool(_which("claude-flow") or _which("npx"))


def _try_claude_flow(text: str, timeout: float = 25.0) -> str | None:
    """Best-effort: call claude-flow chat via npx. If the env is missing or
    the call fails, return None and the caller falls back to local echo."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    cmd = None
    if _which("claude-flow"):
        cmd = ["claude-flow", "chat", "--message", text, "--quiet"]
    elif _which("npx"):
        cmd = ["npx", "-y", "@claude-flow/cli@latest", "chat", "--message", text, "--quiet"]
    if not cmd:
        return None
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
        return (out.stderr or out.stdout or "").strip() or None
    except subprocess.TimeoutExpired:
        return "(claude-flow timed out)"
    except Exception as e:
        return f"(claude-flow error: {e})"


def handle(text: str) -> dict:
    text = (text or "").strip()
    if not text:
        return {"reply": "", "lines": []}
    if text.startswith("/"):
        return _local_cmd(text)
    cf = _try_claude_flow(text)
    if cf:
        return {"reply": cf, "lines": []}
    return {
        "reply": "",
        "lines": [
            "claude-flow CLI not available (or ANTHROPIC_API_KEY unset).",
            "Local commands still work — type /help.",
        ],
    }


def _local_cmd(text: str) -> dict:
    parts = text[1:].split()
    if not parts:
        return {"reply": HELP, "lines": []}
    head, *rest = parts
    head = head.lower()
    if head == "help":
        return {"reply": HELP, "lines": []}
    if head == "ip":
        return {"reply": "", "lines": [
            f"host IP     · {host_ip()}",
            f"host SSID   · {host_ssid() or '—'}",
            f"host chan   · {host_channel() or '—'}",
            f"udp sink    · {SETTINGS.udp_host}:{SETTINGS.udp_port}",
        ]}
    if head == "ports":
        from .provision import list_serial_ports
        ports = list_serial_ports()
        if not ports:
            return {"reply": "", "lines": ["no serial ports — connect an ESP32 over USB"]}
        return {"reply": "", "lines": [f"{p['device']:>16}  {p['description']}" for p in ports]}
    if head == "status":
        return {"reply": "", "lines": ["use the Logs tab for live state, or GET /api/status"]}
    if head == "fleet":
        return {"reply": "", "lines": ["see the Provision tab — fleet table updates every 4 s"]}
    if head == "run":
        return {"reply": "", "lines": [
            "/run is intentionally minimal — use the Tools tab for whitelisted scripts.",
        ]}
    if head == "git" and rest and rest[0] == "status":
        try:
            out = subprocess.run(["git", "-C", str(SETTINGS.repo_root), "status", "-sb"],
                                 capture_output=True, text=True, timeout=4).stdout
            return {"reply": "", "lines": out.splitlines()}
        except Exception as e:
            return {"reply": "", "lines": [f"git: {e}"]}
    return {"reply": "", "lines": [f"unknown command: /{head} — try /help"]}
