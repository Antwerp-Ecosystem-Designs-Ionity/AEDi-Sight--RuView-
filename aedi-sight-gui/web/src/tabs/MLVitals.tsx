import { useEffect, useState } from "react";
import { useAppContext } from "../App";
import { api, usePolled } from "../hooks/useApi";
import { pushSparkValue, Sparkline } from "../lib/sparkline";
import type { MlSnapshot, VitalsPayload } from "../types";

export function MLVitals() {
  const { ws } = useAppContext();
  const { data: snap, refresh } = usePolled<MlSnapshot>("/api/ml/snapshot", 1500);
  const [models, setModels] = useState<{ name: string; size: number; mtime: number }[]>([]);
  const [jobLog, setJobLog] = useState<{ line: string; cls: string; ts: string }[]>([]);
  const [vitals, setVitals] = useState<Record<string, VitalsPayload>>({});

  useEffect(() => {
    api<{ models: typeof models }>("GET", "/api/ml/models").then(d => setModels(d.models || [])).catch(() => {});
  }, []);
  useEffect(() => ws.subscribe<VitalsPayload>("vitals", m => {
    if (m.data?.node_id == null) return;
    setVitals(v => ({ ...v, [String(m.data.node_id)]: m.data }));
  }), [ws]);
  useEffect(() => ws.subscribe<{ line?: string; cls?: string; kind?: string }>("ml", m => {
    if (m.data?.kind === "log" && m.data.line) {
      setJobLog(l => [...l.slice(-200), { line: m.data.line!, cls: m.data.cls || "", ts: new Date().toISOString().slice(11, 19) }]);
    }
  }), [ws]);

  // Sparkline channel updates per snapshot tick.
  useEffect(() => {
    if (!snap?.nodes) return;
    Object.entries(snap.nodes).forEach(([id, n]) => pushSparkValue(`mlscore-${id}`, n.score || 0));
  }, [snap]);

  async function infer(op: "start" | "stop" | "reset") {
    try { await api("POST", `/api/ml/infer/${op}`); refresh(); } catch {}
  }
  async function job(name: "contrastive" | "pose" | "benchmark") {
    setJobLog(l => [...l, { line: `→ start ${name}`, cls: "info", ts: new Date().toISOString().slice(11, 19) }]);
    try { const d = await api<{ job_id: string }>("POST", "/api/ml/job", { job: name });
      setJobLog(l => [...l, { line: `job ${d.job_id} accepted`, cls: "ok", ts: new Date().toISOString().slice(11, 19) }]);
    } catch (e) { setJobLog(l => [...l, { line: String(e), cls: "err", ts: new Date().toISOString().slice(11, 19) }]); }
  }

  return (
    <>
      <header className="tab-head">
        <h2>ML · Vitals</h2>
        <p className="sub">Welford mean + Mahalanobis-distance motion score · scipy.signal.welch for BR/HR. Live on every UDP frame.</p>
      </header>
      <div className="cards">
        <div className="card flex2">
          <h3>Live per-node state</h3>
          <table className="fleet">
            <thead><tr><th>Node</th><th>State</th><th>Score (σ)</th><th>BR · HR</th><th>RSSI</th><th>Samples</th></tr></thead>
            <tbody>
              {Object.entries(snap?.nodes || {}).sort(([a],[b]) => a.localeCompare(b)).map(([id, n]) => {
                const v = vitals[id];
                const chipClass = n.state === "spike" ? "chip err" : n.state === "moving" ? "chip warn"
                                : n.state === "idle"  ? "chip ok"  : "chip dim";
                const stColor = n.state === "spike" ? "#ff5470" : n.state === "moving" ? "#ffb547"
                              : n.state === "idle"  ? "#28d68a" : "#5e6779";
                return (
                  <tr key={id}>
                    <td className="mono">#{id}</td>
                    <td><span className={chipClass}>{n.state}</span></td>
                    <td>
                      <Sparkline channel={`mlscore-${id}`} stroke={stColor} />
                      <span className="mono" style={{ marginLeft: 6 }}>{(n.score || 0).toFixed(2)}σ</span>
                    </td>
                    <td className="mono">
                      {v?.breathing_bpm != null ? `BR ${v.breathing_bpm.toFixed(1)}` : "BR —"}
                      {" · "}
                      {v?.heart_rate_bpm != null ? `HR ${v.heart_rate_bpm.toFixed(0)}` : "HR —"}
                    </td>
                    <td className="mono">{n.rssi ?? "—"}</td>
                    <td className="mono">{n.samples}</td>
                  </tr>
                );
              })}
              {!snap?.nodes || !Object.keys(snap.nodes).length ? (
                <tr><td colSpan={6} className="dim">no nodes yet — power on a provisioned ESP32</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Inference control</h3>
          <div className="row gap">
            <button className="btn primary" onClick={() => infer("start")}>Start / resume</button>
            <button className="btn"         onClick={() => infer("stop")}>Pause</button>
            <button className="btn ghost"   onClick={() => infer("reset")}>Reset baseline</button>
          </div>
          <div className="kv"><span>Enabled</span><span>{snap?.enabled ? "yes" : "paused"}</span></div>
          <div className="kv"><span>Move thresh</span><span>{snap?.move_thresh ?? "—"}</span></div>
          <div className="kv"><span>Spike thresh</span><span>{snap?.spike_thresh ?? "—"}</span></div>
          <div className="kv"><span>Calib frames</span><span>{snap?.calib_frames ?? "—"}</span></div>
        </div>
        <div className="card">
          <h3>Models on disk</h3>
          <table className="fleet">
            <thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead>
            <tbody>
              {models.map(m => (
                <tr key={m.name}>
                  <td className="mono">{m.name}</td>
                  <td className="mono">{(m.size / 1024).toFixed(1)} KB</td>
                  <td className="mono">{m.mtime ? new Date(m.mtime * 1000).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {!models.length && <tr><td colSpan={3} className="dim">no models on disk yet</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Train jobs</h3>
          <div className="row gap">
            <button className="btn" onClick={() => job("contrastive")}>Contrastive pretrain</button>
            <button className="btn" onClick={() => job("pose")}>Pose head fine-tune</button>
            <button className="btn ghost" onClick={() => job("benchmark")}>Bench vital signs</button>
          </div>
          <pre className="log">{jobLog.map((l, i) =>
            <div key={i}><span className="ts">{l.ts}</span> <span className={l.cls}>{l.line}</span></div>)}
          </pre>
        </div>
      </div>
    </>
  );
}
