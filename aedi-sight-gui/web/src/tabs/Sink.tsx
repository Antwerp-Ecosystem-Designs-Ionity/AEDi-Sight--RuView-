import { useEffect } from "react";
import { api, usePolled } from "../hooks/useApi";
import { pushSparkValue, Sparkline } from "../lib/sparkline";
import type { SinkStats } from "../types";

export function Sink() {
  const { data: stats, refresh } = usePolled<SinkStats>("/api/sink/stats", 1000);

  useEffect(() => {
    if (!stats?.nodes) return;
    Object.entries(stats.nodes).forEach(([id, n]) => {
      pushSparkValue(`rate-${id}`, n.rate || 0);
      pushSparkValue(`rssi-${id}`, n.rssi ?? -100);
    });
  }, [stats]);

  async function op(name: "start" | "stop" | "reset") {
    try { await api("POST", `/api/sink/${name}`); refresh(); } catch {}
  }
  async function reflash(ip: string) {
    if (!confirm(`Reflash node at ${ip}?\nThis posts the prebuilt 8 MB firmware to http://${ip}:8032/ota and reboots the node.`)) return;
    try {
      const r = await api<{ rc: number; bytes_sent?: number; elapsed_s?: number; error?: string; body?: string }>(
        "POST", "/api/ota/reflash", { ip, variant: "8mb" });
      alert(r.rc === 0 ? `OK · ${r.bytes_sent} B in ${r.elapsed_s}s` : `Failed · ${r.error || r.body}`);
    } catch (e) { alert(String(e)); }
  }

  return (
    <>
      <header className="tab-head"><h2>Sink</h2><p className="sub">UDP :5005 ingest, ADR-018 frame parser, per-node stats.</p></header>
      <div className="cards row">
        <div className="card">
          <h3>Control</h3>
          <div className="row gap">
            <button className="btn primary" onClick={() => op("start")}>Start sink</button>
            <button className="btn"         onClick={() => op("stop")}>Stop</button>
            <button className="btn ghost"   onClick={() => op("reset")}>Reset stats</button>
          </div>
          <div className="kv"><span>Listening</span><span>{stats?.bind || "—"}</span></div>
          <div className="kv"><span>WS clients</span><span>{stats?.ws_clients ?? 0}</span></div>
          <div className="kv"><span>Frames seen</span><span>{stats?.total ?? 0}</span></div>
          <div className="kv"><span>Last frame</span><span>{stats?.last_seen ? new Date(stats.last_seen * 1000).toLocaleTimeString() : "—"}</span></div>
        </div>
        <div className="card flex2">
          <h3>Per-node</h3>
          <table className="fleet">
            <thead><tr><th>Node</th><th>Source</th><th>Frames</th><th>Rate</th><th>RSSI</th><th>Last seq</th><th>Last seen</th><th>OTA</th></tr></thead>
            <tbody>
              {Object.entries(stats?.nodes || {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, n]) => {
                const ip = (n.source || "").split(":")[0];
                return (
                  <tr key={id}>
                    <td className="mono">#{id}</td>
                    <td className="mono">{n.source || "—"}</td>
                    <td className="mono">{n.frames}</td>
                    <td>
                      <Sparkline channel={`rate-${id}`} stroke="#3a8bff" />
                      <span className="mono" style={{ marginLeft: 6 }}>{(n.rate || 0).toFixed(1)}</span>
                    </td>
                    <td>
                      <Sparkline channel={`rssi-${id}`} stroke="#28d68a" fillTop="rgba(40,214,138,0.35)" />
                      <span className="mono" style={{ marginLeft: 6 }}>{n.rssi ?? "—"}</span>
                    </td>
                    <td className="mono">{n.last_seq ?? "—"}</td>
                    <td className="mono">{n.last_seen ? new Date(n.last_seen * 1000).toLocaleTimeString() : "—"}</td>
                    <td>{ip && <button className="btn xs" onClick={() => reflash(ip)}>reflash</button>}</td>
                  </tr>
                );
              })}
              {Object.keys(stats?.nodes || {}).length === 0 && (
                <tr><td colSpan={8} className="dim">no nodes yet — provision one and power it on the same SSID</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
