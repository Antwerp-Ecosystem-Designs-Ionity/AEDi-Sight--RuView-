"""Streaming chat — spawns `claude-flow` (or `npx @claude-flow/cli@latest`) as
a long-running subprocess and streams each stdout line back over the WS bus
on topic `chat`.

If `claude-flow` isn't installed, we fall back to a tiny built-in echo agent
so the chat UI is still useful (and visibly shows that no LLM is online).
"""
from __future__ import annotations
import asyncio, logging, os, shutil, time

from .wsbus import WsBus

log = logging.getLogger("aedi.chat_stream")


def _which(prog: str) -> str | None:
    return shutil.which(prog)


_MAX_PROMPT_LEN = 4000


def _sanitize(prompt: str) -> str | None:
    """Bare-minimum hygiene; full safety is achieved by piping via stdin."""
    if not isinstance(prompt, str): return None
    s = prompt.strip()
    if not s or len(s) > _MAX_PROMPT_LEN or "\x00" in s:
        return None
    return s


def _resolve_cmd() -> list[str] | None:
    """Return a constant argv — the prompt does *not* appear here. Stdin
    carries it. Keeps user data off the command line (CodeQL
    py/command-line-injection scope)."""
    if _which("claude-flow"):
        return ["claude-flow", "chat", "--stdin", "--stream", "--quiet"]
    if _which("npx"):
        return ["npx", "-y", "@claude-flow/cli@latest", "chat", "--stdin", "--stream", "--quiet"]
    return None


async def stream_chat(bus: WsBus, prompt: str, timeout_s: float = 90.0) -> dict:
    """Run a one-prompt streaming chat. Publishes line by line on topic 'chat'.
    Returns a final summary dict. The user prompt flows through subprocess
    stdin only; argv is constant.
    """
    cmd = _resolve_cmd()
    safe = _sanitize(prompt)
    if not cmd:
        bus.publish("chat", {"line": "claude-flow not installed — install it with: npm i -g @claude-flow/cli@latest", "cls": "warn"})
        bus.publish("chat", {"line": "Falling back to local echo:", "cls": "info"})
        bus.publish("chat", {"line": safe or "(empty)", "cls": ""})
        return {"backend": "local-echo"}
    if not os.environ.get("ANTHROPIC_API_KEY"):
        bus.publish("chat", {"line": "ANTHROPIC_API_KEY not set — export it before chatting.", "cls": "warn"})
        return {"backend": cmd[0], "skipped": True}
    if safe is None:
        bus.publish("chat", {"line": "prompt refused — empty, too long, or contains a NUL byte", "cls": "warn"})
        return {"backend": cmd[0], "rejected": True}

    bus.publish("chat", {"line": f"$ {' '.join(cmd)}", "cls": "info"})
    started = time.time()
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            env=os.environ.copy(),
        )
    except Exception as e:
        bus.publish("chat", {"line": f"spawn failed: {e}", "cls": "err"})
        return {"backend": cmd[0], "rc": 127, "error": str(e)}
    # Send the prompt over stdin then close it so the CLI sees EOF.
    try:
        assert proc.stdin is not None
        proc.stdin.write(safe.encode("utf-8"))
        await proc.stdin.drain()
        proc.stdin.close()
    except Exception as e:
        bus.publish("chat", {"line": f"stdin write failed: {e}", "cls": "err"})

    rc = None
    try:
        async def reader():
            assert proc.stdout is not None
            while True:
                line = await proc.stdout.readline()
                if not line:
                    return
                text = line.decode("utf-8", errors="replace").rstrip("\n")
                bus.publish("chat", {"line": text, "cls": ""})
        await asyncio.wait_for(reader(), timeout=timeout_s)
        rc = await proc.wait()
    except asyncio.TimeoutError:
        bus.publish("chat", {"line": f"timeout after {timeout_s:.0f}s — killing", "cls": "err"})
        try: proc.kill()
        except Exception: pass
        rc = -1
    return {
        "backend":   cmd[0],
        "rc":        rc,
        "elapsed_s": round(time.time() - started, 2),
    }
