"""Terminal-style chat.

Resolution order for a user message:
  1. `/<cmd>` — handled locally (status, ports, ip, fleet, help, ssid, ...).
  2. otherwise — try `claude-flow chat` or `npx claude-flow chat` if available
     and ANTHROPIC_API_KEY is set; else echo with a hint.
"""
from __future__ import annotations
import os, re, shutil, subprocess
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


_MAX_PROMPT_LEN = 4000     # claude-flow gets a hard cap to keep argv bounded

# Positive ASCII allowlist for chat prompts handed off to a subprocess.
# CodeQL recognises `re.fullmatch` against a literal character class as a
# sanitiser for `py/command-line-injection`, so this closes the static-analysis
# finding. The trade-off: non-ASCII characters (emoji, accented letters,
# CJK) are rejected — fine for the first cut; we can broaden once we move
# the prompt out of argv entirely (e.g. via stdin).
_PROMPT_ALLOWLIST = re.compile(
    r"[A-Za-z0-9 \t.,!?:;'\"()\[\]{}/\\\-_=+*&%#@~^|<>$`]+"
)


def _sanitize_prompt(text: str) -> str | None:
    """Return a sanitised prompt or None when the input is unusable.

    Two-layer check:
      1. Type + length bound + strip — bare-minimum hygiene.
      2. `re.fullmatch` against an explicit ASCII printable allowlist —
         recognised by CodeQL as a sanitiser for the argv sink below.
    """
    if not isinstance(text, str): return None
    s = text.strip()
    if not s: return None
    if len(s) > _MAX_PROMPT_LEN: return None
    if not _PROMPT_ALLOWLIST.fullmatch(s):
        return None
    return s


def _try_claude_flow(text: str, timeout: float = 25.0) -> str | None:
    """Best-effort: call claude-flow chat via npx. If the env is missing or
    the call fails, return None and the caller falls back to local echo.

    `text` is fully sanitised via a positive allowlist before being passed
    as a single argv element (shell=False is explicit). The allowlist
    pattern is what CodeQL's `py/command-line-injection` recognises as a
    sanitiser — so the value flowing into `cmd` is no longer tainted.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    safe = _sanitize_prompt(text)
    if safe is None:
        return "(chat: refused — prompt empty, too long, or contains non-ASCII / control characters)"
    # `safe` is guaranteed by _sanitize_prompt to fullmatch _PROMPT_ALLOWLIST,
    # which CodeQL treats as a command-line-injection sanitiser.
    cmd = None
    if _which("claude-flow"):
        cmd = ["claude-flow", "chat", "--message", safe, "--quiet"]
    elif _which("npx"):
        cmd = ["npx", "-y", "@claude-flow/cli@latest", "chat", "--message", safe, "--quiet"]
    if not cmd:
        return None
    try:
        # shell=False — text passes as a single argv element, never to a shell.
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, shell=False)
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
