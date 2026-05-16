// Tools tab — list of repo scripts grouped by purpose, click → run, stream output to /ws/log.
export function initTools() {
  const wrap = document.getElementById('toolCards');
  async function refresh() {
    try {
      const r = await fetch('/api/tools'); const d = await r.json();
      wrap.innerHTML = '';
      (d.groups || []).forEach(g => {
        const card = document.createElement('div'); card.className = 'card';
        card.innerHTML = `<h3>${g.title}</h3><p class="dim" style="font-size:12px">${g.desc||''}</p>`;
        g.items.forEach(it => {
          const b = document.createElement('button');
          b.className = 'btn xs'; b.textContent = it.label;
          b.title = it.cmd;
          b.style.marginRight = '6px'; b.style.marginBottom = '6px';
          b.addEventListener('click', () => fetch('/api/tools/run', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ id: it.id })
          }));
          card.appendChild(b);
        });
        wrap.appendChild(card);
      });
    } catch (e) {
      wrap.innerHTML = `<div class="card"><p class="err">tools unavailable: ${e}</p></div>`;
    }
  }
  document.addEventListener('tab:activate', e => { if (e.detail.id === 'tools') refresh(); });
  refresh();
}
