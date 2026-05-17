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
import { initLibs }        from './tabs/libs.js';
import { initRuView }      from './tabs/ruview.js';
import { initDebug }       from './tabs/debug.js';
import { wsBus }           from './wsbus.js';
import { ICON }            from './icons.js';

// Three sections: OPERATE (live), EXPLORE (catalog), MANAGE (admin).
const TABS = [
  { id: 'home',       label: 'Overview',     icon: 'home',      group: 'operate' },
  { id: 'provision',  label: 'Provision',    icon: 'provision', group: 'operate' },
  { id: 'sink',       label: 'Sink',         icon: 'sink',      group: 'operate' },
  { id: 'visualizer', label: 'Visualizer',   icon: 'viz',       group: 'operate' },
  { id: 'ml',         label: 'ML · Vitals',  icon: 'ml',        group: 'operate' },
  { id: 'debug',      label: 'Debug',        icon: 'cpu',       group: 'operate' },
  { id: 'chat',       label: 'Chat',         icon: 'chat',      group: 'operate' },
  { id: 'libs',       label: 'Libraries',    icon: 'shield',    group: 'explore' },
  { id: 'ruview',     label: 'RuView',       icon: 'radio',     group: 'explore' },
  { id: 'tools',      label: 'Tools',        icon: 'tools',     group: 'explore' },
  { id: 'logs',       label: 'Logs',         icon: 'logs',      group: 'manage' },
  { id: 'updates',    label: 'Updates',      icon: 'updates',   group: 'manage' },
  { id: 'about',      label: 'About',        icon: 'about',     group: 'manage' },
];

function renderSidebar() {
  const ul = document.getElementById('sideTabs');
  const html = [];
  let last = null;
  for (const t of TABS) {
    if (t.group !== last) {
      html.push(`<li class="sect">${t.group}</li>`);
      last = t.group;
    }
    html.push(
      `<li data-tab="${t.id}">
         ${ICON[t.icon] || ''}
         <span>${t.label}</span>
         <span class="badge" data-badge="${t.id}"></span>
       </li>`
    );
  }
  ul.innerHTML = html.join('');
  ul.addEventListener('click', e => {
    const li = e.target.closest('li[data-tab]');
    if (li && li.dataset.tab) activateTab(li.dataset.tab);
  });
}

function activateTab(id) {
  document.querySelectorAll('#sideTabs li').forEach(li =>
    li.classList.toggle('is-active', li.dataset.tab === id));
  document.querySelectorAll('main.app-main .tab').forEach(s =>
    s.classList.toggle('is-active', s.dataset.tab === id));
  document.dispatchEvent(new CustomEvent('tab:activate', { detail: { id } }));
  if (location.hash !== '#' + id) location.hash = id;
}

function wireQuickButtons() {
  document.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', () => activateTab(el.dataset.go));
  });
}

let lastStatus = null;
async function pollStatus() {
  try {
    const r = await fetch('/api/status');
    if (!r.ok) throw new Error(r.statusText);
    const s = await r.json();
    lastStatus = s;
    document.getElementById('piIp').textContent     = s.host_ip || '—';
    document.getElementById('buildVer').textContent = 'v' + (s.version || '0.1');
    document.getElementById('sinkFps').textContent  = (s.sink_fps ?? 0).toFixed(1) + ' fps';
    document.getElementById('upTime').textContent   = formatUptime(s.uptime_s || 0);
    document.getElementById('espState').textContent = s.esp32_serial || 'no port';
    document.getElementById('wsState').textContent  = (wsBus.connected ? 'live' : 'idle');
    document.getElementById('hostSsid') && (document.getElementById('hostSsid').textContent = s.host_ssid || '—');
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
    // Home stat tiles
    setText('homeNodes', `${s.nodes_seen || 0}/8`);
    setText('homeFps',   (s.sink_fps ?? 0).toFixed(1));
    setText('homeIp',    s.host_ip || '—');
    setText('homeSsid',  s.host_ssid || '—');
  } catch (e) {
    document.getElementById('wsState').textContent = 'down';
  }
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function formatUptime(s) {
  s = Math.floor(s);
  const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, ss = s % 60;
  return `${h}h${String(m).padStart(2,'0')}m${String(ss).padStart(2,'0')}s`;
}

document.addEventListener('DOMContentLoaded', async () => {
  renderSidebar();
  wireQuickButtons();

  await initIntro();
  wsBus.connect();

  initProvision();
  initSink();
  initVisualizer();
  initML();
  initChat();
  initLogs();
  initTools();
  initUpdates();
  initLibs();
  initRuView();
  initDebug();

  const startTab = (location.hash || '#home').slice(1);
  activateTab(TABS.find(t => t.id === startTab) ? startTab : 'home');

  pollStatus();
  setInterval(pollStatus, 2000);
});
