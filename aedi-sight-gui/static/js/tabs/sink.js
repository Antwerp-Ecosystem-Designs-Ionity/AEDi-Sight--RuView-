// Sink tab — start/stop the in-process UDP sink + render per-node stats.
import { wsBus } from '../wsbus.js';
import { push as sparkPush, paint as sparkPaint } from '../spark.js';

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
      // Per-node — feed sparklines + render rows.
      const tbody = $('#nodeTable'); tbody.innerHTML = '';
      Object.entries(s.nodes || {}).sort(([a],[b]) => a.localeCompare(b)).forEach(([id, n]) => {
        const ip = (n.source || '').split(':')[0];
        sparkPush('rate-' + id, n.rate || 0);
        sparkPush('rssi-' + id, n.rssi ?? -100);
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="mono">#${id}</td>
                        <td class="mono">${n.source || '—'}</td>
                        <td class="mono">${n.frames}</td>
                        <td><canvas class="spark" id="spark-rate-${id}" width="80" height="22"></canvas> <span class="mono">${(n.rate || 0).toFixed(1)}</span></td>
                        <td><canvas class="spark" id="spark-rssi-${id}" width="80" height="22"></canvas> <span class="mono">${n.rssi ?? '—'}</span></td>
                        <td class="mono">${n.last_seq ?? '—'}</td>
                        <td class="mono">${n.last_seen ? new Date(n.last_seen*1000).toLocaleTimeString() : '—'}</td>
                        <td>${ip ? `<button class="btn xs" data-ota="${ip}">reflash</button>` : ''}</td>`;
        tbody.appendChild(tr);
        // paint after the row is in the DOM
        requestAnimationFrame(() => {
          sparkPaint(document.getElementById(`spark-rate-${id}`), 'rate-' + id, { stroke: '#3a8bff' });
          sparkPaint(document.getElementById(`spark-rssi-${id}`), 'rssi-' + id, { stroke: '#28d68a', fillTop: 'rgba(40,214,138,0.35)' });
        });
      });
      // Wire reflash buttons.
      tbody.querySelectorAll('[data-ota]').forEach(b => b.addEventListener('click', async () => {
        const ip = b.dataset.ota;
        if (!confirm(`Reflash node at ${ip} with the prebuilt 8 MB firmware?\nThis posts to http://${ip}:8032/ota and reboots the node.`)) return;
        b.disabled = true; b.textContent = '…reflashing';
        try {
          const r = await fetch('/api/ota/reflash', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ ip, variant: '8mb' }) });
          const d = await r.json();
          alert(d.rc === 0 ? `OK · ${d.bytes_sent} B in ${d.elapsed_s}s` : `Failed · ${d.error || d.body}`);
        } catch (e) {
          alert('OTA error: ' + e);
        } finally { b.disabled = false; b.textContent = 'reflash'; }
      }));
    } catch (_) {}
  }
  setInterval(refresh, 1000);
  refresh();
}
