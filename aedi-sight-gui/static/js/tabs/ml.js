// ML tab — list local models, kick off training jobs, view live stdout via WS topic 'ml'.
import { wsBus } from '../wsbus.js';

export function initML() {
  const $ = sel => document.querySelector(sel);
  const log = $('#mlLog');
  function append(line, cls='') {
    const div = document.createElement('div');
    div.innerHTML = `<span class="ts">${new Date().toISOString().slice(11,19)}</span> <span class="${cls}">${esc(line)}</span>`;
    log.appendChild(div); log.scrollTop = log.scrollHeight;
  }
  function esc(s) { return String(s).replace(/[<&]/g, c => ({ '<':'&lt;','&':'&amp;' }[c])); }

  async function refreshModels() {
    try {
      const r = await fetch('/api/ml/models'); const d = await r.json();
      const tb = $('#mlModels'); tb.innerHTML = '';
      (d.models || []).forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="mono">${m.name}</td>
                        <td class="mono">${(m.size/1024).toFixed(1)} KB</td>
                        <td class="mono">${m.mtime ? new Date(m.mtime*1000).toLocaleString() : '—'}</td>
                        <td><button class="btn xs" data-load="${m.name}">load</button></td>`;
        tb.appendChild(tr);
      });
      if (!d.models?.length) tb.innerHTML = `<tr><td colspan="4" class="dim">no models found — train one or drop an .rvf into models/</td></tr>`;
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

  $('#mlInferStart').addEventListener('click', () => fetch('/api/ml/infer/start', { method:'POST' }));
  $('#mlInferStop' ).addEventListener('click', () => fetch('/api/ml/infer/stop',  { method:'POST' }));
  $('#mlRefresh').addEventListener('click', refreshModels);

  wsBus.on('ml', m => append(m.data.line || JSON.stringify(m.data), m.data.cls || ''));
  document.addEventListener('tab:activate', e => { if (e.detail.id === 'ml') refreshModels(); });
  refreshModels();
}
