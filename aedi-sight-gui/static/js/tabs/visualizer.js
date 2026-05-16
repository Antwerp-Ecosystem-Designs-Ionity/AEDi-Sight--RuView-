// Visualizer tab — scrolling CSI waterfall + live ML/vitals overlay.
// Each frame on the WS bus arrives as { topic: 'csi', data: { node_id, freq_hz, amp:[...], phase:[...], rssi } }.
// ML status (state/score) arrives on topic 'ml' (kind=status).
// Breathing/heart rate arrives on topic 'vitals'.
import { wsBus } from '../wsbus.js';

export function initVisualizer() {
  const cvs = document.getElementById('vizCanvas');
  const ctx = cvs.getContext('2d');
  const gainEl  = document.getElementById('vizGain');
  const modeEl  = document.getElementById('vizMode');
  const nodeEl  = document.getElementById('vizNode');
  const pauseEl = document.getElementById('vizPause');

  let paused = false;
  let lastByNode = {};        // node_id -> last amp[] for Δ mode
  const mlByNode = {};        // node_id -> {state, score}
  const vitByNode = {};       // node_id -> {br, hr}
  let col = 0;
  const H = cvs.height, W = cvs.width;

  // Pre-fill black
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  drawOverlay();

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

  // Overlay — top-left badge box listing per-node ML state + BR/HR.
  function drawOverlay() {
    // Clear a fixed strip at the top
    ctx.save();
    ctx.clearRect(0, 0, 360, 92);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, 8, 344, 84);
    ctx.strokeStyle = 'rgba(58,139,255,0.55)';
    ctx.strokeRect(8.5, 8.5, 343, 83);
    ctx.font = '11px ui-monospace, JetBrains Mono, Menlo, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#3a8bff';
    ctx.fillText('LIVE PER-NODE  ·  ML  /  VITALS', 18, 14);
    ctx.fillStyle = '#c8d3e6';
    const ids = Array.from(new Set([...Object.keys(mlByNode), ...Object.keys(vitByNode)])).sort();
    if (!ids.length) {
      ctx.fillStyle = '#8a96aa';
      ctx.fillText('waiting for frames…', 18, 32);
    } else {
      let y = 30;
      for (const id of ids.slice(0, 4)) {
        const ml  = mlByNode[id]  || { state: '—', score: 0 };
        const vit = vitByNode[id] || { br: null, hr: null };
        const stCol = ml.state === 'spike'  ? '#ff4757'
                    : ml.state === 'moving' ? '#f5b400'
                    : ml.state === 'idle'   ? '#2ecc71' : '#8a96aa';
        ctx.fillStyle = '#c8d3e6';
        ctx.fillText(`#${id}`, 18, y);
        ctx.fillStyle = stCol;
        ctx.fillText(`${ml.state.padEnd(11)} ${ml.score.toFixed(2).padStart(5)}σ`, 44, y);
        ctx.fillStyle = '#c8d3e6';
        const br = vit.br != null ? `BR ${vit.br.toFixed(1)}` : 'BR —';
        const hr = vit.hr != null ? `HR ${vit.hr.toFixed(0)}` : 'HR —';
        ctx.fillText(`${br}   ${hr}`, 200, y);
        y += 14;
      }
    }
    ctx.restore();
  }
  // Repaint overlay every 500 ms so it doesn't get scrolled away by the waterfall col-bands.
  setInterval(drawOverlay, 500);

  wsBus.on('ml', m => {
    const d = m.data;
    if (d && d.kind === 'status' && d.node_id !== undefined) {
      mlByNode[String(d.node_id)] = { state: d.state || '—', score: d.score || 0 };
    }
  });
  wsBus.on('vitals', m => {
    const d = m.data || {};
    if (d.node_id === undefined) return;
    vitByNode[String(d.node_id)] = { br: d.breathing_bpm, hr: d.heart_rate_bpm };
  });

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
