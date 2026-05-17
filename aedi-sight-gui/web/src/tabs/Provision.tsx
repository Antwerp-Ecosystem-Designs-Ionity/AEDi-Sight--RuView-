import { useEffect, useState } from "react";
import { useAppContext } from "../App";
import { api, usePolled } from "../hooks/useApi";
import type { SerialPort, FleetSnapshot } from "../types";

interface FormState {
  port: string; ssid: string; password: string;
  target_ip: string; target_port: string;
  node_id: string; tdm_slot: string; tdm_total: string;
  channel: string; edge_tier: string;
  filter_mac: string; flash_firmware: boolean;
  firmware_variant: "8mb" | "4mb";
}

const initialForm: FormState = {
  port: "", ssid: "", password: "",
  target_ip: "", target_port: "5005",
  node_id: "0", tdm_slot: "0", tdm_total: "8",
  channel: "11", edge_tier: "0",
  filter_mac: "", flash_firmware: false,
  firmware_variant: "8mb",
};

export function Provision() {
  const { status, ws } = useAppContext();
  const [form, setForm] = useState<FormState>(initialForm);
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [log,   setLog]   = useState<{ line: string; cls: string; ts: string }[]>([]);
  const { data: fleet, refresh: refreshFleet } = usePolled<FleetSnapshot>("/api/fleet", 4000);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  async function rescan() {
    try {
      const p = await api<SerialPort[]>("GET", "/api/serial-ports");
      setPorts(p);
      if (p[0] && !form.port) setField("port", p[0].device);
    } catch {}
  }

  // Auto-pickup defaults from host status (run once on mount + on status change).
  useEffect(() => {
    if (!status) return;
    setForm(f => ({
      ...f,
      target_ip: f.target_ip || status.host_ip || "",
      ssid:      f.ssid      || status.host_ssid || "",
      channel:   f.channel   || (status.host_channel ? String(status.host_channel) : ""),
    }));
  }, [status?.host_ip, status?.host_ssid, status?.host_channel]);

  useEffect(() => { rescan(); }, []);

  // Subscribe to 'provision' topic for live job output.
  useEffect(() => {
    return ws.subscribe<{ line: string; cls: string }>("provision", (m) => {
      setLog(l => [...l.slice(-400), {
        line: m.data.line, cls: m.data.cls || "",
        ts: new Date().toISOString().slice(11, 19),
      }]);
    });
  }, [ws]);

  // When the node-id selector changes, pre-fill from persisted settings.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{ nodes: Record<string, Partial<FormState>> }>("GET", "/api/fleet/state");
        if (cancelled) return;
        const saved = r.nodes?.[form.node_id];
        if (saved) {
          setForm(f => ({
            ...f,
            target_port: String(saved.target_port ?? f.target_port),
            tdm_slot: String(saved.tdm_slot ?? f.tdm_slot),
            tdm_total: String(saved.tdm_total ?? f.tdm_total),
            edge_tier: String(saved.edge_tier ?? f.edge_tier),
            filter_mac: String(saved.filter_mac ?? f.filter_mac),
          }));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [form.node_id]);

  function nextFreeNodeId(): number | null {
    const used = new Set<number>();
    Object.values(fleet?.nodes || {}).forEach(n => {
      if (n.status === "live") used.add(n.node_id);
    });
    for (let i = 0; i < 8; i++) if (!used.has(i)) return i;
    return null;
  }
  function planFleet() {
    const n = nextFreeNodeId();
    if (n != null) {
      setField("node_id", String(n));
      setField("tdm_slot", String(n));
      appendLog(`fleet plan: next id/slot = ${n}`, "info");
    } else appendLog("fleet plan: all 8 slots present", "ok");
  }

  function appendLog(line: string, cls = "") {
    setLog(l => [...l.slice(-400), { line, cls, ts: new Date().toISOString().slice(11, 19) }]);
  }

  async function submit(dryRun: boolean) {
    const body = {
      port: form.port, ssid: form.ssid, password: form.password,
      target_ip: form.target_ip, target_port: Number(form.target_port),
      node_id: Number(form.node_id), tdm_slot: Number(form.tdm_slot), tdm_total: Number(form.tdm_total),
      edge_tier: Number(form.edge_tier),
      ...(form.channel ? { channel: Number(form.channel) } : {}),
      ...(form.filter_mac ? { filter_mac: form.filter_mac } : {}),
      flash_firmware: form.flash_firmware,
      firmware_variant: form.firmware_variant,
      dry_run: dryRun,
    };
    appendLog(`→ POST /api/provision ${dryRun ? "(dry-run)" : ""} node=${body.node_id} slot=${body.tdm_slot}/${body.tdm_total}`, "info");
    try {
      const d = await api<{ job_id: string }>("POST", "/api/provision", body);
      appendLog(`job ${d.job_id} accepted, streaming...`, "ok");
      refreshFleet();
    } catch (e) {
      appendLog(String(e), "err");
    }
  }

  function formatAgo(ts: number | null) {
    if (!ts) return "—";
    const d = Date.now()/1000 - ts;
    if (d < 5) return "now";
    if (d < 60) return `${d|0}s ago`;
    if (d < 3600) return `${(d/60)|0}m ago`;
    return `${(d/3600)|0}h ago`;
  }

  return (
    <>
      <header className="tab-head">
        <h2>Provision a node</h2>
        <p className="sub">Two-step: <em>flash firmware once</em>, then <em>write NVS config</em>. Re-running NVS write replaces the whole <code>csi_cfg</code> namespace (issue #391).</p>
      </header>
      <div className="grid-2col">
        <form className="form" onSubmit={e => { e.preventDefault(); submit(false); }}>
          <fieldset>
            <legend>Serial</legend>
            <label>Port
              <select value={form.port} onChange={e => setField("port", e.target.value)}>
                {ports.length === 0 ? <option disabled>no ports — connect an ESP32</option> :
                  ports.map(p => <option key={p.device} value={p.device}>{p.device}{p.description ? ` — ${p.description}` : ""}</option>)}
              </select>
              <button type="button" className="btn xs" onClick={rescan} style={{ marginTop: 6 }}>rescan</button>
            </label>
            <label className="row">
              <input type="checkbox" checked={form.flash_firmware} onChange={e => setField("flash_firmware", e.target.checked)} />
              <span>Also flash firmware (one-time per device)</span>
            </label>
            <label>Firmware variant
              <select value={form.firmware_variant} onChange={e => setField("firmware_variant", e.target.value as "8mb" | "4mb")}>
                <option value="8mb">8 MB (full features — recommended)</option>
                <option value="4mb">4 MB (compact, no display task)</option>
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>Wi-Fi · Sink</legend>
            <label>SSID <input value={form.ssid} onChange={e => setField("ssid", e.target.value)} required autoComplete="off" /></label>
            <label>Password <input value={form.password} onChange={e => setField("password", e.target.value)} type="password" required autoComplete="off" /></label>
            <label>Sink IP <input value={form.target_ip} onChange={e => setField("target_ip", e.target.value)} required /></label>
            <label>Sink port <input value={form.target_port} onChange={e => setField("target_port", e.target.value)} type="number" required /></label>
            <label>Channel
              <select value={form.channel} onChange={e => setField("channel", e.target.value)}>
                <option value="1">1 (2.412 GHz)</option>
                <option value="6">6 (2.437 GHz)</option>
                <option value="11">11 (2.462 GHz)</option>
                <option value="">auto (no override)</option>
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>Mesh · multiplex</legend>
            <label>Node ID
              <select value={form.node_id} onChange={e => setField("node_id", e.target.value)}>
                {Array.from({ length: 8 }).map((_, i) => <option key={i} value={String(i)}>{i}</option>)}
              </select>
            </label>
            <label>TDM slot
              <select value={form.tdm_slot} onChange={e => setField("tdm_slot", e.target.value)}>
                {Array.from({ length: 8 }).map((_, i) => <option key={i} value={String(i)}>{i}</option>)}
              </select>
            </label>
            <label>TDM total <input value={form.tdm_total} onChange={e => setField("tdm_total", e.target.value)} type="number" min={2} max={32} /></label>
            <label>Edge tier
              <select value={form.edge_tier} onChange={e => setField("edge_tier", e.target.value)}>
                <option value="0">0 · raw passthrough (recommended)</option>
                <option value="1">1 · stats</option>
                <option value="2">2 · vitals</option>
              </select>
            </label>
            <label>Filter MAC (optional) <input value={form.filter_mac} onChange={e => setField("filter_mac", e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" /></label>
          </fieldset>

          <div className="form-actions">
            <button type="submit" className="btn primary">Provision node</button>
            <button type="button" className="btn ghost" onClick={() => submit(true)}>Dry-run (build NVS only)</button>
            <button type="button" className="btn ghost" onClick={planFleet}>Plan fleet (0 → 7)</button>
          </div>
        </form>

        <div className="form-side">
          <div className="card">
            <h3>Fleet status</h3>
            <table className="fleet">
              <thead><tr><th>#</th><th>Status</th><th>Last seen</th><th>RSSI</th></tr></thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => {
                  const row = fleet?.nodes?.[i] ?? { node_id: i, status: "absent", last_seen: null, rssi: null };
                  const cls = row.status === "live" ? "ok" : row.status === "stale" ? "warn" : "err";
                  return (
                    <tr key={i}>
                      <td className="mono">#{i}</td>
                      <td className={cls}>{row.status}</td>
                      <td className="mono">{formatAgo(row.last_seen)}</td>
                      <td className="mono">{row.rssi != null ? `${row.rssi} dBm` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Live log</h3>
            <pre className="log">
              {log.map((l, i) => (
                <div key={i}><span className="ts">{l.ts}</span> <span className={l.cls}>{l.line}</span></div>
              ))}
            </pre>
          </div>
        </div>
      </div>
    </>
  );
}
