"""Entry point for `python -m aedi_sight`.

Args:
  --host HOST        bind interface (default 0.0.0.0)
  --port PORT        HTTP port (default 8088)
  --no-banner        skip the ANSI splash
  --open-browser     try to xdg-open / start / open the URL after binding
  --watchdog         run under a self-supervising loop (auto-restart on crash)
"""
from __future__ import annotations
import argparse, os, sys, time, signal, subprocess, threading, webbrowser, logging

from .ansi    import banner
from .config  import SETTINGS, host_ip
from .server  import serve


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="aedi-sight", description="AEDi-Sight RuView console")
    ap.add_argument("--host", default=SETTINGS.host)
    ap.add_argument("--port", type=int, default=SETTINGS.port)
    ap.add_argument("--udp-port", type=int, default=SETTINGS.udp_port)
    ap.add_argument("--no-banner", action="store_true")
    ap.add_argument("--open-browser", action="store_true")
    ap.add_argument("--watchdog", action="store_true",
                    help="Re-spawn the server on any non-zero exit (max ~10/min).")
    return ap.parse_args()


def _open_browser(url: str) -> None:
    # Detached, non-fatal.
    def _go():
        time.sleep(0.8)
        try: webbrowser.open(url, new=1)
        except Exception: pass
    threading.Thread(target=_go, daemon=True).start()


def _supervise(argv_no_watchdog: list[str]) -> int:
    """Run the server in a child process; relaunch on crash with backoff."""
    delay = 1.0
    while True:
        rc = subprocess.call([sys.executable, "-m", "aedi_sight", *argv_no_watchdog])
        if rc == 0:
            return 0
        logging.warning("aedi-sight exited rc=%s; restart in %.1fs", rc, delay)
        time.sleep(delay)
        delay = min(30.0, delay * 1.6)


def main() -> None:
    args = parse_args()
    SETTINGS.host = args.host
    SETTINGS.port = args.port
    SETTINGS.udp_port = args.udp_port

    if args.watchdog:
        argv = [a for a in sys.argv[1:] if a != "--watchdog"]
        sys.exit(_supervise(argv))

    if not args.no_banner:
        banner(fast=not sys.stdout.isatty())

    url = f"http://{'localhost' if args.host in ('0.0.0.0', '::') else args.host}:{args.port}"
    print(f"  → web UI :: {url}")
    print(f"  → udp :: 0.0.0.0:{args.udp_port}  (ADR-018 CSI ingest)")
    print(f"  → host :: {host_ip()}")
    print(f"  → repo :: {SETTINGS.repo_root}")
    print()
    if args.open_browser:
        _open_browser(url)

    try:
        serve(args.host, args.port)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
