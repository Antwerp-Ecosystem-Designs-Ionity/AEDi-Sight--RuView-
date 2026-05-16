// RuView tab — plugin commands / skills / agents rendered as selectable cards.
export function initRuView() {
  const $ = sel => document.querySelector(sel);
  const cmdsEl    = $('#ruviewCmds');
  const skillsEl  = $('#ruviewSkills');
  const agentsEl  = $('#ruviewAgents');
  const docEl     = $('#ruviewDoc');
  let loaded = false;

  async function load() {
    try {
      const d = await (await fetch('/api/ruview')).json();
      render(d);
      loaded = true;
    } catch (e) {
      cmdsEl.innerHTML = `<p class="err">load failed: ${e}</p>`;
    }
  }

  function chipKind(k) {
    return k === 'command' ? 'chip' : k === 'skill' ? 'chip ok' : 'chip warn';
  }

  function card(item) {
    const slash = item.kind === 'command' ? `<code>/${item.name}</code>` : `<code>${item.name}</code>`;
    return `<div class="card lib-card" data-path="${esc(item.path)}" style="padding:12px;">
      <div class="row" style="justify-content:space-between;gap:8px;">
        <strong style="font-size:13px;color:#fff;">${slash}</strong>
        <span class="${chipKind(item.kind)}">${esc(item.kind)}</span>
      </div>
      <p style="margin-top:6px;font-size:12px;color:var(--paper-200);">${esc(item.description).slice(0,180)}</p>
      ${item.argument_hint ? `<div class="dim mono" style="font-size:10.5px;margin-top:4px;">${esc(item.argument_hint)}</div>` : ''}
    </div>`;
  }

  function render(d) {
    cmdsEl.innerHTML   = (d.commands || []).map(card).join('') || '<p class="dim">no commands found</p>';
    skillsEl.innerHTML = (d.skills   || []).map(s => `
      <div class="lib-card" data-path="${esc(s.path)}" style="padding:8px 4px;cursor:pointer;border-bottom:1px solid var(--rule);">
        <strong style="font-size:12.5px;color:#fff;">${esc(s.name)}</strong>
        <p style="margin:2px 0 0;font-size:11.5px;color:var(--paper-300);">${esc(s.description).slice(0,140)}</p>
      </div>
    `).join('') || '<p class="dim">no skills found</p>';
    agentsEl.innerHTML = (d.agents || []).map(a => `
      <div class="lib-card" data-path="${esc(a.path)}" style="padding:8px 4px;cursor:pointer;border-bottom:1px solid var(--rule);">
        <strong style="font-size:12.5px;color:#fff;">${esc(a.name)}</strong>
        <p style="margin:2px 0 0;font-size:11.5px;color:var(--paper-300);">${esc(a.description).slice(0,140)}</p>
      </div>
    `).join('') || '<p class="dim">no agents found</p>';
    document.querySelectorAll('.lib-card[data-path]').forEach(c =>
      c.addEventListener('click', () => openDoc(c.dataset.path)));
  }

  async function openDoc(path) {
    try {
      const r = await fetch('/api/ruview/file?path=' + encodeURIComponent(path));
      const d = await r.json();
      if (d.markdown == null) { docEl.style.display='none'; return; }
      docEl.style.display = 'block';
      docEl.innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#fff;font-size:13px;">${esc(path)}</strong>
          <button class="btn xs" id="rvClose">close</button>
        </div>
        <pre class="log term" style="max-height:60vh;">${esc(d.markdown)}</pre>`;
      document.getElementById('rvClose').addEventListener('click', () => docEl.style.display='none');
      docEl.scrollIntoView({ behavior:'smooth', block:'nearest' });
    } catch (e) { docEl.style.display='none'; }
  }

  function esc(s){return String(s ?? '').replace(/[<&]/g,c=>({'<':'&lt;','&':'&amp;'}[c]));}

  document.addEventListener('tab:activate', e => { if (e.detail.id === 'ruview' && !loaded) load(); });
}
