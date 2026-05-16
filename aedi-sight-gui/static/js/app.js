// AEDi-Sight RuView — IONITY console
// Single-page tabbed app. Each module under /static/js/tabs/ owns its tab.
import { initIntro }       from './intro.js';
import { initProvision }   from './tabs/provision.js';
import { initSink }        from './tabs/sink.js';
import { initVisualizer }  from './tabs/visualizer.js';
import { initML }          from './tabs/ml.js';
import { initChat }        from './tabs/chat.js';
import { initLogs }        from './tabs/logs.js';
import { initTools }       from './tabs/tools.js';
import { initUpdates }     from './tabs/updates.js';
import { wsBus }           from './wsbus.js';

const TABS = [
  { id: 'home',       label: 'Home',        icon: '◎' },
  { id: 'provision',  label: 'Provision',   icon: '⚙' },
  { id: 'sink',       label: 'Sink',        icon: '⇊' },
  { id: 'visualizer', label: 'Visualizer',  icon: '∿' },
  { id: 'ml',         label: 'ML',          icon: '◐' },
  { id: 'chat',       label: 'Chat',        icon: '✎' },
  { id: 'tools',      label: 'Tools',       icon: '⚒' },
  { id: 'logs',       label: 'Logs',        icon: '☰' },
  { id: 'updates',    label: 'Updates',     icon: '↑' },
  { id: 'about',      label: 'About',       icon: 'ⓘ' },
];

function renderSidebar() {
  const ul = document.getElementById('sideTabs');
  ul.innerHTML = TABS.map(t =>
    `<li data-tab="${t.id}"><span class="icn">${t.icon}</span><span>${t.label}</span><span class="badge" data-badge="${t.id}"></span></li>`
  ).join('');
  ul.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (li && li.dataset.tab) activateTab(li.dataset.tab);
  });
}

function activateTab(id) {
  document.querySelectorAll('#sideTabs li').forEach(li =>
    li.classList.toggle('is-active', li.dataset.tab === id));
  document.querySelectorAll('main.app-main .tab').forEach(s =>
    s.classList.toggle('is-active', s.dataset.tab === id));
  // Defer to per-tab module: emit event so each module can refresh its state.
  document.dispatchEvent(new CustomEvent('tab:activate', { detail: { id } }));
  if (location.hash !== '#' + id) location.hash = id;
}

function wireQuickButtons() {
  document.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', () => activateTab(el.dataset.go));
  });
}

async function pollStatus() {
  try {
    const r = await fetch('/api/status');
    if (!r.ok) throw new Error(r.statusText);
    const s = await r.json();
    document.getElementById('piIp').textContent     = s.host_ip || '—';
    document.getElementById('buildVer').textContent = 'v' + (s.version || '0.1');
    document.getElementById('sinkFps').textContent  = (s.sink_fps ?? 0).toFixed(1) + ' fps';
    document.getElementById('upTime').textContent   = formatUptime(s.uptime_s || 0);
    document.getElementById('espState').textContent = s.esp32_serial || 'no port';
    document.getElementById('wsState').textContent  = (wsBus.connected ? 'live' : 'idle');
    const dot = document.getElementById('sinkDot');
    dot.classList.toggle('on',   (s.sink_fps ?? 0) > 0.1);
    dot.classList.toggle('warn', (s.sink_fps ?? 0) === 0 && s.sink_listening);
    dot.classList.toggle('err',  !s.sink_listening);
    const fleetBadge = document.querySelector('[data-badge="provision"]');
    if (fleetBadge) {
      const n = (s.nodes_seen || 0);
      fleetBadge.textContent = n ? `${n}/8` : '';
      fleetBadge.classList.toggle('on', n > 0);
    }
  } catch (e) {
    document.getElementById('wsState').textContent = 'down';
  }
}

function formatUptime(s) {
  s = Math.floor(s);
  const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, ss = s % 60;
  return `${h}h${String(m).padStart(2,'0')}m${String(ss).padStart(2,'0')}s`;
}

document.addEventListener('DOMContentLoaded', async () => {
  renderSidebar();
  wireQuickButtons();

  await initIntro();          // resolves once veil is dismissed
  wsBus.connect();            // unified WS multiplex for csi+logs+chat+provision

  initProvision();
  initSink();
  initVisualizer();
  initML();
  initChat();
  initLogs();
  initTools();
  initUpdates();

  const startTab = (location.hash || '#home').slice(1);
  activateTab(TABS.find(t => t.id === startTab) ? startTab : 'home');

  pollStatus();
  setInterval(pollStatus, 2000);
});
