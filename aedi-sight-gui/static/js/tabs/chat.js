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
    // Slash-commands stay synchronous (cheap, local). Everything else streams.
    const endpoint = text.startsWith('/') ? '/api/chat' : '/api/chat/stream';
    try {
      const r = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
      const d = await r.json();
      if (d.lines) d.lines.forEach(l => line('··', l));
      if (d.reply) line('claude »', d.reply, 'info');
      if (d.streaming) line('··', '(streaming…)', 'info');
    } catch (e) { line('!!', String(e), 'err'); }
  });

  wsBus.on('chat', m => line('claude »', m.data.line || JSON.stringify(m.data), m.data.cls || 'info'));
}
