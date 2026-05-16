// Intro veil — sequenced reveal.
// 0.0s   black canvas with the ripple core pulsing
// 0.6s   "IONITY" word lock-in (CSS animation)
// 1.0s   tagline fade-in (CSS animation)
// 0.0-1.6s  progress bar driven by /api/status probe + a 4-step text label
// 1.8s   fade out
export async function initIntro() {
  const veil   = document.getElementById('intro-veil');
  const barEl  = document.getElementById('introProg');
  const stepEl = document.getElementById('introStep');
  if (!veil) return;

  const steps = ['BOOT', 'PROBE', 'LINK', 'READY'];
  for (let i = 0; i < steps.length; i++) {
    stepEl.textContent = steps[i];
    barEl.style.width  = ((i + 1) / steps.length * 100).toFixed(0) + '%';
    if (i === 1) {
      try { await fetch('/api/status', { cache: 'no-store' }); } catch (_) {}
    }
    await sleep(420);
  }
  await sleep(120);
  veil.classList.add('is-gone');
  setTimeout(() => veil.remove(), 800);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
