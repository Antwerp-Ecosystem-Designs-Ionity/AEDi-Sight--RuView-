export function About() {
  return (
    <>
      <header className="tab-head"><h2>About</h2></header>
      <div className="cards">
        <div className="card">
          <h3>AEDi-Sight RuView · IONITY edition</h3>
          <p>Cross-platform sensing console for the WiFi-CSI · ESP32-S3 TDMA mesh.</p>
          <div style={{ display: "flex", alignItems: "center", marginTop: 12, marginBottom: 12 }}>
            <img className="about-portrait" src="/static/img/brand/author-johan.svg" alt="Johan Wilhelm van Antwerp" />
            <div>
              <strong style={{ display: "block", color: "#fff" }}>Johan Wilhelm van Antwerp</strong>
              <span className="dim" style={{ fontSize: 12 }}>Author · IONITY · Antwerp Designs</span>
            </div>
          </div>
          <ul className="mini">
            <li>IONITY · <a href="https://www.ionity.today" target="_blank" rel="noreferrer">ionity.today</a> · <a href="https://ionity.world" target="_blank" rel="noreferrer">ionity.world</a></li>
            <li>Antwerp Designs · 2018 – 2026</li>
            <li>Theme · BLUE · WHITE · BLACK</li>
          </ul>
          <p className="dim">All rights reserved · Policy 986 AED licence · 900 / 990 AED · MIT where applicable.</p>
        </div>
        <div className="card">
          <h3>Stack</h3>
          <ul className="mini">
            <li>Frontend · React 18 · TypeScript · Vite</li>
            <li>Backend · Python 3 · aiohttp · websockets · pyserial · scipy</li>
            <li>ESP32 firmware · pre-built (<code>firmware/esp32-csi-node/release_bins/</code>)</li>
            <li>Sink protocol · ADR-018 binary CSI · UDP :5005</li>
          </ul>
        </div>
      </div>
    </>
  );
}
