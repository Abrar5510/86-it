import { DurableObject } from 'cloudflare:workers';
import menu from '../data/menu.json';
import { initialState, applyAction, dueAlerts, rushTickets } from './state.js';

const ALARM_EVERY_MS = 15_000;

// Voice stations open `/ws?station=<id>`; kds/foh/menu open plain `/ws` and are screens.
const stationId = (value) => (/^[\w-]{1,24}$/.test(value || '') ? value : null);

// One Durable Object instance ("main") = one restaurant. Holds authoritative state and
// fans every change out to all connected screens over hibernatable WebSockets.
export class Kitchen extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get('state')) || initialState(menu);
    });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    // Survives hibernation, so alert routing still works after the object wakes up.
    const station = stationId(new URL(request.url).searchParams.get('station'));
    try { server.serializeAttachment({ station }); } catch {}
    server.send(JSON.stringify({ type: 'state', state: this.state }));
    return new Response(null, { status: 101, webSocket: client });
  }

  // null = a screen (kds/foh/menu), a string = a voice station id.
  stationOf(ws) {
    try {
      const a = ws.deserializeAttachment?.();
      return (a && typeof a === 'object' && a.station) || null;
    } catch {
      return null;
    }
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return ws.send(JSON.stringify({ type: 'error', error: 'bad_json' }));
    }
    if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', id: msg.id }));
    if (msg.type !== 'action') return;
    const result = await this.act(msg.action || {}, this.stationOf(ws));
    ws.send(JSON.stringify({ type: 'ack', id: msg.id, result }));
  }

  webSocketClose(ws, code) {
    try { ws.close(code, 'bye'); } catch {}
  }

  // `station` is the voice station that issued the action (null for screens);
  // the reducer stamps it on the ticket so late-ticket alerts know who to tell.
  async act(action, station = null) {
    if (action.type === 'reset') {
      this.state = initialState(menu);
      await this.commit();
      return { ok: true, say: 'Reset.' };
    }
    if (action.type === 'seed_rush') {
      this.state = initialState(menu);
      for (const t of rushTickets()) this.state = applyAction(this.state, { type: 'add_ticket', ...t }).state;
      await this.commit();
      return { ok: true, say: 'Rush seeded.' };
    }
    const { state, result } = applyAction(this.state, station ? { ...action, station } : action);
    if (state !== this.state) {
      this.state = state;
      await this.commit();
    }
    return result;
  }

  async commit() {
    await this.ctx.storage.put('state', this.state);
    this.broadcast({ type: 'state', state: this.state });
    if (this.state.tickets.some((t) => t.status === 'fired' && !t.alerted) && !(await this.ctx.storage.getAlarm())) {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_EVERY_MS);
    }
  }

  async alarm() {
    const due = dueAlerts(this.state);
    if (!due.length) {
      if (this.state.tickets.some((t) => t.status === 'fired' && !t.alerted)) await this.ctx.storage.setAlarm(Date.now() + ALARM_EVERY_MS);
      return;
    }
    for (const t of due) {
      this.state = applyAction(this.state, { type: 'mark_alerted', id: t.id }).state;
      const minutes = Math.round((Date.now() - t.createdAt) / 60000);
      this.routeAlert({ type: 'alert', table: t.table, text: `Table ${t.table}, ${minutes} minutes.`, station: t.station || null }, t.station);
    }
    await this.commit();
  }

  // Tell the station that fired the ticket. If it's offline (or nothing owns the ticket),
  // fall back to every connected station so the alert is never silently dropped.
  routeAlert(msg, target) {
    const sockets = this.ctx.getWebSockets();
    const stations = sockets.filter((ws) => this.stationOf(ws));
    const route = target && stations.some((ws) => this.stationOf(ws) === target)
      ? stations.filter((ws) => this.stationOf(ws) === target)
      : stations.length ? stations : sockets;
    const data = JSON.stringify(msg);
    for (const ws of route) {
      try { ws.send(data); } catch {}
    }
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch {}
    }
  }
}
