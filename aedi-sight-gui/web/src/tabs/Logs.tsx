import { useEffect, useRef, useState } from "react";
import { useAppContext } from "../App";
import { api } from "../hooks/useApi";

export function Logs() {
  const { ws } = useAppContext();
  const [lines, setLines] = useState<string[]>([]);
  const preRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    api<{ lines: string[] }>("GET", "/api/logs/recent").then(d => setLines(d.lines || [])).catch(() => {});
    return ws.subscribe<{ line?: string }>("log", m => {
      if (!m.data?.line) return;
      setLines(l => [...l.slice(-800), m.data.line!]);
    });
  }, [ws]);
  useEffect(() => { preRef.current?.scrollTo({ top: preRef.current.scrollHeight }); }, [lines]);
  return (
    <>
      <header className="tab-head"><h2>Logs</h2><p className="sub">Live tail of the app log.</p></header>
      <div className="card pad0"><pre ref={preRef} className="log term">{lines.join("\n")}</pre></div>
    </>
  );
}
