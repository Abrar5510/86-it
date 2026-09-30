// Shared client for the Kitchen Durable Object. Every screen uses this.
//   const board = connectBoard({ onState, onAlert, onStatus });
//   const result = await board.act({ type: 'mark_86', item: 'salmon' });

export function connectBoard({ onState = () => {}, onAlert = () => {}, onStatus = () => {} } = {}) {
  let ws;
  let seq = 0;
  let retry = 0;
  const pending = new Map();
  const queue = [];

  function open() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      retry = 0;
      onStatus(true);
      while (queue.length) ws.send(queue.shift());
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
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
        pending.set(id, resolve);
        setTimeout(() => pending.has(id) && (pending.delete(id), resolve({ ok: false, error: 'board_timeout' })), timeoutMs);
        ws.readyState === WebSocket.OPEN ? ws.send(data) : queue.push(data);
      });
    },
  };
}

export const minutesSince = (ts) => Math.max(0, Math.floor((Date.now() - ts) / 60000));
export const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
