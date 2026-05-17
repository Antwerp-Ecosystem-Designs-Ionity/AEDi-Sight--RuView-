// Provisioning tab.
// - rescans serial ports on demand
// - submits POST /api/provision and streams 'provision' WS messages into the log
// - 8-row fleet table — keeps last-seen / RSSI from /api/fleet
import { wsBus } from '../wsbus.js';

export function initProvision() {
  const $ = sel => document.querySelector(sel);
  const log = $('#provLog');
  const form = $('#provForm');

  async function rescan() {
    const sel = $('#provPort');
    try {
      const r = await fetch('/api/serial-ports');
      const ports = await r.json();
      sel.innerHTML = ports.length
        ? ports.map(p => `<option value="${p.device}">${p.device}${p.description?` — ${p.description}`:''}</option>`).join('')
        : `<option disabled>no ports — connect an ESP32 over USB</option>`;
    } catch (e) { sel.innerHTML = `<option disabled>could not list ports</option>`; }
  }

  async function loadDefaults() {
    try {
      const s = await (await fetch('/api/status')).json();
      $('#provIp').value = s.host_ip || '';
      $('#provSsid').placeholder = s.host_ssid ? `e.g. ${s.host_ssid}` : 'SSID';
      if (s.host_ssid)    $('#provSsid').value = s.host_ssid;
      if (s.host_channel) $('#provChannel').value = String(s.host_channel);
    } catch (_) { /* offline-friendly */ }
    await loadPersisted();
  }

  // Pre-fill from persisted args for the currently-selected node-id.
  async function loadPersisted() {
    try {
      const r = await (await fetch('/api/fleet/state')).json();
      const id = $('#provNodeId').value;
      const saved = (r.nodes || {})[id];
      if (!saved) return;
      // Don't overwrite the SSID/IP autodetect with stale data — only fill
      // fields the user can't infer from host context.
      for (const [k, v] of Object.entries(saved)) {
        const el = document.querySelector(`[name="${k}"]`);
        if (!el || el.type === 'password') continue;
        if (k === 'target_ip' || k === 'ssid' || k === 'channel') continue;
        el.value = v;
      }
      appendLog(`pre-filled fields from saved settings for node ${id}`, 'info');
    } catch (_) { /* fine */ }
  }
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'provNodeId') loadPersisted();
  });

  function appendLog(line, cls='') {
    const ts = new Date().toISOString().slice(11, 19);
    const node = document.createElement('div');
    node.innerHTML = `<span class="ts">${ts}</span> <span class="${cls}">${escape(line)}</span>`;
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
  }
  function escape(s) { return String(s).replace(/[<&]/g, c => ({ '<':'&lt;', '&':'&amp;' }[c])); }

  function payload() {
    const fd = new FormData(form);
    const obj = {};
    for (const [k, v] of fd.entries()) obj[k] = v;
    obj.flash_firmware = $('#provFlash').checked;
    if (obj.channel === '') delete obj.channel;
    if (obj.filter_mac === '') delete obj.filter_mac;
    return obj;
  }

  async function submit(dryRun=false) {
    const body = payload();
    body.dry_run = !!dryRun;
    const btn = $('#provSubmit'); btn.disabled = true;
    appendLog(`→ POST /api/provision ${dryRun ? '(dry-run)' : ''} node=${body.node_id} slot=${body.tdm_slot}/${body.tdm_total}`, 'info');
    try {
      const r = await fetch('/api/provision', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
      const data = await r.json();
      appendLog(`job ${data.job_id} accepted, streaming...`, 'ok');
    } catch (e) { appendLog(String(e), 'err'); }
    finally { btn.disabled = false; }
  }

  form.addEventListener('submit', e => { e.preventDefault(); submit(false); });
  $('#provDryRun').addEventListener('click',  () => submit(true));
  $('#rescanPorts').addEventListener('click', rescan);
  $('#provFleet').addEventListener('click',   () => {
    // Auto-suggest next node-id by reading the fleet table.
    const next = nextFreeNodeId();
    if (next != null) { $('#provNodeId').value = String(next); $('#provTdmSlot').value = String(next); appendLog(`fleet plan: next id/slot = ${next}`, 'info'); }
    else appendLog('fleet plan: all 8 slots present', 'ok');
  });

  function nextFreeNodeId() {
    const used = new Set();
    document.querySelectorAll('#fleetTable tr').forEach(tr => {
      const id = parseInt(tr.dataset.nodeId, 10);
      if (!isNaN(id) && tr.dataset.status === 'live') used.add(id);
    });
    for (let i = 0; i < 8; i++) if (!used.has(i)) return i;
    return null;
  }

  async function refreshFleet() {
    try {
      const r = await fetch('/api/fleet'); const f = await r.json();
      const tbody = $('#fleetTable');
      tbody.innerHTML = '';
      for (let i = 0; i < 8; i++) {
        const row = f.nodes[i] || { node_id: i, status: 'absent', last_seen: null, rssi: null };
        const cls = row.status === 'live' ? 'ok' : row.status === 'stale' ? 'warn' : 'err';
        const tr = document.createElement('tr');
        tr.dataset.nodeId = String(i); tr.dataset.status = row.status;
        tr.innerHTML = `<td class="mono">#${i}</td>
                        <td class="${cls}">${row.status}</td>
                        <td class="mono">${row.last_seen ? formatAgo(row.last_seen) : '—'}</td>
                        <td class="mono">${row.rssi != null ? row.rssi + ' dBm' : '—'}</td>`;
        tbody.appendChild(tr);
      }
    } catch (e) { /* ignore */ }
  }
  function formatAgo(ts) {
    const d = (Date.now() / 1000) - ts; if (d < 5) return 'now';
    if (d < 60) return `${d|0}s ago`;
    if (d < 3600) return `${(d/60)|0}m ago`;
    return `${(d/3600)|0}h ago`;
  }

  wsBus.on('provision', m => appendLog(m.data.line || JSON.stringify(m.data), m.data.cls || ''));
  wsBus.on('fleet', () => refreshFleet());
  document.addEventListener('tab:activate', e => {
    if (e.detail.id === 'provision') { rescan(); loadDefaults(); refreshFleet(); }
  });

  rescan(); loadDefaults(); refreshFleet();
  setInterval(refreshFleet, 4000);
}
