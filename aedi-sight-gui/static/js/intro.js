// Intro veil — runs once on first paint, then dismisses.
// Probes /api/status and walks a tiny progress bar so the user sees we're alive.
export async function initIntro() {
  const veil = document.getElementById('intro-veil');
  const bar  = document.getElementById('introProg');
  const step = document.getElementById('introStep');
  const steps = ['booting', 'probing', 'linking', 'ready'];
  for (let i = 0; i < steps.length; i++) {
    step.textContent = steps[i];
    bar.style.width  = ((i + 1) / steps.length * 100).toFixed(0) + '%';
    if (i === 1) {
      try {
        const r = await fetch('/api/status');
        if (r.ok) { /* warm cache */ }
      } catch (_) { /* ignore — UI still works */ }
    }
    await sleep(380);
  }
  veil.classList.add('is-gone');
  setTimeout(() => veil.remove(), 700);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
