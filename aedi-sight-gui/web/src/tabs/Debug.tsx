import { useEffect, useRef, useState } from "react";
import { useAppContext } from "../App";
import { api, usePolled } from "../hooks/useApi";
import type { SerialPort, SinkStats } from "../types";

interface NvsKey { offset: number; raw_hex: string; ascii: string }
interface NvsParse { size?: number; keys?: Record<string, NvsKey>; error?: string }

export function Debug() {
  const { ws } = useAppContext();
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [port,  setPort]  = useState<string>("");
  const [serialLines, setSerialLines] = useState<{ line: string; cls: string }[]>([]);
  const [nvs,    setNvs]    = useState<string>("");
  const preRef = useRef<HTMLPreElement>(null);
  const { data: stats } = usePolled<SinkStats>("/api/sink/stats", 1500);

  async function rescan() {
    try { const r = await api<SerialPort[]>("GET", "/api/serial-ports"); setPorts(r); if (r[0] && !port) setPort(r[0].device); }
    catch {}
  }
  useEffect(() => { rescan(); }, []);
  useEffect(() => ws.subscribe<{ line?: string; cls?: string }>("serial", m => {
    if (!m.data?.line) return;
    setSerialLines(l => [...l.slice(-600), { line: m.data.line!, cls: m.data.cls || "" }]);
  }), [ws]);
  useEffect(() => { preRef.current?.scrollTo({ top: preRef.current.scrollHeight }); }, [serialLines]);

  async function start() {
    try {
      const r = await api<{ ok: boolean; error?: string }>("POST", "/api/serial/start", { port, baud: 115200 });
      setSerialLines(l => [...l, { line: r.ok ? "monitor started" : `monitor failed: ${r.error}`, cls: r.ok ? "ok" : "err" }]);
    } catch (e) { setSerialLines(l => [...l, { line: String(e), cls: "err" }]); }
  }
  async function stop() { try { await api("POST", "/api/serial/stop", {}); } catch {} }

  async function dumpNvs() {
    if (!port) { alert("select a port first"); return; }
    setNvs("→ NVS dump from " + port + " …");
    try {
      await api("POST", "/api/nvs/dump", { port });
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 500));
        const d = await api<NvsParse>("GET", "/api/nvs/parse");
        if (!d.error) { renderNvs(d); return; }
      }
      setNvs("NVS file not produced — see Serial log for esptool errors.");
    } catch (e) { setNvs(String(e)); }
  }
  function renderNvs(d: NvsParse) {
    let txt = `NVS partition · ${d.size} B\n\n`;
    if (!d.keys || !Object.keys(d.keys).length) txt += "(no known keys found — may be unwritten)\n";
    for (const [k, v] of Object.entries(d.keys || {})) {
      txt += `${k.padEnd(14)} @0x${v.offset.toString(16).padStart(4, "0")}  hex=${v.raw_hex.slice(0, 40)}…  ascii=${v.ascii.slice(0, 32)}\n`;
    }
    setNvs(txt);
  }
  async function refreshNvs() {
    const d = await api<NvsParse>("GET", "/api/nvs/parse"); renderNvs(d);
  }

  return (
    <>
      <header className="tab-head"><h2>Debug</h2><p className="sub">ESP32 serial monitor (live), NVS dump &amp; parse, sink counters.</p></header>
      <div className="cards">
        <div className="card">
          <h3>Serial monitor</h3>
          <div className="row gap" style={{ marginBottom: 10 }}>
            <select value={port} onChange={e => setPort(e.target.value)} style={{ maxWidth: 260 }}>
              {ports.length === 0 ? <option disabled>no ports</option> :
                ports.map(p => <option key={p.device} value={p.device}>{p.device}{p.description ? ` — ${p.description}` : ""}</option>)}
            </select>
            <button className="btn xs" onClick={rescan}>rescan</button>
            <button className="btn xs primary" onClick={start}>start</button>
            <button className="btn xs" onClick={stop}>stop</button>
          </div>
          <pre ref={preRef} className="log term">
            {serialLines.map((l, i) => <div key={i} className={l.cls}>{l.line}</div>)}
          </pre>
        </div>
        <div className="card">
          <h3>NVS partition · 0x9000 · 24 KiB</h3>
          <p className="dim" style={{ fontSize: 12 }}>Reads via esptool, parses known <code>csi_cfg</code> keys.</p>
          <div className="row gap">
            <button className="btn xs primary" onClick={dumpNvs}>dump &amp; parse</button>
            <button className="btn xs" onClick={refreshNvs}>re-parse cached</button>
          </div>
          <pre className="log">{nvs}</pre>
        </div>
        <div className="card">
          <h3>Sink counters</h3>
          <div className="kv"><span>Total frames</span><span>{stats?.total ?? "—"}</span></div>
          <div className="kv"><span>WS clients</span><span>{stats?.ws_clients ?? "—"}</span></div>
          <div className="kv"><span>Sink bound</span><span>{stats?.bind || "—"}</span></div>
        </div>
      </div>
    </>
  );
}
