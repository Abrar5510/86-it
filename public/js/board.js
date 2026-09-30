// Shared client for the Kitchen Durable Object. Every screen uses this.
//   const board = connectBoard({ onState, onAlert, onStatus });
//   const result = await board.act({ type: 'mark_86', item: 'salmon' });
// `station` identifies a voice station (kds/foh/menu pass nothing and are plain screens).
// Late-ticket alerts are routed to the station that fired the ticket.

export function connectBoard({ station = '', onState = () => {}, onAlert = () => {}, onStatus = () => {} } = {}) {
  let ws;
  let seq = 0;
  let retry = 0;
  const pending = new Map();
  const queue = [];

  function open() {
    const q = station ? `?station=${encodeURIComponent(station)}` : '';
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${q}`);
    ws.onopen = () => {
      retry = 0;
      onStatus(true);
      while (queue.length) ws.send(queue.shift());
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return; // one malformed frame must not stop state updates for the page
      }
      if (msg.type === 'state') onState(msg.state);
      else if (msg.type === 'alert') onAlert(msg);
      else if (msg.type === 'ack') {
        pending.get(msg.id)?.(msg.result);
        pending.delete(msg.id);
      }
    };
    ws.onclose = () => {
      onStatus(false);
      setTimeout(open, Math.min(5000, 250 * 2 ** retry++));
    };
  }
  open();

  return {
    act(action, timeoutMs = 5000) {
      const id = ++seq;
      const data = JSON.stringify({ type: 'action', id, action });
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ ok: false, error: 'board_timeout' });
        }, timeoutMs);
        pending.set(id, (result) => {
          clearTimeout(timer); // don't hold the timer (and this closure) for the full window
          resolve(result);
        });
        ws.readyState === WebSocket.OPEN ? ws.send(data) : queue.push(data);
      });
    },
  };
}

export const minutesSince = (ts) => Math.max(0, Math.floor((Date.now() - ts) / 60000));
export const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
