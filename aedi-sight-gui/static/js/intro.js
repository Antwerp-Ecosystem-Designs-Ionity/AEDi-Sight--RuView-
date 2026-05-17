// Cinematic intro — 1.6 s Canvas animation that runs once before the app loads.
// Phases:
//   0.0 – 0.5s   radar sweep on a dark field (a single rotating arm + after-glow)
//   0.5 – 1.0s   8 mesh nodes "form" on a circle around the centre, each lighting up
//   1.0 – 1.6s   IONITY word locks in (CSS animation already attached) + progress bar fills
//   1.6 – 2.2s   fade out

export async function initIntro() {
  const veil = document.getElementById('intro-veil');
  if (!veil) return;
  const stepEl = document.getElementById('introStep');
  const barEl  = document.getElementById('introProg');

  // Inject a canvas behind the existing logo/text.
  const cvs = document.createElement('canvas');
  cvs.style.position = 'absolute';
  cvs.style.inset = '0';
  cvs.style.width = '100%';
  cvs.style.height = '100%';
  cvs.style.zIndex = '0';
  cvs.style.pointerEvents = 'none';
  veil.insertBefore(cvs, veil.firstChild);

  const inner = veil.querySelector('.intro-inner');
  if (inner) inner.style.position = 'relative', inner.style.zIndex = '1';

  const dpr = window.devicePixelRatio || 1;
  const fit = () => {
    const w = veil.clientWidth, h = veil.clientHeight;
    cvs.width = w * dpr; cvs.height = h * dpr;
    const ctx = cvs.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit(); window.addEventListener('resize', fit);
  const ctx = cvs.getContext('2d');

  const t0 = performance.now();
  const DURATION = 2200;
  let probeFired = false;

  function frame(t) {
    const elapsed = t - t0;
    const w = cvs.width / dpr, h = cvs.height / dpr;
    const cx = w / 2, cy = h / 2;

    // background gradient (paint each frame so it stays vibrant)
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
    bg.addColorStop(0, 'rgba(10,29,90,0.55)');
    bg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Phase A: radar sweep (0.0 – 0.5s, lingers afterwards as faint)
    {
      const r0 = 30, rMax = Math.min(w, h) * 0.35;
      const tA = Math.min(1, elapsed / 900);          // sweep keeps going faintly
      const arm = (elapsed / 1100) * Math.PI * 2;     // 1.1 s per rev
      // Concentric rings
      ctx.strokeStyle = 'rgba(58,139,255,0.18)';
      ctx.lineWidth = 1;
      [r0, r0 + 40, r0 + 80, r0 + 120, r0 + 160, r0 + 200].forEach(r => {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      });
      // Sweep arm (cone)
      const grad = ctx.createConicGradient(arm, cx, cy);
      grad.addColorStop(0.0, 'rgba(58,139,255,0.55)');
      grad.addColorStop(0.05, 'rgba(58,139,255,0.0)');
      grad.addColorStop(1.0, 'rgba(58,139,255,0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rMax, arm, arm + Math.PI / 1.6, false); ctx.closePath(); ctx.fill();
    }

    // Phase B: 8 mesh nodes light up (0.45 – 1.05s)
    {
      const nodes = 8;
      const ring = Math.min(w, h) * 0.28;
      for (let i = 0; i < nodes; i++) {
        const reveal = clamp01((elapsed - 450 - i * 70) / 220);
        if (reveal <= 0) continue;
        const a = (i / nodes) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * ring;
        const y = cy + Math.sin(a) * ring;
        const r = 4 + 8 * reveal;
        // glow
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, `rgba(58,139,255,${0.6 * reveal})`);
        g.addColorStop(1, 'rgba(58,139,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r * 4, 0, Math.PI * 2); ctx.fill();
        // dot
        ctx.fillStyle = `rgba(255,255,255,${reveal})`;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        // line back to centre (only after node is fully revealed)
        if (reveal > 0.9) {
          ctx.strokeStyle = `rgba(58,139,255,${0.4 * reveal})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
        }
      }
    }

    // Phase C: central core pulse (overlaps with node reveal)
    {
      const core = clamp01((elapsed - 250) / 1100);
      const r = 6 + 4 * Math.sin(elapsed / 200);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * core})`);
      g.addColorStop(0.4, `rgba(58,139,255,${0.7 * core})`);
      g.addColorStop(1, 'rgba(58,139,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${core})`;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }

    // Step label + progress
    if (elapsed < 500)        stepEl.textContent = 'SCAN';
    else if (elapsed < 1000)  stepEl.textContent = 'LINK';
    else if (elapsed < 1500)  stepEl.textContent = 'BIND';
    else                       stepEl.textContent = 'READY';
    barEl.style.width = (Math.min(100, (elapsed / DURATION) * 100)).toFixed(0) + '%';

    if (!probeFired && elapsed > 600) {
      probeFired = true;
      fetch('/api/status', { cache: 'no-store' }).catch(() => {});
    }

    if (elapsed < DURATION) {
      requestAnimationFrame(frame);
    } else {
      veil.classList.add('is-gone');
      setTimeout(() => veil.remove(), 800);
    }
  }
  requestAnimationFrame(frame);
  // Resolve immediately — the veil dismisses itself when the canvas animation finishes.
  // (We don't block the app behind it; the rest of the UI boots underneath.)
  return Promise.resolve();
}
function clamp01(v){ return Math.max(0, Math.min(1, v)); }
