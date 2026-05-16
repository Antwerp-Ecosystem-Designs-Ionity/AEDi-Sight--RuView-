// Server contract types — match what the Python backend returns.

export interface Status {
  version: string;
  uptime_s: number;
  host_ip: string;
  host_ssid: string | null;
  host_channel: number | null;
  sink_listening: boolean;
  sink_bind: string | null;
  sink_total: number;
  sink_fps: number;
  ws_clients: number;
  esp32_serial: string | null;
  nodes_seen: number;
}

export interface NodeStats {
  source: string;
  frames: number;
  rssi: number | null;
  last_seq: number | null;
  last_seen: number;
  rate: number;
}
export interface SinkStats {
  bind: string | null;
  total: number;
  nodes: Record<string, NodeStats>;
  last_seen: number;
  ws_clients: number;
}

export interface CsiFrame {
  node_id: number;
  freq_hz: number;
  seq: number;
  rssi: number;
  noise: number;
  n_ant: number;
  n_sc: number;
  amp: number[];
  phase: number[];
}

export interface VitalsPayload {
  node_id: number;
  fs: number;
  samples: number;
  window_s: number;
  breathing_bpm: number | null;
  breathing_conf: number;
  heart_rate_bpm: number | null;
  heart_rate_conf: number;
}

export type MlState = "calibrating" | "idle" | "moving" | "spike";
export interface MlNode {
  state: MlState | string;
  score: number;
  samples: number;
  rssi: number | null;
  since: number;
}
export interface MlSnapshot {
  enabled: boolean;
  calib_frames: number;
  move_thresh: number;
  spike_thresh: number;
  nodes: Record<string, MlNode>;
}

export interface SerialPort { device: string; description: string; hwid: string; manufacturer?: string; vid?: string; pid?: string }

export interface ToolGroup {
  title: string;
  desc: string;
  items: { id: string; label: string }[];
}

export interface LibsManifest {
  rust: LibCard[];
  vendor: LibCard[];
  firmware: LibCard[];
  python: LibCard[];
  apps: LibCard[];
  repo_root: string;
}
export interface LibCard {
  name: string;
  version?: string;
  description: string;
  path: string;
  readme?: string | null;
  binaries?: (string | { name: string; size: number; path: string })[];
  stack: string;
  kind?: string;
}

export interface RuViewItem {
  name: string;
  kind: string;
  description: string;
  argument_hint?: string;
  path: string;
}
export interface RuViewSnapshot {
  commands: RuViewItem[];
  skills: RuViewItem[];
  agents: RuViewItem[];
}

export interface FleetNode {
  node_id: number;
  status: "live" | "stale" | "lost" | "absent";
  last_seen: number | null;
  rssi: number | null;
}
export interface FleetSnapshot { nodes: Record<string, FleetNode> }

export interface BusMessage<T = unknown> { topic: string; data: T }
