// Scores the station's instant lane offline: runs the grammar (public/js/intent.js) over the final
// transcripts in recorded Voice Agent eval runs, with no new sessions or credits.
//   node eval/replay.js [results/<run> ...]     default: the Sep 17 clean + noisy runs
// Hybrid = the grammar acts if it matches; otherwise the recorded LLM tool call stands.
// A grammar action that is wrong (or fires on chatter) counts as a failure even if the LLM got it right.
import { readFileSync, existsSync } from 'node:fs';
import { initialState, matchItem } from '../src/state.js';
import { parse } from '../public/js/intent.js';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./', import.meta.url));
const menu = JSON.parse(readFileSync(new URL('../data/menu.json', import.meta.url)));
const { items } = initialState(menu);
const cases = JSON.parse(readFileSync(`${dir}commands.json`, 'utf8'));
const runs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['results/2026-09-17T15-14-59-333Z-clean', 'results/2026-09-17T15-25-56-092Z-noisy'];

// Same rule as eval/run.js: right tool, and right args (items compared by menu id).
function correct(c, action) {
  if (c.expect.tool === null) return !action || (c.allowTools || []).includes(action.type);
  if (action?.type !== c.expect.tool) return false;
  return Object.entries(c.expect.args || {}).every(([k, v]) =>
    k === 'item' ? matchItem(items, action.item).item?.id === v : Number(action[k] ?? 0) === Number(v));
}

const median = (xs) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

for (const run of runs) {
  const rows = Object.fromEntries(JSON.parse(readFileSync(`${dir}${run}/summary.json`, 'utf8')).rows.map((r) => [r.id, r]));
  const tally = { n: 0, fast: 0, fastWrong: [], llm: 0, hybrid: 0, cmds: 0, fastMs: [], llmMs: [] };
  for (const c of cases) {
    const file = `${dir}${run}/${c.id}/events.jsonl`;
    if (!existsSync(file) || !rows[c.id]) continue;
    const events = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    let stopped = null;
    let fast = null;
    let firstCall = null;
    for (const e of events) {
      if (e.type === 'input.speech.stopped') stopped = e.t;
      if (e.type === 'transcript.user' && !fast) {
        const a = parse(e.text, items)?.action;
        if (a && a.type !== 'void_ticket') fast = { a, ms: e.t - stopped, heard: e.text };
      }
      if (e.type === 'tool.call' && !firstCall) firstCall = e.t - stopped;
    }
    tally.n++;
    const llmPass = rows[c.id].pass;
    const fastPass = fast ? correct(c, fast.a) : null;
    const hybrid = fast ? fastPass : llmPass;
    if (fast && c.expect.tool) tally.fast++;
    if (fast && !fastPass) tally.fastWrong.push(`${c.id}: heard "${fast.heard}" → ${JSON.stringify(fast.a)}`);
    tally.llm += llmPass;
    tally.hybrid += hybrid;
    if (c.expect.tool) {
      tally.cmds++;
      if (fastPass) tally.fastMs.push(fast.ms);
      if (firstCall != null) tally.llmMs.push(firstCall);
    }
  }
  const { n } = tally;
  console.log(`\n${run}`);
  console.log(`  instant lane acted on   ${tally.fast}/${tally.cmds} commands`);
  console.log(`  instant lane wrong      ${tally.fastWrong.length}${tally.fastWrong.map((w) => `\n    ✗ ${w}`).join('')}`);
  console.log(`  pass, LLM only          ${tally.llm}/${n}`);
  console.log(`  pass, hybrid            ${tally.hybrid}/${n}`);
  console.log(`  speech end → action p50 instant ${median(tally.fastMs)} ms · LLM tool.call ${median(tally.llmMs)} ms  (+ board round trip)`);
}
