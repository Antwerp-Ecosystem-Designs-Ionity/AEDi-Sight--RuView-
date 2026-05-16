import { useEffect, useState } from "react";
import { api } from "../hooks/useApi";
import type { RuViewItem, RuViewSnapshot } from "../types";

export function RuView() {
  const [snap, setSnap] = useState<RuViewSnapshot | null>(null);
  const [doc, setDoc]   = useState<{ path: string; markdown: string } | null>(null);
  useEffect(() => {
    api<RuViewSnapshot>("GET", "/api/ruview").then(setSnap).catch(() => {});
  }, []);

  async function openDoc(p: string) {
    try {
      const d = await api<{ path: string; markdown: string }>("GET", "/api/ruview/file?path=" + encodeURIComponent(p));
      setDoc(d);
    } catch {}
  }
  function ChipKind({ k }: { k: string }) {
    const cls = k === "command" ? "chip" : k === "skill" ? "chip ok" : "chip warn";
    return <span className={cls}>{k}</span>;
  }

  return (
    <>
      <header className="tab-head"><h2>RuView · plugin</h2><p className="sub"><code>/ruview-*</code> commands · skills · agents from <code>plugins/ruview/</code>.</p></header>
      <div className="cards row">
        <div className="card flex2">
          <h3>Commands · <code>/ruview-*</code></h3>
          <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {(snap?.commands || []).map(c => <Card key={c.path} item={c} onOpen={openDoc} />)}
            {(!snap?.commands?.length) && <p className="dim">no commands found</p>}
          </div>
        </div>
        <div className="card">
          <h3>Skills</h3>
          {(snap?.skills || []).map(s => <Row key={s.path} item={s} onOpen={openDoc} />)}
          {(!snap?.skills?.length) && <p className="dim">no skills found</p>}
        </div>
        <div className="card">
          <h3>Agents</h3>
          {(snap?.agents || []).map(a => <Row key={a.path} item={a} onOpen={openDoc} />)}
          {(!snap?.agents?.length) && <p className="dim">no agents found</p>}
        </div>
      </div>
      {doc && (
        <div className="card accent" style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ color: "#fff", fontSize: 13 }}>{doc.path}</strong>
            <button className="btn xs" onClick={() => setDoc(null)}>close</button>
          </div>
          <pre className="log term" style={{ maxHeight: "60vh" }}>{doc.markdown}</pre>
        </div>
      )}
    </>
  );

  function Card({ item, onOpen }: { item: RuViewItem; onOpen: (p: string) => void }) {
    return (
      <div className="card lib-card" onClick={() => onOpen(item.path)} style={{ padding: 12, cursor: "pointer" }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
          <strong style={{ fontSize: 13, color: "#fff" }}><code>/{item.name}</code></strong>
          <ChipKind k={item.kind} />
        </div>
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--paper-200)" }}>{(item.description || "").slice(0, 180)}</p>
        {item.argument_hint && <div className="dim mono" style={{ fontSize: 10.5, marginTop: 4 }}>{item.argument_hint}</div>}
      </div>
    );
  }
  function Row({ item, onOpen }: { item: RuViewItem; onOpen: (p: string) => void }) {
    return (
      <div className="lib-card" onClick={() => onOpen(item.path)} style={{ padding: "8px 4px", cursor: "pointer", borderBottom: "1px solid var(--rule)" }}>
        <strong style={{ fontSize: 12.5, color: "#fff" }}>{item.name}</strong>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--paper-300)" }}>{(item.description || "").slice(0, 140)}</p>
      </div>
    );
  }
}
