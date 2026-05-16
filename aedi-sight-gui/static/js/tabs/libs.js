// Libraries tab — full SDK inventory with filter + select-to-detail.
export function initLibs() {
  const $ = sel => document.querySelector(sel);
  const wrap   = $('#libCards');
  const detail = $('#libDetail');
  let cache = null;
  let filterGroup = 'all';
  let filterText  = '';

  async function load() {
    try {
      cache = await (await fetch('/api/libs')).json();
      render();
    } catch (e) { wrap.innerHTML = `<div class="card"><p class="err">load failed: ${e}</p></div>`; }
  }

  function badge(stack) {
    const map = { rust:'Rust', vendor:'Vendor', firmware:'Firmware', python:'Python', apps:'App' };
    const cls = stack === 'rust' ? 'chip' : stack === 'vendor' ? 'chip dim' :
                stack === 'firmware' ? 'chip warn' : stack === 'python' ? 'chip ok' : 'chip';
    return `<span class="${cls}">${map[stack] || stack}</span>`;
  }

  function render() {
    if (!cache) return;
    const items = [];
    if (filterGroup === 'all' || filterGroup === 'rust')     cache.rust.forEach(c => items.push(c));
    if (filterGroup === 'all' || filterGroup === 'vendor')   cache.vendor.forEach(c => items.push(c));
    if (filterGroup === 'all' || filterGroup === 'firmware') cache.firmware.forEach(c => items.push(c));
    if (filterGroup === 'all' || filterGroup === 'python')   cache.python.forEach(c => items.push(c));
    if (filterGroup === 'all' || filterGroup === 'apps')     cache.apps.forEach(c => items.push(c));

    const q = filterText.trim().toLowerCase();
    const shown = q
      ? items.filter(it => (it.name||'').toLowerCase().includes(q)
                        || (it.description||'').toLowerCase().includes(q)
                        || (it.path||'').toLowerCase().includes(q))
      : items;

    wrap.innerHTML = shown.map(it => `
      <div class="card lib-card" data-lib="${esc(it.path)}">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px;">
          <strong style="font-size:14px;color:#fff;">${esc(it.name)}</strong>
          ${badge(it.stack)}
        </div>
        ${it.version ? `<div class="dim mono" style="font-size:11px;margin-top:2px;">v${esc(it.version)}</div>` : ''}
        <p style="margin-top:8px;font-size:13px;color:var(--paper-200);">${esc(it.description || '—')}</p>
        <div class="kv" style="font-size:11px;border:0;padding:6px 0 0;">
          <span>path</span><span class="mono">${esc(it.path)}</span>
        </div>
        ${(it.binaries && it.binaries.length) ? `<div class="row gap" style="margin-top:8px;">${it.binaries.slice(0,3).map(b => `<span class="chip dim">${esc(typeof b === 'string' ? b : b.name)}</span>`).join('')}</div>` : ''}
      </div>
    `).join('') || `<div class="card"><p class="dim">no entries match.</p></div>`;
    wrap.querySelectorAll('.lib-card').forEach(c =>
      c.addEventListener('click', () => showDetail(c.dataset.lib)));
  }

  function showDetail(path) {
    const all = [...cache.rust, ...cache.vendor, ...cache.firmware, ...cache.python, ...cache.apps];
    const it = all.find(x => x.path === path);
    if (!it) return;
    detail.style.display = 'block';
    detail.innerHTML = `
      <h3>${esc(it.name)} ${badge(it.stack)}${it.version ? ` <span class="mono dim" style="font-weight:400;">v${esc(it.version)}</span>` : ''}</h3>
      <p style="color:var(--paper-200);">${esc(it.description || '—')}</p>
      <div class="kv"><span>path</span><span class="mono">${esc(it.path)}</span></div>
      ${it.readme ? `<div class="kv"><span>readme</span><span class="mono">${esc(it.readme)}</span></div>` : ''}
      ${it.kind   ? `<div class="kv"><span>kind</span><span class="mono">${esc(it.kind)}</span></div>` : ''}
      ${(it.binaries && it.binaries.length) ? `
        <div style="margin-top:10px;">
          <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:6px;">Binaries / artefacts</div>
          <ul class="mini">${it.binaries.map(b => `<li class="mono">${esc(typeof b === 'string' ? b : (b.name + (b.size? ` (${(b.size/1024).toFixed(1)} KB)` : '')))}</li>`).join('')}</ul>
        </div>` : ''}
      <div class="row gap" style="margin-top:14px;">
        <button class="btn xs" id="libClose">close</button>
      </div>
    `;
    detail.scrollIntoView({ behavior:'smooth', block:'nearest' });
    document.getElementById('libClose').addEventListener('click', () => detail.style.display='none');
  }
  function esc(s){return String(s ?? '').replace(/[<&]/g,c=>({'<':'&lt;','&':'&amp;'}[c]));}

  document.querySelectorAll('[data-libgroup]').forEach(b => b.addEventListener('click', () => {
    filterGroup = b.dataset.libgroup;
    document.querySelectorAll('[data-libgroup]').forEach(x => x.classList.toggle('primary', x === b));
    render();
  }));
  $('#libSearch').addEventListener('input', e => { filterText = e.target.value; render(); });

  document.addEventListener('tab:activate', e => { if (e.detail.id === 'libs' && !cache) load(); });
  load();
}
