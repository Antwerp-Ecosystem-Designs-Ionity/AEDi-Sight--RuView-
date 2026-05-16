// Tools tab — repo scripts grouped, click → modal with --help + args input.
export function initTools() {
  const wrap = document.getElementById('toolCards');
  let modal = null;

  async function refresh() {
    try {
      const r = await fetch('/api/tools'); const d = await r.json();
      wrap.innerHTML = '';
      (d.groups || []).forEach(g => {
        const card = document.createElement('div'); card.className = 'card';
        card.innerHTML = `<h3>${esc(g.title)}</h3><p class="dim" style="font-size:12px">${esc(g.desc||'')}</p>`;
        const row = document.createElement('div'); row.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';
        g.items.forEach(it => {
          const b = document.createElement('button');
          b.className = 'btn xs'; b.textContent = it.label; b.title = it.id;
          b.addEventListener('click', () => openModal(it));
          row.appendChild(b);
        });
        card.appendChild(row);
        wrap.appendChild(card);
      });
    } catch (e) {
      wrap.innerHTML = `<div class="card"><p class="err">tools unavailable: ${e}</p></div>`;
    }
  }

  function openModal(it) {
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);';
    modal.innerHTML = `
      <div class="card accent" style="width:min(720px,92vw);max-height:84vh;overflow:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
          <strong style="color:#fff;font-size:14px;">${esc(it.label)}</strong>
          <span class="chip dim mono">${esc(it.id)}</span>
        </div>
        <label style="margin-bottom:10px;">Args (whitespace-split, no shell)
          <input id="tlArgs" placeholder="--flag value …" autocomplete="off" />
        </label>
        <div style="margin-bottom:8px;"><strong style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--paper-300);">Help / source preview</strong></div>
        <pre id="tlHelp" class="log" style="max-height:300px;">loading…</pre>
        <div class="row gap" style="margin-top:14px;">
          <button class="btn primary" id="tlRun">run</button>
          <button class="btn ghost" id="tlClose">cancel</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.getElementById('tlClose').addEventListener('click', close);
    document.getElementById('tlRun').addEventListener('click', async () => {
      const args = document.getElementById('tlArgs').value;
      try {
        const r = await fetch('/api/tools/run', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id: it.id, args }) });
        const d = await r.json();
        if (d.error) { alert(d.error); return; }
        close();
      } catch (e) { alert(e); }
    });
    // Load help
    fetch('/api/tools/help?id=' + encodeURIComponent(it.id))
      .then(r => r.json())
      .then(d => { document.getElementById('tlHelp').textContent = d.help || '(no help / unknown script)'; })
      .catch(() => { document.getElementById('tlHelp').textContent = '(help unavailable)'; });
  }
  function close() { if (modal) { modal.remove(); modal = null; } }

  function esc(s){return String(s ?? '').replace(/[<&]/g,c=>({'<':'&lt;','&':'&amp;'}[c]));}
  document.addEventListener('tab:activate', e => { if (e.detail.id === 'tools') refresh(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal) close(); });
  refresh();
}
