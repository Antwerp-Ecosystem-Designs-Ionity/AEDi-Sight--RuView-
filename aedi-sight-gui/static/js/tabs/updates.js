// Updates tab — git status / pull / fetch + CHANGELOG view.
export function initUpdates() {
  const $ = sel => document.querySelector(sel);
  async function refresh() {
    try {
      const r = await fetch('/api/git/status'); const d = await r.json();
      $('#gitBranch').textContent = d.branch || '—';
      $('#gitHead').textContent   = d.head ? d.head.slice(0,8) + ' · ' + (d.head_subject || '') : '—';
      $('#gitBehind').textContent = d.behind != null ? d.behind + ' commits' : '—';
    } catch (e) { $('#gitBranch').textContent = 'error'; }
  }
  async function changelog() {
    try {
      const r = await fetch('/api/changelog'); const d = await r.json();
      $('#changelog').textContent = d.text || '';
    } catch (_) {}
  }
  async function run(op, label) {
    const out = $('#gitOut'); out.textContent = `→ ${label || op}...\n`;
    try {
      const r = await fetch('/api/git/' + op, { method:'POST' });
      const d = await r.json();
      out.textContent += (d.stdout || '') + (d.stderr || '');
      refresh();
    } catch (e) { out.textContent += '\nerror: ' + e; }
  }
  $('#gitPull').addEventListener('click', () => run('pull', 'git pull --rebase'));
  $('#gitFetch').addEventListener('click', () => run('fetch', 'git fetch'));
  $('#gitOpenLog').addEventListener('click', () => run('log', 'git log -n 10'));

  document.addEventListener('tab:activate', e => { if (e.detail.id === 'updates') { refresh(); changelog(); } });
  refresh(); changelog();
}
