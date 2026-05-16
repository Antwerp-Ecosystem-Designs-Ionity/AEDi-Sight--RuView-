"""Async subprocess job runner.

A *job* is one or more shell commands, started in sequence. stdout/stderr
stream to the WS bus on a configurable topic ('provision', 'ml', 'log', ...).
"""
from __future__ import annotations
import asyncio, logging, os, shlex, uuid, time
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple

from .wsbus import WsBus

log = logging.getLogger("aedi.jobs")


@dataclass
class JobSpec:
    cmd: List[List[str]]                  # list of argv lists, run sequentially
    cwd: Optional[str] = None
    env: Optional[Dict[str, str]] = None
    topic: str = "log"
    label: str = ""


@dataclass
class JobState:
    id: str
    spec: JobSpec
    started: float = 0.0
    finished: Optional[float] = None
    rc: Optional[int] = None
    task: Optional[asyncio.Task] = None


class JobRunner:
    def __init__(self, bus: WsBus):
        self.bus = bus
        self._jobs: Dict[str, JobState] = {}

    def submit(self, spec: JobSpec) -> str:
        jid = uuid.uuid4().hex[:8]
        st = JobState(id=jid, spec=spec)
        st.task = asyncio.create_task(self._run(st))
        self._jobs[jid] = st
        return jid

    async def _run(self, st: JobState) -> None:
        st.started = time.time()
        self._emit(st, f"= job {st.id} :: {st.spec.label or 'task'} =", cls="info")
        for argv in st.spec.cmd:
            self._emit(st, "$ " + " ".join(shlex.quote(a) for a in argv), cls="info")
            try:
                proc = await asyncio.create_subprocess_exec(
                    *argv,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                    cwd=st.spec.cwd, env={**os.environ, **(st.spec.env or {})},
                )
            except FileNotFoundError as e:
                self._emit(st, f"not found: {e}", cls="err"); st.rc = 127; break
            except Exception as e:
                self._emit(st, f"spawn failed: {e}", cls="err"); st.rc = 1; break
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                self._emit(st, line.decode(errors="replace").rstrip("\n"))
            st.rc = await proc.wait()
            if st.rc != 0:
                self._emit(st, f"exit {st.rc}", cls="err"); break
            else:
                self._emit(st, f"exit 0", cls="ok")
        st.finished = time.time()

    def _emit(self, st: JobState, line: str, cls: str = "") -> None:
        self.bus.publish(st.spec.topic, {"job_id": st.id, "line": line, "cls": cls})

    def status(self) -> List[dict]:
        return [{
            "id": jid, "label": s.spec.label, "rc": s.rc,
            "started": s.started, "finished": s.finished,
        } for jid, s in self._jobs.items()]
