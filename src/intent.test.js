import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../public/js/intent.js';
import { matchItem } from '../public/js/match.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const items = read('../data/menu.json');

test('every eval phrase parses to the expected action; chatter to nothing', () => {
  for (const c of read('../eval/commands.json')) {
    const r = parse(c.text, items);
    const want = c.expect;
    if (want.tool === null && !c.allowTools && c.id !== 'void-asks') {
      assert.equal(r, null, `${c.id}: "${c.text}" should be ignored`);
      continue;
    }
    const tool = want.tool || (c.id === 'void-asks' ? 'void_ticket' : c.allowTools[0]);
    assert.equal(r?.action?.type, tool, `${c.id}: "${c.text}"`);
    for (const [k, v] of Object.entries(want.args || {})) {
      const got = r.action[k];
      if (k === 'item') assert.equal(matchItem(items, got).item?.id, v, `${c.id}: item "${got}"`);
      else assert.equal(got, v, `${c.id}: ${k}`);
    }
  }
});

test('transcript variants: digits, hyphens, apostrophes, homophones', () => {
  const t = (s) => parse(s, items)?.action;
  assert.deepEqual(t('86 salmon.'), { type: 'mark_86', item: 'salmon', remaining: 0 });
  assert.equal(t('Eighty-six the fish')?.item, 'fish');
  assert.equal(t('Fire for on the fly.')?.table, 4);
  assert.equal(t('Fire twenty-one')?.table, 21);
  assert.equal(t("Where's 9 at?")?.type, 'ticket_status');
  assert.equal(t("12's up")?.type, 'bump_ticket');
  assert.equal(t('Un-86 the soup')?.type, 'restore_item');
  assert.equal(t('I got chicken'), undefined);
  assert.equal(t("I'll be back"), undefined);
});

test('void needs a yes', () => {
  const ask = parse('Void seven.', items).action;
  assert.equal(ask.confirmed, false);
  assert.deepEqual(parse('Yes.', items, ask).action, { ...ask, confirmed: true });
  assert.deepEqual(parse('No, keep it.', items, ask), { reply: 'Kept.' });
  assert.equal(parse('Yes.', items), null); // no pending void: "yes" alone does nothing
});
