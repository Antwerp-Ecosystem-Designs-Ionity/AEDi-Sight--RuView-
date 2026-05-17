import { useEffect, useState } from "react";
import { api } from "../hooks/useApi";

interface GitStatus { branch: string; head: string; head_subject: string; behind: number | null }

export function Updates() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [changelog, setChangelog] = useState<string>("");
  const [out, setOut] = useState<string>("");

  async function refresh() {
    try { setStatus(await api<GitStatus>("GET", "/api/git/status")); } catch {}
  }
  async function loadChangelog() {
    try { const d = await api<{ text: string }>("GET", "/api/changelog"); setChangelog(d.text || ""); } catch {}
  }
  useEffect(() => { refresh(); loadChangelog(); }, []);

  async function run(op: "pull" | "fetch" | "log") {
    const label = op === "pull" ? "git pull --rebase" : op === "fetch" ? "git fetch" : "git log -n 10";
    setOut(`→ ${label}…\n`);
    try {
      const r = await api<{ stdout: string; stderr: string }>("POST", `/api/git/${op}`);
      setOut(prev => prev + (r.stdout || "") + (r.stderr || ""));
      refresh();
    } catch (e) { setOut(prev => prev + "\nerror: " + e); }
  }

  return (
    <>
      <header className="tab-head"><h2>Updates</h2><p className="sub">Git status · pull · changelog · self-update.</p></header>
      <div className="cards">
        <div className="card">
          <h3>Repo</h3>
          <div className="kv"><span>Branch</span><span>{status?.branch || "—"}</span></div>
          <div className="kv"><span>HEAD</span><span>{status?.head ? `${status.head.slice(0, 8)} · ${status.head_subject || ""}` : "—"}</span></div>
          <div className="kv"><span>Behind</span><span>{status?.behind != null ? `${status.behind} commits` : "—"}</span></div>
          <div className="row gap">
            <button className="btn primary" onClick={() => run("pull")}>Pull updates</button>
            <button className="btn"         onClick={() => run("fetch")}>Fetch</button>
            <button className="btn ghost"   onClick={() => run("log")}>git log -n 10</button>
          </div>
          <pre className="log">{out}</pre>
        </div>
        <div className="card">
          <h3>CHANGELOG</h3>
          <pre className="log">{changelog}</pre>
        </div>
      </div>
    </>
  );
}
