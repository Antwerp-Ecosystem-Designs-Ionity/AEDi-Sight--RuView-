// Live log tail — appends 'log' topic to the pre.
import { wsBus } from '../wsbus.js';

export function initLogs() {
  const pre = document.getElementById('logTail');
  let buf = [];
  wsBus.on('log', m => {
    buf.push(m.data.line || '');
    if (buf.length > 800) buf = buf.slice(-800);
    pre.textContent = buf.join('\n');
    pre.scrollTop = pre.scrollHeight;
  });
  document.addEventListener('tab:activate', e => {
    if (e.detail.id === 'logs') {
      fetch('/api/logs/recent').then(r => r.json()).then(d => {
        if (d.lines) { buf = d.lines; pre.textContent = buf.join('\n'); pre.scrollTop = pre.scrollHeight; }
      }).catch(()=>{});
    }
  });
}
