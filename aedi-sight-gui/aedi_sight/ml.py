"""ML helpers — local model listing + job dispatch.

Training itself is the existing repo scripts; we just shape command lines.
Falls back to a small synthetic 'demo train' when scripts aren't present so
the tab is functional in any clone state.
"""
from __future__ import annotations
import sys, os
from pathlib import Path
from .config import SETTINGS
from .jobs import JobSpec

PY = sys.executable


def list_models() -> list[dict]:
    models = []
    for root in [SETTINGS.models_dir, SETTINGS.repo_root / "data" / "models",
                 SETTINGS.repo_root / "releases" / "desktop"]:
        if not root.exists():
            continue
        for p in sorted(root.rglob("*")):
            if not p.is_file():
                continue
            if p.suffix.lower() not in (".rvf", ".onnx", ".bin", ".pt", ".pth", ".npz"):
                continue
            try:
                st = p.stat()
                models.append({
                    "name":  str(p.relative_to(SETTINGS.repo_root)),
                    "size":  st.st_size,
                    "mtime": st.st_mtime,
                })
            except Exception:
                continue
    return models


def job_spec(name: str) -> JobSpec | None:
    name = (name or "").strip().lower()
    if name == "contrastive":
        # Use the sensing-server's pretrain mode if it exists; fall back to a stub.
        script = SETTINGS.repo_root / "scripts" / "train_contrastive.py"
        if script.exists():
            return JobSpec(cmd=[[PY, str(script), "--epochs", "5"]],
                           cwd=str(SETTINGS.repo_root), topic="ml",
                           label="contrastive pretrain (5 epochs)")
        return JobSpec(cmd=[[PY, "-c",
            "import time, random\nfor e in range(5):\n  for s in range(20):\n    print(f'ep {e+1} step {s+1:02d} loss={random.uniform(0.2,0.8):.3f}', flush=True); time.sleep(0.05)\nprint('done')"]],
            topic="ml", label="contrastive pretrain (stub)")
    if name == "pose":
        script = SETTINGS.repo_root / "scripts" / "train_pose.py"
        if script.exists():
            return JobSpec(cmd=[[PY, str(script), "--epochs", "3"]],
                           cwd=str(SETTINGS.repo_root), topic="ml",
                           label="pose head fine-tune (3 epochs)")
        return JobSpec(cmd=[[PY, "-c",
            "import time, random\nfor e in range(3):\n  for s in range(15):\n    print(f'pose ep {e+1} step {s+1:02d} mpjpe={random.uniform(20,40):.2f}mm', flush=True); time.sleep(0.07)\nprint('done')"]],
            topic="ml", label="pose head fine-tune (stub)")
    if name == "benchmark":
        return JobSpec(cmd=[[PY, "-c",
            "import time, random\nfor i in range(30):\n  print(f'frame {i+1:02d}  hr={random.uniform(58,76):.1f}bpm  br={random.uniform(11,18):.1f}bpm', flush=True); time.sleep(0.06)\nprint('benchmark complete')"]],
            topic="ml", label="vital-sign benchmark (stub)")
    return None
