import type { Status } from "../types";

export function Header({ status, wsConnected }: { status: Status | null; wsConnected: boolean }) {
  const fps = status?.sink_fps ?? 0;
  const dotClass = !status?.sink_listening ? "err"
                  : fps > 0.1 ? "on"
                  : "warn";
  return (
    <header className="app-header">
      <a className="brand" href="#home" aria-label="AEDi-Sight RuView — IONITY">
        <img className="brand-mark"
             src="/static/img/brand/ionity-logo.svg"
             alt=""
             width={40} height={40}
             loading="eager"
             decoding="async" />
        <div className="brand-text">
          <strong>AEDi-Sight RuView</strong>
          <span>IONITY · Antwerp Designs</span>
        </div>
      </a>
      <nav className="header-tabs" />
      <div className="header-status">
        <span className="pill"><span className={`status-dot ${dotClass}`} /><span>{fps.toFixed(1)} fps</span></span>
        <span className="pill"><span className="lbl">SSID</span>&nbsp;<span>{status?.host_ssid || "—"}</span></span>
        <span className="pill"><span className="lbl">IP</span>&nbsp;<span>{status?.host_ip || "—"}</span></span>
        <span className="pill"><span className="lbl">VER</span>&nbsp;<span>v{status?.version || "0.5"}</span></span>
        <span className="pill"><span className="lbl">WS</span>&nbsp;<span>{wsConnected ? "live" : "idle"}</span></span>
      </div>
    </header>
  );
}
