// Pure kitchen state + reducer. Shared by the Durable Object, the tests and the eval harness.
// applyAction(state, action, now) -> { state, result }. Never mutates its input.
import { matchItem } from '../public/js/match.js';
export { matchItem };

const OPEN = new Set(['new', 'fired', 'held']);
const LOG_MAX = 40;
export const ALERT_AFTER_MS = 10 * 60 * 1000;

export function initialState(menu, now = Date.now()) {
  return {
    items: menu.map((m) => ({ ...m, aliases: m.aliases || [], out: m.count <= 0, outAt: m.count <= 0 ? now : null })),
    tickets: [],
    log: [],
    nextTicket: 1,
  };
}

const age = (t, now) => Math.round((now - t.createdAt) / 60000);
const findTicket = (state, table) =>
  [...state.tickets].reverse().find((t) => t.table === Number(table) && OPEN.has(t.status));

const fail = (state, error, extra = {}) => ({ state, result: { ok: false, error, ...extra } });

export function applyAction(prev, action, now = Date.now()) {
  const state = structuredClone(prev);
  const { type } = action;
  const log = (text) => {
    state.log.unshift({ at: now, text });
    state.log.length = Math.min(state.log.length, LOG_MAX);
  };
  const ok = (say, extra = {}) => ({ state, result: { ok: true, say, ...extra } });

  const withTicket = (fn) => {
    const t = findTicket(state, action.table);
    if (!t) return fail(prev, 'no_open_ticket', { say: `No open ticket for ${action.table}.` });
    return fn(t);
  };
  const withItem = (fn) => {
    const m = matchItem(state.items, action.item);
    if (!m.item) return fail(prev, 'unknown_item', { options: m.options, say: 'Which item?' });
    return fn(m.item);
  };

  switch (type) {
    case 'fire_ticket':
      return withTicket((t) => {
        t.status = 'fired';
        t.firedAt = now;
        // Which voice station fired it owns its late-ticket alert (screens don't set one).
        if (action.station) t.station = action.station;
        log(`Fired table ${t.table}`);
        return ok(`Fired ${t.table}.`);
      });

    case 'hold_ticket':
      return withTicket((t) => {
        t.status = 'held';
        log(`Held table ${t.table}`);
        return ok(`Holding ${t.table}.`);
      });

    case 'bump_ticket':
      return withTicket((t) => {
        t.status = 'done';
        t.doneAt = now;
        log(`Bumped table ${t.table}`);
        return ok(`Bumped ${t.table}.`);
      });

    // Undo: put a ticket that left the board (or was fired/held) back as a fresh "new" ticket.
    case 'reopen_ticket': {
      const t = [...state.tickets].reverse().find((x) => x.table === Number(action.table) && ['new', 'fired', 'held', 'done', 'void'].includes(x.status));
      if (!t || t.status === 'new') return fail(prev, 'no_finished_ticket', { say: `Nothing to put back for ${action.table}.` });
      t.status = 'new';
      t.doneAt = null;
      t.alerted = false;
      log(`Reopened table ${t.table}`);
      return ok(`Table ${t.table} back on.`, { table: t.table });
    }

    case 'void_ticket':
      if (action.confirmed !== true) return fail(prev, 'needs_confirmation', { say: `Void ${action.table}?` });
      return withTicket((t) => {
        t.status = 'void';
        log(`Voided table ${t.table}`);
        return ok(`Voided ${t.table}.`);
      });

    // Allergies accumulate: "12 has a nut allergy" followed by "12 has a shellfish allergy"
    // must leave both on the ticket, never just the most recent one.
    case 'flag_allergy': {
      return withTicket((t) => {
        const allergen = String(action.allergen ?? '').trim().toLowerCase() || 'allergy';
        const list = t.allergy ? t.allergy.split(', ') : [];
        if (!list.includes(allergen)) list.push(allergen);
        t.allergy = list.join(', ');
        log(`Allergy on table ${t.table}: ${t.allergy}`);
        return ok(`${t.table}: ${t.allergy} flagged.`);
      });
    }

    case 'ticket_status':
      return withTicket((t) => {
        const waiting = t.lines.map((l) => `${l.qty} ${l.name}`).join(', ');
        return ok(`${t.table}: ${age(t, now)} minutes, ${t.status}.`, {
          table: t.table, status: t.status, minutes: age(t, now), items: waiting, allergy: t.allergy || null,
        });
      });

    case 'mark_86':
      return withItem((it) => {
        const remaining = Math.max(0, Number.isFinite(Number(action.remaining)) ? Number(action.remaining) : 0);
        it.count = remaining;
        it.out = remaining === 0;
        it.outAt = it.out ? now : null;
        log(it.out ? `86 ${it.name}` : `${it.name}: ${remaining} left`);
        return ok(it.out ? `86 ${it.name}.` : `${it.name}, ${remaining} left.`, { item: it.name, remaining });
      });

    case 'restore_item':
      return withItem((it) => {
        it.count = Math.max(1, Number(action.count) || 10);
        it.out = false;
        it.outAt = null;
        log(`${it.name} back on`);
        return ok(`${it.name} back on.`, { item: it.name, remaining: it.count });
      });

    case 'all_day':
      return withItem((it) => {
        const openTickets = state.tickets.filter((t) => OPEN.has(t.status));
        const qty = openTickets
          .flatMap((t) => t.lines)
          .filter((l) => l.id === it.id)
          .reduce((n, l) => n + l.qty, 0);
        const plural = openTickets.length === 1 ? '' : 's';
        return ok(`${qty} ${it.name} all day. ${openTickets.length} open ticket${plural}.`, { item: it.name, all_day: qty, remaining: it.count });
      });

    case 'inventory_lookup':
      return withItem((it) => ok(it.out ? `${it.name} is 86.` : `${it.count} ${it.name} left.`, { item: it.name, remaining: it.count, out: it.out }));

    case 'add_ticket': {
      const lines = [];
      for (const l of action.lines || []) {
        // Actions arrive over an unauthenticated WebSocket, so quantities and table numbers are
        // validated here rather than trusted: a negative qty used to *add* stock back.
        const qty = Math.floor(Number(l.qty ?? 1));
        if (!Number.isFinite(qty) || qty < 1) return fail(prev, 'bad_quantity', { say: 'How many?' });
        const m = matchItem(state.items, l.item);
        if (!m.item) return fail(prev, 'unknown_item', { options: m.options });
        if (m.item.out || m.item.count < qty) return fail(prev, 'sold_out', { item: m.item.name });
        m.item.count -= qty;
        if (m.item.count === 0) {
          m.item.out = true;
          m.item.outAt = now;
          log(`86 ${m.item.name} (sold through)`);
        }
        lines.push({ id: m.item.id, name: m.item.name, qty });
      }
      if (!lines.length) return fail(prev, 'empty_ticket');
      const wanted = action.table == null ? NaN : Number(action.table);
      const table = Number.isInteger(wanted) && wanted >= 1 && wanted <= 9999 ? wanted : 100 + state.nextTicket;
      state.tickets.push({
        id: state.nextTicket++, table, lines, status: 'new', source: action.source || 'pos',
        createdAt: action.createdAt ?? now, allergy: null, alerted: false,
      });
      log(`New ticket: table ${table} (${action.source || 'pos'})`);
      return ok(`Ticket ${table} in.`, { table });
    }

    case 'mark_alerted': {
      const t = state.tickets.find((x) => x.id === action.id);
      if (t) t.alerted = true;
      return ok('');
    }

    default:
      return fail(prev, 'unknown_action');
  }
}

// Fired tickets past the threshold that haven't been announced yet.
export const dueAlerts = (state, now = Date.now()) =>
  state.tickets.filter((t) => t.status === 'fired' && !t.alerted && now - t.createdAt >= ALERT_AFTER_MS);

// A believable dinner rush for demos.
export function rushTickets(now = Date.now()) {
  const m = 60000;
  return [
    { table: 4, lines: [{ item: 'short rib', qty: 2 }, { item: 'fries' }], createdAt: now - 10 * m },
    { table: 7, lines: [{ item: 'risotto' }, { item: 'caesar', qty: 2 }], createdAt: now - 14 * m },
    { table: 9, lines: [{ item: 'burger', qty: 3 }, { item: 'fries', qty: 2 }], createdAt: now - 6 * m },
    { table: 12, lines: [{ item: 'salmon', qty: 2 }, { item: 'calamari' }], createdAt: now - 3 * m },
    { table: 15, lines: [{ item: 'chicken' }, { item: 'soup' }], createdAt: now - 1 * m },
  ];
}
