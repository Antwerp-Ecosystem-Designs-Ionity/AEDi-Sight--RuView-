import { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../App";
import { api, usePolled } from "../hooks/useApi";

interface ServiceRow {
  id: string;
  name: string;
  kind: "long" | "oneshot";
  description: string;
  argv: string[];
  cwd: string | null;
  gate_ok: boolean;
  gate_reason: string;
  running: boolean;
  pid: number | null;
  started_at: number | null;
  stopped_at: number | null;
  rc: number | null;
  restart_count: number;
  health_ok: boolean | null;
  health_url: string | null;
}

interface Snapshot { services: ServiceRow[] }

export function Services() {
  const { ws } = useAppContext();
  const { data: snap, refresh } = usePolled<Snapshot>("/api/services", 2000);
  const [focused, setFocused] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, { line: string; cls: string; ts: string }[]>>({});

  // Stream service log lines onto a per-service ring buffer.
  useEffect(() => ws.subscribe<{ id: string; line: string; cls: string }>(
    "services",
    (m) => {
      const id = m.data?.id; if (!id) return;
      setLogs(prev => {
        const next = (prev[id] || []).slice(-200);
        next.push({ line: m.data.line || "", cls: m.data.cls || "",
                    ts: new Date().toISOString().slice(11, 19) });
        return { ...prev, [id]: next };
      });
    }
  ), [ws]);

  // When the focused service changes, pull the recent history from the server.
  useEffect(() => {
    if (!focused) return;
    api<{ lines: string[] }>("GET", `/api/services/${focused}/log`).then(d => {
      setLogs(prev => ({
        ...prev,
        [focused]: (d.lines || []).map(line => ({ line, cls: "", ts: "" })),
      }));
    }).catch(() => {});
  }, [focused]);

  async function op(sid: string, kind: "start" | "stop" | "restart") {
    try { await api("POST", `/api/services/${sid}/${kind}`); refresh(); }
    catch (e) { alert(String(e)); }
  }

  const long    = useMemo(() => (snap?.services || []).filter(s => s.kind === "long"),    [snap]);
  const oneshot = useMemo(() => (snap?.services || []).filter(s => s.kind === "oneshot"), [snap]);

  function StatusPill({ s }: { s: ServiceRow }) {
    if (!s.gate_ok) return <span className="chip dim" title={s.gate_reason}>unavailable</span>;
    if (s.running)  return <span className="chip ok">running · pid {s.pid}</span>;
    if (s.rc != null && s.rc !== 0) return <span className="chip err">exit {s.rc}</span>;
    if (s.rc === 0) return <span className="chip">done</span>;
    return <span className="chip dim">idle</span>;
  }

  function Row({ s }: { s: ServiceRow }) {
    const isFocused = focused === s.id;
    return (
      <div className="card" style={{ marginBottom: 10, cursor: "pointer",
                                     outline: isFocused ? "1px solid var(--azure)" : "none" }}
           onClick={() => setFocused(isFocused ? null : s.id)}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="row gap" style={{ alignItems: "center" }}>
              <strong style={{ color: "#fff", fontSize: 14 }}>{s.name}</strong>
              <StatusPill s={s} />
              {s.restart_count > 0 && <span className="chip warn">{s.restart_count} restarts</span>}
              {s.health_ok === true && <span className="chip ok">healthy</span>}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--paper-200)" }}>{s.description}</p>
            <div className="dim mono" style={{ fontSize: 11, marginTop: 4 }}>
              {s.argv.join(" ")}{s.cwd ? `   ·   cwd: ${s.cwd}` : ""}
            </div>
            {!s.gate_ok && <div className="dim" style={{ fontSize: 11, marginTop: 2, color: "var(--warn)" }}>
              gate: {s.gate_reason}
            </div>}
          </div>
          <div className="row gap" onClick={e => e.stopPropagation()}>
            {s.kind === "long" ? (
              <>
                <button className="btn xs primary" disabled={!s.gate_ok || s.running}
                        onClick={() => op(s.id, "start")}>start</button>
                <button className="btn xs"          disabled={!s.running}
                        onClick={() => op(s.id, "stop")}>stop</button>
                <button className="btn xs ghost"    disabled={!s.gate_ok}
                        onClick={() => op(s.id, "restart")}>restart</button>
              </>
            ) : (
              <button className="btn xs primary" disabled={!s.gate_ok || s.running}
                      onClick={() => op(s.id, "start")}>run</button>
            )}
          </div>
        </div>
        {isFocused && (
          <div onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 14 }}>Live log</h3>
            <pre className="log">
              {(logs[s.id] || []).map((l, i) => (
                <div key={i}>{l.ts && <span className="ts">{l.ts}</span>}<span className={l.cls}> {l.line}</span></div>
              ))}
              {(!logs[s.id] || logs[s.id].length === 0) &&
                <span className="dim">no output yet — start the service or click 'log' to refresh</span>}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <header className="tab-head">
        <h2>Services</h2>
        <p className="sub">Every shippable runtime in the repo — start, stop, monitor. The original Python ingest stays as the embedded sink; the Rust sensing-server, Tauri desktop, and Python v1 sink can run alongside or replace it.</p>
      </header>

      <div className="cards row" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3>Long-running</h3>
          <p className="dim" style={{ fontSize: 12 }}>Daemons. Start / stop / restart from the buttons below. Each row expands to show its live log when clicked.</p>
        </div>
        <div className="card">
          <h3>One-shot</h3>
          <p className="dim" style={{ fontSize: 12 }}>Builds, tests, witness bundles. Run once, watch the output, exit. Click "run".</p>
        </div>
      </div>

      <h3 style={{ marginTop: 8 }}>Long-running</h3>
      {long.length === 0 && <p className="dim">no long-running services registered.</p>}
      {long.map(s => <Row key={s.id} s={s} />)}

      <h3 style={{ marginTop: 24 }}>One-shot</h3>
      {oneshot.length === 0 && <p className="dim">no one-shot services registered.</p>}
      {oneshot.map(s => <Row key={s.id} s={s} />)}
    </>
  );
}
