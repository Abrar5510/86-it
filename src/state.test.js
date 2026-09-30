import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialState, applyAction, matchItem, dueAlerts, rushTickets, ALERT_AFTER_MS } from './state.js';

const menu = JSON.parse(readFileSync(new URL('../data/menu.json', import.meta.url)));
const NOW = 1_700_000_000_000;

function seeded() {
  let s = initialState(menu, NOW);
  for (const t of rushTickets(NOW)) s = applyAction(s, { type: 'add_ticket', ...t }, NOW).state;
  return s;
}

test('matchItem: exact, alias, fuzzy, unknown', () => {
  const items = initialState(menu).items;
  assert.equal(matchItem(items, 'Salmon').item.id, 'salmon');
  assert.equal(matchItem(items, 'the fish').item.id, 'salmon');
  assert.equal(matchItem(items, 'short ribs').item.id, 'short-rib');
  assert.equal(matchItem(items, 'risoto').item.id, 'risotto');
  assert.equal(matchItem(items, 'creme brûlée').item.id, 'creme-brulee');
  assert.equal(matchItem(items, 'lobster').item, undefined);
});

test('mark_86 marks item out and does not mutate input', () => {
  const s = seeded();
  const { state, result } = applyAction(s, { type: 'mark_86', item: 'fish' }, NOW);
  assert.equal(result.ok, true);
  assert.equal(state.items.find((i) => i.id === 'salmon').out, true);
  assert.equal(s.items.find((i) => i.id === 'salmon').out, false);
});

test('mark_86 with remaining sets count without going out', () => {
  const { state, result } = applyAction(seeded(), { type: 'mark_86', item: 'short rib', remaining: 2 }, NOW);
  assert.equal(result.say, 'Short Rib, 2 left.');
  assert.equal(state.items.find((i) => i.id === 'short-rib').out, false);
});

test('unknown item asks which item', () => {
  const { result } = applyAction(seeded(), { type: 'mark_86', item: 'lobster' }, NOW);
  assert.deepEqual([result.ok, result.error, result.say], [false, 'unknown_item', 'Which item?']);
});

test('fire / hold / bump lifecycle', () => {
  let s = seeded();
  s = applyAction(s, { type: 'fire_ticket', table: 12 }, NOW).state;
  assert.equal(s.tickets.find((t) => t.table === 12).status, 'fired');
  s = applyAction(s, { type: 'hold_ticket', table: '12' }, NOW).state;
  assert.equal(s.tickets.find((t) => t.table === 12).status, 'held');
  s = applyAction(s, { type: 'bump_ticket', table: 12 }, NOW).state;
  assert.equal(s.tickets.find((t) => t.table === 12).status, 'done');
  const { result } = applyAction(s, { type: 'fire_ticket', table: 12 }, NOW);
  assert.equal(result.error, 'no_open_ticket');
});

test('reopen_ticket brings a bumped ticket back', () => {
  let s = seeded();
  s = applyAction(s, { type: 'bump_ticket', table: 12 }, NOW).state;
  const { state, result } = applyAction(s, { type: 'reopen_ticket', table: '12' }, NOW);
  assert.deepEqual([result.ok, result.say], [true, 'Table 12 back on.']);
  assert.equal(state.tickets.find((t) => t.table === 12).status, 'new');
  assert.equal(applyAction(state, { type: 'fire_ticket', table: 12 }, NOW).result.ok, true);
  assert.equal(applyAction(s, { type: 'reopen_ticket', table: 99 }, NOW).result.error, 'no_finished_ticket');
});

test('void requires confirmation', () => {
  const s = seeded();
  const r1 = applyAction(s, { type: 'void_ticket', table: 7 }, NOW);
  assert.equal(r1.result.error, 'needs_confirmation');
  assert.equal(r1.state, s);
  const r2 = applyAction(s, { type: 'void_ticket', table: 7, confirmed: true }, NOW);
  assert.equal(r2.state.tickets.find((t) => t.table === 7).status, 'void');
});

test('ticket_status and all_day', () => {
  const s = seeded();
  const st = applyAction(s, { type: 'ticket_status', table: 7 }, NOW).result;
  assert.equal(st.minutes, 14);
  assert.equal(applyAction(s, { type: 'all_day', item: 'fries' }, NOW).result.all_day, 3);
});

test('orders deplete stock and 86 items automatically; sold-out orders are rejected', () => {
  let s = initialState(menu, NOW);
  s = applyAction(s, { type: 'add_ticket', lines: [{ item: 'creme brulee', qty: 6 }], source: 'online' }, NOW).state;
  assert.equal(s.items.find((i) => i.id === 'creme-brulee').out, true);
  const r = applyAction(s, { type: 'add_ticket', lines: [{ item: 'brulee' }] }, NOW);
  assert.equal(r.result.error, 'sold_out');
  assert.equal(r.state.tickets.length, 1);
});

test('dueAlerts only for fired, old, unannounced tickets', () => {
  let s = seeded();
  assert.equal(dueAlerts(s, NOW).length, 0);
  s = applyAction(s, { type: 'fire_ticket', table: 4 }, NOW).state;
  s = applyAction(s, { type: 'fire_ticket', table: 15 }, NOW).state;
  const due = dueAlerts(s, NOW);
  assert.deepEqual(due.map((t) => t.table), [4]);
  s = applyAction(s, { type: 'mark_alerted', id: due[0].id }, NOW).state;
  assert.equal(dueAlerts(s, NOW + ALERT_AFTER_MS).length, 1); // table 15 later
});

test('report summarises the night', () => {
  let s = seeded();
  s = applyAction(s, { type: 'mark_86', item: 'salmon' }, NOW).state;
  const r = applyAction(s, { type: 'report' }, NOW).result;
  assert.deepEqual(r.out_of_stock, ['Salmon']);
  assert.equal(r.open_tickets, 5);
});

test('fire_ticket records the owning station for alert routing', () => {
  let s = seeded();
  assert.equal(s.tickets.find((t) => t.table === 4).station, undefined);
  s = applyAction(s, { type: 'fire_ticket', table: 4, station: 'expo' }, NOW).state;
  assert.equal(s.tickets.find((t) => t.table === 4).station, 'expo');
  // A screen tap carries no station and must not clear ownership.
  s = applyAction(s, { type: 'hold_ticket', table: 4 }, NOW).state;
  s = applyAction(s, { type: 'fire_ticket', table: 4 }, NOW).state;
  assert.equal(s.tickets.find((t) => t.table === 4).station, 'expo');
  // A different station firing the ticket takes over the alert.
  s = applyAction(s, { type: 'fire_ticket', table: 4, station: 'line' }, NOW).state;
  assert.equal(s.tickets.find((t) => t.table === 4).station, 'line');
});
