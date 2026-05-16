import { useEffect, useMemo, useState } from "react";
import { api } from "../hooks/useApi";
import type { LibsManifest, LibCard } from "../types";

type Group = "all" | "rust" | "firmware" | "python" | "vendor" | "apps";

export function Libraries() {
  const [manifest, setManifest] = useState<LibsManifest | null>(null);
  const [group, setGroup] = useState<Group>("all");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<LibCard | null>(null);

  useEffect(() => {
    api<LibsManifest>("GET", "/api/libs").then(setManifest).catch(() => {});
  }, []);

  const items = useMemo(() => {
    if (!manifest) return [];
    const all: LibCard[] = [];
    if (group === "all" || group === "rust")     all.push(...manifest.rust);
    if (group === "all" || group === "vendor")   all.push(...manifest.vendor);
    if (group === "all" || group === "firmware") all.push(...manifest.firmware);
    if (group === "all" || group === "python")   all.push(...manifest.python);
    if (group === "all" || group === "apps")     all.push(...manifest.apps);
    const q = query.trim().toLowerCase();
    return q
      ? all.filter(it => `${it.name} ${it.description} ${it.path}`.toLowerCase().includes(q))
      : all;
  }, [manifest, group, query]);

  return (
    <>
      <header className="tab-head"><h2>Libraries · SDK</h2><p className="sub">Every shippable unit in the repo. Click a card to focus.</p></header>
      <div className="row gap" style={{ marginBottom: 14 }}>
        {(["all", "rust", "firmware", "python", "vendor", "apps"] as Group[]).map(g => (
          <button key={g} className={"btn xs" + (g === group ? " primary" : "")} onClick={() => setGroup(g)}>
            {g === "all" ? "all" : g === "rust" ? "Rust crates" : g === "firmware" ? "Firmware" :
             g === "python" ? "Python" : g === "vendor" ? "Vendor" : "Apps"}
          </button>
        ))}
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="filter…" style={{ maxWidth: 260, marginLeft: "auto" }} />
      </div>
      <div className="cards">
        {items.map(it => (
          <div key={it.path} className="card lib-card" onClick={() => setDetail(it)} style={{ cursor: "pointer" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <strong style={{ fontSize: 14, color: "#fff" }}>{it.name}</strong>
              <span className="chip">{it.stack}</span>
            </div>
            {it.version && <div className="dim mono" style={{ fontSize: 11, marginTop: 2 }}>v{it.version}</div>}
            <p style={{ marginTop: 8, fontSize: 13, color: "var(--paper-200)" }}>{it.description || "—"}</p>
            <div className="kv" style={{ fontSize: 11, border: 0, padding: "6px 0 0" }}>
              <span>path</span><span className="mono">{it.path}</span>
            </div>
          </div>
        ))}
        {!items.length && manifest && <div className="card"><p className="dim">no entries match.</p></div>}
      </div>
      {detail && (
        <div className="card accent" style={{ marginTop: 14 }}>
          <h3>{detail.name} <span className="chip">{detail.stack}</span>{detail.version && <span className="mono dim" style={{ marginLeft: 8, fontWeight: 400 }}>v{detail.version}</span>}</h3>
          <p style={{ color: "var(--paper-200)" }}>{detail.description || "—"}</p>
          <div className="kv"><span>path</span><span className="mono">{detail.path}</span></div>
          {detail.readme && <div className="kv"><span>readme</span><span className="mono">{detail.readme}</span></div>}
          {detail.kind && <div className="kv"><span>kind</span><span className="mono">{detail.kind}</span></div>}
          {detail.binaries && detail.binaries.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Binaries / artefacts</div>
              <ul className="mini">{detail.binaries.map((b, i) => (
                <li key={i} className="mono">{typeof b === "string" ? b : `${b.name} (${(b.size / 1024).toFixed(1)} KB)`}</li>
              ))}</ul>
            </div>
          )}
          <div className="row gap" style={{ marginTop: 14 }}>
            <button className="btn xs" onClick={() => setDetail(null)}>close</button>
          </div>
        </div>
      )}
    </>
  );
}
