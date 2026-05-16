"""IONITY ANSI splash for the terminal launcher.

The animation has no dependencies — uses 24-bit ANSI escape codes (truecolor),
falls back gracefully when TERM doesn't claim color support.

Run as:  python -m aedi_sight.ansi  (for manual preview)
"""
from __future__ import annotations
import os, sys, time, shutil

BLUE   = (10, 61, 240)
AZURE  = (58, 139, 255)
WHITE  = (255, 255, 255)
GREY   = (140, 150, 170)

LOGO = [
"  ▄█████  ██████   ██   ██  ██  ██████  ██   ██",
"  ██   ██ ██  ██   ███  ██  ██    ██     ██ ██",
"  ██   ██ ██  ██   ████ ██  ██    ██      ███",
"  ██   ██ ██  ██   ██ ████  ██    ██       █",
"  ██   ██ ██  ██   ██  ███  ██    ██       █",
"  ▀█████  ██████   ██   ██  ██    ██       █",
]

TAGLINE = "WiFi-CSI sensing console · Antwerp Designs · 2018 – 2026"


def _truecolor_supported() -> bool:
    return (
        sys.stdout.isatty()
        and (os.environ.get("COLORTERM", "").lower() in ("truecolor", "24bit")
             or "256color" in os.environ.get("TERM", "")
             or os.environ.get("TERM", "").startswith("xterm")
             or os.environ.get("TERM", "").startswith("screen")
             or os.environ.get("TERM", "").startswith("tmux")
             or os.environ.get("TERM_PROGRAM", ""))
    )


def _fg(rgb: tuple[int, int, int]) -> str:
    return f"\x1b[38;2;{rgb[0]};{rgb[1]};{rgb[2]}m"


def _reset() -> str:
    return "\x1b[0m"


def _hide_cursor() -> None: sys.stdout.write("\x1b[?25l"); sys.stdout.flush()
def _show_cursor() -> None: sys.stdout.write("\x1b[?25h"); sys.stdout.flush()


def banner(fast: bool = False) -> None:
    """Print the IONITY banner. fast=True skips the sweep animation."""
    if not _truecolor_supported():
        # Mono fallback.
        for ln in LOGO: print(ln)
        print(); print(TAGLINE); print(); return

    width = shutil.get_terminal_size((80, 24)).columns
    pad   = " " * max(0, (width - max(len(l) for l in LOGO)) // 2)

    _hide_cursor()
    try:
        # Sweep: each row from BLUE to AZURE to WHITE.
        steps = 12 if not fast else 1
        for k in range(steps):
            sys.stdout.write("\x1b[H\x1b[J")  # clear
            print()
            for i, line in enumerate(LOGO):
                t = (k / max(1, steps - 1) + i * 0.04) % 1.0
                rgb = _lerp3(BLUE, AZURE, t) if t < 0.5 else _lerp3(AZURE, WHITE, (t - 0.5) * 2)
                sys.stdout.write(pad + _fg(rgb) + line + _reset() + "\n")
            sys.stdout.write("\n" + pad + _fg(GREY) + TAGLINE + _reset() + "\n\n")
            sys.stdout.flush()
            if not fast:
                time.sleep(0.07)
    finally:
        _show_cursor()


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * max(0.0, min(1.0, t))


def _lerp3(a, b, t):
    return (int(_lerp(a[0], b[0], t)), int(_lerp(a[1], b[1], t)), int(_lerp(a[2], b[2], t)))


if __name__ == "__main__":
    banner("--fast" in sys.argv)
