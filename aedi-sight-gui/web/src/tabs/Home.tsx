import { useAppContext } from "../App";

export function Home() {
  const { status } = useAppContext();
  return (
    <>
      <div className="hero">
        <img className="hero-logo-real"
             src="/static/img/brand/logo-white.svg"
             alt="IONITY"
             draggable={false} />
        <span className="hero-eyebrow"><span className="status-dot on" />AEDi-Sight RuView · live console</span>
        <h1>Sensing without cameras.</h1>
        <p className="lead">8-node ESP32-S3 TDMA mesh · channel-state radar · pose, breathing, heartbeat, presence — all from the WiFi already in the room. This is the control surface: provision, observe, analyse, update.</p>
        <div className="quick">
          <a className="btn primary lg" href="#provision">Provision a node</a>
          <a className="btn lg"         href="#visualizer">Open visualizer</a>
          <a className="btn ghost lg"   href="#ml">Live ML · vitals</a>
          <a className="btn ghost lg"   href="#chat">Chat with Claude</a>
        </div>
        <div className="meta">
          <MetaTile num={`${status?.nodes_seen ?? 0}/8`}        lbl="nodes live" />
          <MetaTile num={(status?.sink_fps ?? 0).toFixed(1)}    lbl="fps · sink" />
          <MetaTile num={status?.host_ip || "—"}                lbl="host ip" mono />
          <MetaTile num={status?.host_ssid || "—"}              lbl="wifi ssid" mono />
        </div>
        <img className="hero-deco"
             src="/static/img/brand/aedi-logo.svg"
             alt=""
             aria-hidden="true"
             draggable={false}
             style={{ width: 360, opacity: 0.32 }} />
      </div>
      <div className="cards">
        <Card title="Sensing pipeline">
          <ol className="mini">
            <li>ESP32 captures CSI in promiscuous mode (192 subcarriers @ ch 11).</li>
            <li>Frame serialized to <code>ADR-018</code> binary (20 B header + I/Q int8).</li>
            <li>UDP <code>:5005</code> → asyncio sink → fans out to ML + vitals + WS bus.</li>
            <li>Browser renders waterfall + per-node state badge.</li>
          </ol>
        </Card>
        <Card title="Mesh multiplex"><p>Each node owns one of <code>tdm_slot 0..7</code> in an 8-slot cycle (≈ 4 ms TX + 30 ms processing). Per-slot one node transmits and seven receive; over the full cycle every node does both. The <em>Provision</em> tab auto-suggests the next free slot.</p></Card>
        <Card title="Live inference"><p>Welford running mean &amp; variance per subcarrier; Mahalanobis-distance motion score; <code>scipy.signal.welch</code> picks BR &amp; HR peaks. All on the live UDP stream — no recordings, no simulation. State lights up the visualizer overlay.</p></Card>
        <Card title="Self-healing"><p>Per-node heartbeat watchdog flags <span className="chip warn">stale</span> &gt; 8 s and <span className="chip err">lost</span> &gt; 30 s. After 90 s lost it probes the ESP32's OTA endpoint; the <em>Sink</em> tab's per-row <code>reflash</code> button pushes the prebuilt firmware on demand.</p></Card>
      </div>
    </>
  );
}

function MetaTile({ num, lbl, mono }: { num: string; lbl: string; mono?: boolean }) {
  return (
    <div className="meta-item">
      <span className={"meta-num" + (mono ? " mono" : "")}>{num}</span>
      <span className="meta-lbl">{lbl}</span>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
