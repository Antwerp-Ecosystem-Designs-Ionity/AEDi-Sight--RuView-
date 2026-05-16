import type { Status } from "../types";

export function Header({ status, wsConnected }: { status: Status | null; wsConnected: boolean }) {
  const fps = status?.sink_fps ?? 0;
  const dotClass = !status?.sink_listening ? "err"
                  : fps > 0.1 ? "on"
                  : "warn";
  return (
    <header className="app-header">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 48 48">
          <defs>
            <linearGradient id="bm-g" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#061a78" />
              <stop offset="1" stopColor="#3a8bff" />
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="22" fill="url(#bm-g)" opacity="0.18" />
          <circle cx="24" cy="24" r="20" fill="none" stroke="url(#bm-g)" strokeWidth="1.4" />
          <circle cx="24" cy="24" r="13" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.7" />
          <circle cx="24" cy="24" r="6"  fill="#fff" />
          <line x1="24" y1="3" x2="24" y2="45" stroke="#fff" strokeWidth="0.7" strokeDasharray="2 3" opacity="0.45" />
          <line x1="3"  y1="24" x2="45" y2="24" stroke="#fff" strokeWidth="0.7" strokeDasharray="2 3" opacity="0.45" />
        </svg>
        <div className="brand-text">
          <strong>AEDi-Sight RuView</strong>
          <span>IONITY · Antwerp Designs</span>
        </div>
      </div>
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
