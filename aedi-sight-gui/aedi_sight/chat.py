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


_MAX_PROMPT_LEN = 4000     # hard cap on the message handed to claude-flow


def _sanitize_prompt(text: str) -> str | None:
    """Bare-minimum hygiene on the prompt. The full command-injection guard
    is at the call site: we never pass `text` as an argv element — it flows
    through subprocess stdin instead. So this only has to bound size and
    reject patently-bad inputs."""
    if not isinstance(text, str): return None
    s = text.strip()
    if not s: return None
    if len(s) > _MAX_PROMPT_LEN: return None
    # Reject embedded NULs — Python `subprocess.communicate(input=...)` will
    # happily forward them and they're never desired in a chat prompt.
    if "\x00" in s: return None
    return s


def _try_claude_flow(text: str, timeout: float = 25.0) -> str | None:
    """Best-effort: call claude-flow chat. If env is missing or the call
    fails, return None so the caller falls back to local echo.

    Security: the prompt is **never** placed on the command line. The argv
    is a constant list of literal flag names; the user-supplied prompt is
    forwarded via the subprocess's stdin pipe. CodeQL's
    `py/command-line-injection` rule applies to data that enters argv —
    stdin is out of its scope, so this design eliminates the sink entirely.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    safe = _sanitize_prompt(text)
    if safe is None:
        return "(chat: refused — prompt empty, too long, or contains a NUL byte)"
    # argv is constant; nothing the user types reaches it.
    cmd = None
    if _which("claude-flow"):
        cmd = ["claude-flow", "chat", "--stdin", "--quiet"]
    elif _which("npx"):
        cmd = ["npx", "-y", "@claude-flow/cli@latest", "chat", "--stdin", "--quiet"]
    if not cmd:
        return None
    try:
        # input= forwards the bytes to stdin; the command line stays static.
        out = subprocess.run(
            cmd,
            input=safe,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
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
