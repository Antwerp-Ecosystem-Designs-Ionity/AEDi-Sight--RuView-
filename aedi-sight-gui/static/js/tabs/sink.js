// Sink tab — start/stop the in-process UDP sink + render per-node stats.
import { wsBus } from '../wsbus.js';

export function initSink() {
  const $ = sel => document.querySelector(sel);

  async function sinkAction(op) {
    try {
      const r = await fetch('/api/sink/' + op, { method: 'POST' });
      const d = await r.json();
      $('#sinkBind').textContent = d.bind || '—';
    } catch (_) {}
  }
  $('#sinkStart').addEventListener('click', () => sinkAction('start'));
  $('#sinkStop' ).addEventListener('click', () => sinkAction('stop'));
  $('#sinkReset').addEventListener('click', () => fetch('/api/sink/reset', { method: 'POST' }));

  async function refresh() {
    try {
      const r = await fetch('/api/sink/stats');
      const s = await r.json();
      $('#sinkBind').textContent  = s.bind  || '—';
      $('#sinkTotal').textContent = s.total || 0;
      $('#sinkLast').textContent  = s.last_seen ? new Date(s.last_seen * 1000).toLocaleTimeString() : '—';
      $('#wsClients').textContent = s.ws_clients ?? 0;
      // Per-node
      const tbody = $('#nodeTable'); tbody.innerHTML = '';
      Object.entries(s.nodes || {}).sort(([a],[b]) => a.localeCompare(b)).forEach(([id, n]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="mono">#${id}</td>
                        <td class="mono">${n.source || '—'}</td>
                        <td class="mono">${n.frames}</td>
                        <td class="mono">${(n.rate || 0).toFixed(1)}</td>
                        <td class="mono">${n.rssi ?? '—'}</td>
                        <td class="mono">${n.last_seq ?? '—'}</td>
                        <td class="mono">${n.last_seen ? new Date(n.last_seen*1000).toLocaleTimeString() : '—'}</td>`;
        tbody.appendChild(tr);
      });
    } catch (_) {}
  }
  setInterval(refresh, 1000);
  refresh();
}
