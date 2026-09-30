import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessionConfig } from './session.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const args = { config: JSON.parse(read('../agent/station.json')), menu: JSON.parse(read('../data/menu.json')), prompt: read('../agent/prompt.md') };

test('sessionConfig matches the pinned current session config', () => {
  // session-2026-09-17.json is kept as the config behind the recorded Sep 17 eval;
  // 2026-09-26 adds number keyterms (one..twenty) so digits are not biased into menu names.
  assert.deepEqual(sessionConfig(args), JSON.parse(read('../test/fixtures/session-2026-09-26.json')));
});

test('voice_focus can be switched off', () => {
  const s = sessionConfig({ ...args, voiceFocus: false });
  assert.equal(s.input.voice_focus, undefined);
  assert.equal(s.input.voice_focus_threshold, undefined);
});
