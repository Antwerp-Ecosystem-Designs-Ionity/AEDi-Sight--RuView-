"""Provisioning helpers.

Wraps:
  - `python -m esptool ... write_flash` (firmware flash, optional)
  - `<repo>/firmware/esp32-csi-node/provision.py` (NVS write, always)

Returns a JobSpec ready to feed into JobRunner.
"""
from __future__ import annotations
import sys
from pathlib import Path
from typing import Optional

from .config import SETTINGS
from .jobs import JobSpec


def list_serial_ports() -> list[dict]:
    try:
        from serial.tools import list_ports
    except Exception:
        return []
    out = []
    for p in list_ports.comports():
        out.append({
            "device":      p.device,
            "description": p.description or "",
            "hwid":        p.hwid or "",
            "manufacturer": getattr(p, "manufacturer", "") or "",
            "vid":         hex(p.vid) if p.vid else "",
            "pid":         hex(p.pid) if p.pid else "",
        })
    # Prefer ESP-looking ports first.
    out.sort(key=lambda p: ("espressif" not in (p["description"] + p["manufacturer"]).lower(),
                            "ttyACM" not in p["device"]))
    return out


def _validate(body: dict) -> tuple[Optional[dict], Optional[str]]:
    REQ = ["port", "ssid", "password", "target_ip", "node_id", "tdm_slot", "tdm_total"]
    miss = [k for k in REQ if not body.get(k) and body.get(k) != 0]
    if miss:
        return None, f"missing required field(s): {', '.join(miss)}"
    try:
        nid  = int(body["node_id"])
        slot = int(body["tdm_slot"])
        tot  = int(body["tdm_total"])
        if not (0 <= nid <= 7 and 0 <= slot < tot and 2 <= tot <= 32):
            return None, "node_id 0..7, tdm_slot 0..(tdm_total-1), tdm_total 2..32"
    except ValueError:
        return None, "node_id / tdm_slot / tdm_total must be integers"
    port = body.get("target_port", 5005)
    try: port = int(port)
    except ValueError: return None, "target_port must be int"
    body["node_id"] = nid; body["tdm_slot"] = slot; body["tdm_total"] = tot; body["target_port"] = port
    return body, None


def _flash_argv(serial_port: str, variant: str = "8mb") -> list[list[str]]:
    bins = SETTINGS.release_bins
    # The 8 MB build uses bootloader.bin + partition-table.bin + ota_data_initial.bin + esp32-csi-node.bin.
    # The 4 MB build uses esp32-csi-node-4mb.bin + partition-table-4mb.bin (no OTA partition).
    if variant == "4mb":
        return [[
            sys.executable, "-m", "esptool", "--chip", "esp32s3",
            "--port", serial_port, "--baud", "460800",
            "write_flash",
            "0x0",     str(bins / "bootloader.bin"),
            "0x8000",  str(bins / "partition-table-4mb.bin"),
            "0x10000", str(bins / "esp32-csi-node-4mb.bin"),
        ]]
    # 8 MB (default)
    return [[
        sys.executable, "-m", "esptool", "--chip", "esp32s3",
        "--port", serial_port, "--baud", "460800",
        "write_flash",
        "0x0",     str(bins / "bootloader.bin"),
        "0x8000",  str(bins / "partition-table.bin"),
        "0xf000",  str(bins / "ota_data_initial.bin"),
        "0x20000", str(bins / "esp32-csi-node.bin"),
    ]]


def _nvs_argv(b: dict) -> list[str]:
    argv = [
        sys.executable, str(SETTINGS.provision_py),
        "--port",        b["port"],
        "--ssid",        b["ssid"],
        "--password",    b["password"],
        "--target-ip",   b["target_ip"],
        "--target-port", str(b["target_port"]),
        "--node-id",     str(b["node_id"]),
        "--tdm-slot",    str(b["tdm_slot"]),
        "--tdm-total",   str(b["tdm_total"]),
    ]
    if "channel" in b and b["channel"]:
        argv += ["--channel", str(b["channel"])]
    if "filter_mac" in b and b["filter_mac"]:
        argv += ["--filter-mac", str(b["filter_mac"])]
    if "edge_tier" in b and b["edge_tier"] not in (None, ""):
        argv += ["--edge-tier", str(b["edge_tier"])]
    if b.get("dry_run"):
        argv += ["--dry-run"]
    return argv


def build_spec(body: dict) -> tuple[Optional[JobSpec], Optional[str]]:
    body, err = _validate(body)
    if err:
        return None, err
    cmds: list[list[str]] = []
    if body.get("flash_firmware"):
        if not SETTINGS.release_bins.exists():
            return None, f"firmware bins missing at {SETTINGS.release_bins}"
        cmds += _flash_argv(body["port"], body.get("firmware_variant") or "8mb")
    if not SETTINGS.provision_py.exists():
        return None, f"provision.py missing at {SETTINGS.provision_py}"
    cmds.append(_nvs_argv(body))
    label = f"provision node_id={body['node_id']} tdm_slot={body['tdm_slot']}/{body['tdm_total']}"
    return JobSpec(cmd=cmds, cwd=str(SETTINGS.repo_root), topic="provision", label=label), None
