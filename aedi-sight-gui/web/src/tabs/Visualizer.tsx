import { useEffect, useRef, useState } from "react";
import { useAppContext } from "../App";
import { usePolled } from "../hooks/useApi";
import type { CsiFrame, MlNode, SinkStats, VitalsPayload } from "../types";

interface NodeML  { state: string; score: number }
interface NodeVit { br: number | null; hr: number | null }

export function Visualizer() {
  const { ws } = useAppContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colRef    = useRef(0);
  const lastByNode = useRef<Record<number, number[]>>({});
  const mlByNode   = useRef<Record<string, NodeML>>({});
  const vitByNode  = useRef<Record<string, NodeVit>>({});
  const [mode,   setMode]   = useState<"amp" | "phase" | "diff">("amp");
  const [gain,   setGain]   = useState(1);
  const [nodeId, setNodeId] = useState<string>("");
  const [paused, setPaused] = useState(false);
  const { data: stats } = usePolled<SinkStats>("/api/sink/stats", 3000);

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs) return;
    const ctx = cvs.getContext("2d")!;
    ctx.fillStyle = "#02040a"; ctx.fillRect(0, 0, cvs.width, cvs.height);
  }, []);

  // Render CSI frames from the WS bus.
  useEffect(() => {
    return ws.subscribe<CsiFrame>("csi", (m) => {
      if (paused) return;
      const cvs = canvasRef.current; if (!cvs) return;
      const ctx = cvs.getContext("2d")!;
      const d = m.data;
      if (nodeId && String(d.node_id) !== nodeId) return;
      let series = d.amp || [];
      if (mode === "phase") series = d.phase || [];
      else if (mode === "diff") {
        const prev = lastByNode.current[d.node_id];
        if (prev && prev.length === series.length) series = series.map((v, i) => Math.abs(v - prev[i]));
        lastByNode.current[d.node_id] = (d.amp || []).slice();
      }
      if (!series.length) return;
      let scale = 1;
      if (mode === "phase") scale = 1 / Math.PI;
      else scale = 1 / Math.max(1e-3, ...series);
      const W = cvs.width, H = cvs.height;
      const rowH = Math.max(1, Math.floor(H / series.length));
      for (let i = 0; i < series.length; i++) {
        const v = (mode === "phase" ? (series[i] + Math.PI) * scale * 0.5 : series[i] * scale) * gain;
        ctx.fillStyle = ramp(v);
        ctx.fillRect(colRef.current, i * rowH, 1, rowH);
      }
      colRef.current = (colRef.current + 1) % W;
      ctx.fillStyle = "#3a8bff";
      ctx.fillRect((colRef.current + 1) % W, 0, 1, H);
    });
  }, [ws, mode, gain, nodeId, paused]);

  // Track ML state + vitals for the overlay.
  useEffect(() => ws.subscribe<MlNode & { kind?: string; node_id?: number; state?: string; score?: number }>("ml", (m) => {
    const d = m.data as { kind?: string; node_id?: number; state?: string; score?: number };
    if (d?.kind === "status" && d.node_id !== undefined) {
      mlByNode.current[String(d.node_id)] = { state: d.state || "—", score: d.score || 0 };
    }
  }), [ws]);
  useEffect(() => ws.subscribe<VitalsPayload>("vitals", (m) => {
    const d = m.data;
    if (d.node_id === undefined) return;
    vitByNode.current[String(d.node_id)] = { br: d.breathing_bpm, hr: d.heart_rate_bpm };
  }), [ws]);

  // Repaint overlay every 500 ms.
  useEffect(() => {
    const t = setInterval(() => {
      const cvs = canvasRef.current; if (!cvs) return;
      const ctx = cvs.getContext("2d")!;
      ctx.save();
      ctx.clearRect(0, 0, 360, 92);
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(8, 8, 344, 84);
      ctx.strokeStyle = "rgba(58,139,255,0.55)"; ctx.strokeRect(8.5, 8.5, 343, 83);
      ctx.font = "11px ui-monospace, JetBrains Mono, monospace";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#3a8bff";
      ctx.fillText("LIVE PER-NODE  ·  ML  /  VITALS", 18, 14);
      const ids = Array.from(new Set([...Object.keys(mlByNode.current), ...Object.keys(vitByNode.current)])).sort();
      if (!ids.length) {
        ctx.fillStyle = "#8a96aa"; ctx.fillText("waiting for frames…", 18, 32);
      } else {
        let y = 30;
        for (const id of ids.slice(0, 4)) {
          const ml  = mlByNode.current[id]  || { state: "—", score: 0 };
          const vit = vitByNode.current[id] || { br: null, hr: null };
          const stCol = ml.state === "spike"  ? "#ff5470"
                       : ml.state === "moving" ? "#ffb547"
                       : ml.state === "idle"   ? "#28d68a" : "#8a96aa";
          ctx.fillStyle = "#c8d3e6"; ctx.fillText(`#${id}`, 18, y);
          ctx.fillStyle = stCol;
          ctx.fillText(`${ml.state.padEnd(11)} ${ml.score.toFixed(2).padStart(5)}σ`, 44, y);
          ctx.fillStyle = "#c8d3e6";
          const br = vit.br != null ? `BR ${vit.br.toFixed(1)}` : "BR —";
          const hr = vit.hr != null ? `HR ${vit.hr.toFixed(0)}` : "HR —";
          ctx.fillText(`${br}   ${hr}`, 200, y);
          y += 14;
        }
      }
      ctx.restore();
    }, 500);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <header className="tab-head"><h2>Visualizer</h2><p className="sub">CSI subcarrier waterfall · amplitude per subcarrier · most recent 1024 frames.</p></header>
      <div className="cards">
        <div className="card pad0">
          <canvas ref={canvasRef} width={1024} height={384} />
        </div>
        <div className="card row gap">
          <label>Node
            <select value={nodeId} onChange={e => setNodeId(e.target.value)}>
              <option value="">all</option>
              {Object.keys(stats?.nodes || {}).sort().map(id => <option key={id} value={id}>#{id}</option>)}
            </select>
          </label>
          <label>Mode
            <select value={mode} onChange={e => setMode(e.target.value as "amp" | "phase" | "diff")}>
              <option value="amp">amplitude</option>
              <option value="phase">phase</option>
              <option value="diff">amp Δ</option>
            </select>
          </label>
          <label>Gain <input type="range" min={0.2} max={4} step={0.1} value={gain} onChange={e => setGain(Number(e.target.value))} /></label>
          <button className="btn xs" onClick={() => setPaused(!paused)}>{paused ? "resume" : "pause"}</button>
        </div>
      </div>
    </>
  );
}

function ramp(v01: number) {
  const v = Math.max(0, Math.min(1, v01));
  const r = Math.round( 10 + 245 * Math.pow(v, 1.5));
  const g = Math.round( 30 + 225 * Math.pow(v, 1.2));
  const b = Math.min(255, Math.round(150 + 105 * Math.pow(v, 0.7)));
  return `rgb(${r},${g},${b})`;
}
