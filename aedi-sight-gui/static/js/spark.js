// Tiny sparkline canvas. Push values into a per-key ring buffer, then
// `paint(canvasEl, key, opts)` draws the curve.
const buffers = new Map();   // key -> Array<number> ring
const META    = new Map();   // key -> {min,max} cached

export function push(key, v, maxLen = 60) {
  let arr = buffers.get(key);
  if (!arr) { arr = []; buffers.set(key, arr); }
  arr.push(Number(v) || 0);
  if (arr.length > maxLen) arr.shift();
  META.delete(key);          // invalidate cache
}

export function paint(canvas, key, opts = {}) {
  if (!canvas) return;
  const dpr  = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth  || parseInt(canvas.getAttribute('width'))  || 80;
  const cssH = canvas.clientHeight || parseInt(canvas.getAttribute('height')) || 22;
  if (canvas.width !== cssW * dpr) { canvas.width = cssW * dpr; canvas.height = cssH * dpr; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const arr = buffers.get(key) || [];
  if (arr.length < 2) {
    ctx.fillStyle = '#2a3346'; ctx.fillRect(0, cssH - 1, cssW, 1);
    return;
  }
  // Min / max — use opts.min/max if given, else autoscale across the buffer.
  let lo = opts.min ?? Math.min(...arr);
  let hi = opts.max ?? Math.max(...arr);
  if (hi - lo < 1e-3) { hi = lo + 1; }
  const pad = 2;
  // Fill area under the curve
  ctx.beginPath();
  ctx.moveTo(0, cssH);
  arr.forEach((v, i) => {
    const x = (i / (arr.length - 1)) * cssW;
    const y = cssH - pad - ((v - lo) / (hi - lo)) * (cssH - 2 * pad);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(cssW, cssH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, cssH);
  grad.addColorStop(0, opts.fillTop || 'rgba(58,139,255,0.40)');
  grad.addColorStop(1, opts.fillBot || 'rgba(58,139,255,0.02)');
  ctx.fillStyle = grad;
  ctx.fill();
  // Curve
  ctx.beginPath();
  arr.forEach((v, i) => {
    const x = (i / (arr.length - 1)) * cssW;
    const y = cssH - pad - ((v - lo) / (hi - lo)) * (cssH - 2 * pad);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = opts.stroke || '#3a8bff';
  ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
  ctx.stroke();
  // Last-point dot
  const last = arr[arr.length - 1];
  const yL = cssH - pad - ((last - lo) / (hi - lo)) * (cssH - 2 * pad);
  ctx.beginPath(); ctx.arc(cssW - 2, yL, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = opts.dot || '#ffffff'; ctx.fill();
}
