import { useEffect, useRef, useState } from "react";

/** Cinematic Canvas intro — same animation as the vanilla version, ported to React.
 * Phases over 2.2 s:
 *   0.0 – 0.9s   radar sweep + concentric rings
 *   0.45 – 1.05s 8 mesh nodes light up around the centre with links back
 *   0.25 – 1.35s central white core pulse
 *   1.0 – 1.6s   IONITY word lock + progress bar fill
 *   1.8 – 2.2s   fade out
 */
const DURATION = 2200;

export function Intro() {
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState("BOOT");
  const [progress, setProgress] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const cvs = cvsRef.current; if (!cvs) return;
    const dpr = window.devicePixelRatio || 1;
    const fit = () => {
      cvs.width  = cvs.clientWidth  * dpr;
      cvs.height = cvs.clientHeight * dpr;
      cvs.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit(); window.addEventListener("resize", fit);
    const ctx = cvs.getContext("2d")!;
    const t0 = performance.now();
    let probeFired = false;
    let raf = 0;

    const frame = (t: number) => {
      const elapsed = t - t0;
      const w = cvs.width / dpr, h = cvs.height / dpr;
      const cx = w / 2, cy = h / 2;
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
      bg.addColorStop(0, "rgba(10,29,90,0.55)");
      bg.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

      // Phase A — sweep
      const arm = (elapsed / 1100) * Math.PI * 2;
      ctx.strokeStyle = "rgba(58,139,255,0.18)";
      ctx.lineWidth = 1;
      [30, 70, 110, 150, 190, 230].forEach(r => {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      });
      const gc = ctx.createConicGradient(arm, cx, cy);
      gc.addColorStop(0.0,  "rgba(58,139,255,0.55)");
      gc.addColorStop(0.05, "rgba(58,139,255,0)");
      gc.addColorStop(1.0,  "rgba(58,139,255,0)");
      ctx.fillStyle = gc;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, Math.min(w, h) * 0.35, arm, arm + Math.PI / 1.6); ctx.closePath(); ctx.fill();

      // Phase B — 8 mesh nodes light up
      const ring = Math.min(w, h) * 0.28;
      for (let i = 0; i < 8; i++) {
        const reveal = clamp01((elapsed - 450 - i * 70) / 220);
        if (reveal <= 0) continue;
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * ring;
        const y = cy + Math.sin(a) * ring;
        const r = 4 + 8 * reveal;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, `rgba(58,139,255,${0.6 * reveal})`);
        g.addColorStop(1, "rgba(58,139,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${reveal})`;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        if (reveal > 0.9) {
          ctx.strokeStyle = `rgba(58,139,255,${0.4 * reveal})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
        }
      }

      // Phase C — core pulse
      const core = clamp01((elapsed - 250) / 1100);
      const gco = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
      gco.addColorStop(0,   `rgba(255,255,255,${0.9 * core})`);
      gco.addColorStop(0.4, `rgba(58,139,255,${0.7 * core})`);
      gco.addColorStop(1,   "rgba(58,139,255,0)");
      ctx.fillStyle = gco;
      ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${core})`;
      ctx.beginPath(); ctx.arc(cx, cy, 6 + 4 * Math.sin(elapsed / 200), 0, Math.PI * 2); ctx.fill();

      setStep(elapsed < 500 ? "SCAN" : elapsed < 1000 ? "LINK" : elapsed < 1500 ? "BIND" : "READY");
      setProgress(Math.min(100, (elapsed / DURATION) * 100));

      if (!probeFired && elapsed > 600) {
        probeFired = true;
        fetch("/api/status", { cache: "no-store" }).catch(() => {});
      }
      if (elapsed < DURATION) raf = requestAnimationFrame(frame);
      else setTimeout(() => setGone(true), 600);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); };
  }, []);

  if (gone) return null;
  return (
    <div className={"intro-veil" + (progress >= 100 ? " is-gone" : "")}>
      <canvas ref={cvsRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }} />
      <div className="intro-inner" style={{ position: "relative", zIndex: 1 }}>
        <img className="intro-logo-real"
             src="/static/img/brand/logo-white.svg"
             alt="IONITY"
             draggable={false} />
        <div className="intro-tag">AEDi-Sight RuView · WiFi-CSI Sensing Console</div>
        <div className="intro-prog"><div className="intro-prog-bar" style={{ width: `${progress}%` }} /></div>
        <div className="intro-meta">
          <span>{step}</span><span>·</span><span>Antwerp Designs · 2018 – 2026</span>
        </div>
      </div>
    </div>
  );
}
function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
