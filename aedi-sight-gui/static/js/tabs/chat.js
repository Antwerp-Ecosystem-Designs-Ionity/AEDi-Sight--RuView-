// Terminal-style chat.
// /command runs a server-side helper; bare text goes to the chat backend (claude-flow if installed).
import { wsBus } from '../wsbus.js';

export function initChat() {
  const log   = document.getElementById('chatLog');
  const form  = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');

  function line(prefix, text, cls='') {
    const div = document.createElement('div');
    div.innerHTML = `<span class="${cls}">${esc(prefix)}</span> <span>${esc(text)}</span>`;
    log.appendChild(div); log.scrollTop = log.scrollHeight;
  }
  function esc(s) { return String(s).replace(/[<&]/g, c => ({ '<':'&lt;','&':'&amp;' }[c])); }

  line('aedi »', 'Welcome to AEDi-Sight RuView. Type /help to see local commands, anything else is sent to chat.', 'info');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    line('you »', text, 'ok');
    try {
      const r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
      const d = await r.json();
      if (d.lines) d.lines.forEach(l => line('··', l));
      if (d.reply) line('claude »', d.reply, 'info');
    } catch (e) { line('!!', String(e), 'err'); }
  });

  wsBus.on('chat', m => line('··', m.data.line || JSON.stringify(m.data), m.data.cls || ''));
}
