// Visualizer tab — scrolling CSI waterfall.
// Each frame on the WS bus arrives as { topic: 'csi', data: { node_id, freq_hz, amp:[...], phase:[...], rssi } }.
import { wsBus } from '../wsbus.js';

export function initVisualizer() {
  const cvs = document.getElementById('vizCanvas');
  const ctx = cvs.getContext('2d');
  const gainEl  = document.getElementById('vizGain');
  const modeEl  = document.getElementById('vizMode');
  const nodeEl  = document.getElementById('vizNode');
  const pauseEl = document.getElementById('vizPause');

  let paused = false;
  let lastByNode = {};  // node_id -> last amp[] for Δ mode
  let col = 0;
  const H = cvs.height, W = cvs.width;

  // Pre-fill black
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

  pauseEl.addEventListener('click', () => {
    paused = !paused; pauseEl.textContent = paused ? 'resume' : 'pause';
  });

  function blueWhiteRamp(v01) {
    // 0..1 → blue → white. Mid → IONITY azure.
    const v = Math.max(0, Math.min(1, v01));
    // r,g,b channels
    const r = Math.round( 10 + 245 * Math.pow(v, 1.5) );
    const g = Math.round( 30 + 225 * Math.pow(v, 1.2) );
    const b = Math.round(150 + 105 * Math.pow(v, 0.7) );
    return `rgb(${r},${g},${Math.min(255,b)})`;
  }

  function renderFrame(d) {
    if (paused) return;
    if (nodeEl.value && nodeEl.value !== String(d.node_id)) return;
    const mode = modeEl.value;
    const gain = parseFloat(gainEl.value) || 1;
    let series = d.amp || [];
    if (mode === 'phase') series = d.phase || [];
    else if (mode === 'diff') {
      const last = lastByNode[d.node_id];
      if (last && last.length === series.length) {
        series = series.map((v, i) => Math.abs(v - last[i]));
      }
      lastByNode[d.node_id] = (d.amp || []).slice();
    }
    if (!series.length) return;

    // Normalize: amp typically 0..~80, phase -π..π, diff 0..30.
    let scale = 1;
    if (mode === 'phase') scale = 1 / Math.PI;
    else {
      const mx = Math.max(1e-3, ...series); scale = 1 / (mx);
    }
    const rowH = Math.max(1, Math.floor(H / series.length));
    for (let i = 0; i < series.length; i++) {
      const v = (mode === 'phase' ? (series[i] + Math.PI) * scale * 0.5 : series[i] * scale) * gain;
      ctx.fillStyle = blueWhiteRamp(v);
      ctx.fillRect(col, i * rowH, 1, rowH);
    }
    col = (col + 1) % W;
    // playhead
    ctx.fillStyle = '#3a8bff';
    ctx.fillRect((col + 1) % W, 0, 1, H);
  }

  // Update node filter list from /api/sink/stats
  async function refreshNodes() {
    try {
      const s = await (await fetch('/api/sink/stats')).json();
      const ids = Object.keys(s.nodes || {}).sort();
      const cur = nodeEl.value;
      nodeEl.innerHTML = '<option value="">all</option>' +
        ids.map(id => `<option value="${id}" ${cur===id?'selected':''}>#${id}</option>`).join('');
    } catch (_) {}
  }
  setInterval(refreshNodes, 3000); refreshNodes();

  wsBus.on('csi', m => renderFrame(m.data));
}
