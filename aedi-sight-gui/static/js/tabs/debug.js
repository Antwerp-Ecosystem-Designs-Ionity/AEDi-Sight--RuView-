// Debug tab — serial monitor + NVS dump + sink counters.
import { wsBus } from '../wsbus.js';

export function initDebug() {
  const $ = sel => document.querySelector(sel);
  const serLog = $('#dbgSerLog');
  let lines = [];

  function appendSerial(line, cls='') {
    lines.push({ line, cls });
    if (lines.length > 600) lines = lines.slice(-600);
    serLog.innerHTML = lines.map(l => `<span class="${l.cls}">${esc(l.line)}</span>`).join('\n');
    serLog.scrollTop = serLog.scrollHeight;
  }
  function esc(s){return String(s ?? '').replace(/[<&]/g,c=>({'<':'&lt;','&':'&amp;'}[c]));}
  wsBus.on('serial', m => appendSerial(m.data.line || '', m.data.cls || ''));

  async function rescan() {
    try {
      const r = await (await fetch('/api/serial-ports')).json();
      const sel = $('#dbgPort');
      sel.innerHTML = r.length
        ? r.map(p => `<option value="${p.device}">${p.device}${p.description?` — ${p.description}`:''}</option>`).join('')
        : `<option disabled>no ports</option>`;
    } catch (_) {}
  }
  $('#dbgRescan').addEventListener('click', rescan);
  $('#dbgSerStart').addEventListener('click', async () => {
    const port = $('#dbgPort').value;
    if (!port) return;
    const r = await fetch('/api/serial/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ port, baud: 115200 }) });
    const d = await r.json();
    appendSerial(`→ ${d.ok ? 'monitor started' : 'monitor failed: ' + (d.error||'?')}`, d.ok ? 'ok' : 'err');
  });
  $('#dbgSerStop').addEventListener('click', async () => {
    await fetch('/api/serial/stop', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
  });

  $('#dbgNvsDump').addEventListener('click', async () => {
    const port = $('#dbgPort').value;
    if (!port) { alert('select a serial port first'); return; }
    appendSerial(`→ NVS dump from ${port} …`, 'info');
    await fetch('/api/nvs/dump', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ port }) });
    // poll the parse endpoint until the file appears (give esptool ~6s max)
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 500));
      const d = await (await fetch('/api/nvs/parse')).json();
      if (!d.error) { showNvs(d); return; }
    }
    $('#dbgNvsOut').textContent = 'NVS file not produced — check the serial log for esptool errors.';
  });
  $('#dbgNvsRefresh').addEventListener('click', async () => {
    showNvs(await (await fetch('/api/nvs/parse')).json());
  });
  function showNvs(d) {
    if (d.error) { $('#dbgNvsOut').textContent = d.error; return; }
    let txt = `NVS partition · ${d.size} B\n\n`;
    const entries = d.keys || {};
    if (!Object.keys(entries).length) { txt += '(no known keys found — may be unwritten)\n'; }
    for (const [k, v] of Object.entries(entries)) {
      txt += `${k.padEnd(14)} @0x${v.offset.toString(16).padStart(4,'0')}  hex=${v.raw_hex.slice(0,40)}…  ascii=${v.ascii.slice(0,32)}\n`;
    }
    $('#dbgNvsOut').textContent = txt;
  }

  async function refreshCounters() {
    try {
      const s = await (await fetch('/api/sink/stats')).json();
      $('#dbgTotal').textContent = s.total ?? 0;
      $('#dbgWs').textContent    = s.ws_clients ?? 0;
      $('#dbgBind').textContent  = s.bind || '—';
    } catch (_) {}
  }
  setInterval(refreshCounters, 1500); refreshCounters();
  document.addEventListener('tab:activate', e => { if (e.detail.id === 'debug') { rescan(); refreshCounters(); } });
  rescan();
}
