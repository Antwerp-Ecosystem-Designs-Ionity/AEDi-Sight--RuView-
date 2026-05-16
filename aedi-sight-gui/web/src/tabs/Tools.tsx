import { useEffect, useState } from "react";
import { api } from "../hooks/useApi";
import type { ToolGroup } from "../types";

interface Item { id: string; label: string }

export function Tools() {
  const [groups, setGroups] = useState<ToolGroup[]>([]);
  const [open, setOpen] = useState<Item | null>(null);
  const [helpText, setHelpText] = useState<string>("");
  const [args, setArgs] = useState<string>("");

  useEffect(() => { api<{ groups: ToolGroup[] }>("GET", "/api/tools").then(d => setGroups(d.groups || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return;
    setHelpText("loading…");
    api<{ help: string }>("GET", `/api/tools/help?id=${encodeURIComponent(open.id)}`)
      .then(d => setHelpText(d.help || "(no help / unknown script)"))
      .catch(() => setHelpText("(help unavailable)"));
  }, [open]);

  async function run() {
    if (!open) return;
    try { await api("POST", "/api/tools/run", { id: open.id, args }); setOpen(null); }
    catch (e) { alert(String(e)); }
  }

  return (
    <>
      <header className="tab-head"><h2>Tools</h2><p className="sub">Repo scripts and RuView slash-commands, click → modal with help preview + args input.</p></header>
      <div className="cards">
        {groups.map(g => (
          <div key={g.title} className="card">
            <h3>{g.title}</h3>
            <p className="dim" style={{ fontSize: 12 }}>{g.desc}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {g.items.map(it => <button key={it.id} className="btn xs" onClick={() => setOpen(it)} title={it.id}>{it.label}</button>)}
            </div>
          </div>
        ))}
      </div>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center",
                       background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
             onClick={e => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="card accent" style={{ width: "min(720px, 92vw)", maxHeight: "84vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <strong style={{ color: "#fff", fontSize: 14 }}>{open.label}</strong>
              <span className="chip dim mono">{open.id}</span>
            </div>
            <label style={{ marginBottom: 10 }}>
              Args (whitespace-split, no shell)
              <input value={args} onChange={e => setArgs(e.target.value)} placeholder="--flag value …" autoComplete="off" />
            </label>
            <h3>Help / source preview</h3>
            <pre className="log" style={{ maxHeight: 300 }}>{helpText}</pre>
            <div className="row gap" style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={run}>run</button>
              <button className="btn ghost" onClick={() => setOpen(null)}>cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
