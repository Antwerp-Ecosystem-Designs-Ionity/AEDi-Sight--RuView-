// Unified WebSocket bus.
// Server multiplexes everything onto /ws. Messages are JSON with `topic` + `data`.
// Topics: csi, log, chat, provision, fleet, ml, git.
class WsBus extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
    this._retry = 0;
  }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws`;
    try { this.ws = new WebSocket(url); } catch (e) { this._scheduleRetry(); return; }
    this.ws.onopen = () => {
      this.connected = true; this._retry = 0;
      this.dispatchEvent(new CustomEvent('open'));
    };
    this.ws.onmessage = ev => {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg || !msg.topic) return;
      this.dispatchEvent(new CustomEvent('msg:' + msg.topic, { detail: msg }));
      this.dispatchEvent(new CustomEvent('msg', { detail: msg }));
    };
    this.ws.onclose = () => { this.connected = false; this._scheduleRetry(); };
    this.ws.onerror = ()  => { /* close handler will retry */ };
  }
  send(topic, data) {
    if (!this.connected || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify({ topic, data }));
    return true;
  }
  on(topic, fn) { this.addEventListener('msg:' + topic, e => fn(e.detail)); }
  _scheduleRetry() {
    const delay = Math.min(15000, 600 * (++this._retry));
    setTimeout(() => this.connect(), delay);
  }
}
export const wsBus = new WsBus();
