// ML tab — wires the live per-node anomaly table to the LocalML server module.
import { wsBus } from '../wsbus.js';
import { push as sparkPush, paint as sparkPaint } from '../spark.js';

export function initML() {
  const $ = sel => document.querySelector(sel);
  const log = $('#mlLog');
  function append(line, cls='') {
    const div = document.createElement('div');
    div.innerHTML = `<span class="ts">${new Date().toISOString().slice(11,19)}</span> <span class="${cls}">${esc(line)}</span>`;
    log.appendChild(div); log.scrollTop = log.scrollHeight;
  }
  function esc(s) { return String(s).replace(/[<&]/g, c => ({ '<':'&lt;','&':'&amp;' }[c])); }

  // ── snapshot (renders the per-node live table) ──
  let nodeState = {};   // node_id → {state, score, samples, rssi, since}
  function renderTable() {
    const tb = $('#mlNodeTable'); tb.innerHTML = '';
    const ids = Object.keys(nodeState).sort();
    if (!ids.length) {
      tb.innerHTML = `<tr><td colspan="6" class="dim">no nodes seen yet — start the sink + power on a provisioned ESP32</td></tr>`;
      return;
    }
    const now = Date.now()/1000;
    for (const id of ids) {
      const n = nodeState[id];
      sparkPush('mlscore-' + id, n.score || 0);
      const chip = n.state === 'spike'  ? '<span class="chip err">spike</span>' :
                   n.state === 'moving' ? '<span class="chip warn">moving</span>' :
                   n.state === 'idle'   ? '<span class="chip ok">idle</span>'   :
                                          '<span class="chip dim">calib</span>';
      const since = n.since ? `${(now - n.since).toFixed(0)}s` : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="mono">#${id}</td>
                      <td>${chip}</td>
                      <td><canvas class="spark" id="mlspark-${id}" width="80" height="22"></canvas> <span class="mono">${(n.score || 0).toFixed(2)}σ</span></td>
                      <td class="mono">${n.rssi ?? '—'}</td>
                      <td class="mono">${n.samples}</td>
                      <td class="mono">${since}</td>`;
      tb.appendChild(tr);
      requestAnimationFrame(() => {
        const colour = n.state === 'spike' ? '#ff5470' : n.state === 'moving' ? '#ffb547' : n.state === 'idle' ? '#28d68a' : '#5e6779';
        sparkPaint(document.getElementById(`mlspark-${id}`), 'mlscore-' + id, { stroke: colour });
      });
    }
  }

  async function refreshSnapshot() {
    try {
      const r = await fetch('/api/ml/snapshot'); const s = await r.json();
      $('#mlEnabled').textContent = s.enabled ? 'yes' : 'paused';
      $('#mlMove').textContent    = s.move_thresh ?? '—';
      $('#mlSpike').textContent   = s.spike_thresh ?? '—';
      $('#mlCalib').textContent   = s.calib_frames ?? '—';
      nodeState = s.nodes || {};
      renderTable();
    } catch (_) {}
  }

  wsBus.on('ml', m => {
    const d = m.data;
    if (!d) return;
    if (d.kind === 'status' && d.node_id !== undefined) {
      nodeState[d.node_id] = { state: d.state, score: d.score, samples: d.samples, rssi: d.rssi, since: d.since };
      renderTable();
    } else if (d.line) {
      append(d.line, d.cls || '');
    }
  });

  async function refreshModels() {
    try {
      const r = await fetch('/api/ml/models'); const d = await r.json();
      const tb = $('#mlModels'); tb.innerHTML = '';
      (d.models || []).forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="mono">${m.name}</td>
                        <td class="mono">${(m.size/1024).toFixed(1)} KB</td>
                        <td class="mono">${m.mtime ? new Date(m.mtime*1000).toLocaleString() : '—'}</td>`;
        tb.appendChild(tr);
      });
      if (!d.models?.length) tb.innerHTML = `<tr><td colspan="3" class="dim">no models on disk yet</td></tr>`;
    } catch (e) { append(String(e), 'err'); }
  }

  document.querySelectorAll('[data-mljob]').forEach(b => b.addEventListener('click', async () => {
    const job = b.dataset.mljob;
    append(`→ start ${job}`, 'info');
    try {
      const r = await fetch('/api/ml/job', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job }) });
      const d = await r.json(); append(`job ${d.job_id} accepted`, 'ok');
    } catch (e) { append(String(e), 'err'); }
  }));

  $('#mlInferStart').addEventListener('click', () => fetch('/api/ml/infer/start', { method:'POST' }).then(refreshSnapshot));
  $('#mlInferStop' ).addEventListener('click', () => fetch('/api/ml/infer/stop',  { method:'POST' }).then(refreshSnapshot));
  $('#mlInferReset').addEventListener('click', () => fetch('/api/ml/infer/reset', { method:'POST' }).then(refreshSnapshot));
  $('#mlRefresh').addEventListener('click', refreshModels);

  document.addEventListener('tab:activate', e => {
    if (e.detail.id === 'ml') { refreshSnapshot(); refreshModels(); }
  });
  refreshSnapshot(); refreshModels();
  setInterval(() => { if (document.querySelector('section[data-tab="ml"]').classList.contains('is-active')) refreshSnapshot(); }, 1500);
}
