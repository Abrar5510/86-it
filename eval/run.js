// Replays eval clips through the AssemblyAI Voice Agent API with the station's exact session config,
// answers tool calls from a local copy of the kitchen state, and scores the LLM's tool calls.
//   npm run eval                     clean clips
//   npm run eval -- --noisy          noisy clips
//   npm run eval -- --only 86-salmon run one case
//   npm run eval -- --no-voice-focus
// Then `node eval/replay.js results/<run>` scores the station's instant lane + hybrid on the same sessions.
// One fresh session per clip, audio sent in real time. Recorded per run:
// eval/results/<run>/<case>/{events.jsonl,input.wav} and summary.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { initialState, applyAction, matchItem, rushTickets } from '../src/state.js';
import { sessionConfig } from '../src/session.js';
import { fileURLToPath } from 'node:url';

const wav = (pcm) => {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

const dir = fileURLToPath(new URL('./', import.meta.url));
if (existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
const { ASSEMBLYAI_API_KEY, AAI_BASE = 'https://agents.assemblyai.com' } = process.env;
if (!ASSEMBLYAI_API_KEY) {
  console.error('Need ASSEMBLYAI_API_KEY in .dev.vars');
  process.exit(1);
}

const argv = process.argv.slice(2);
const noisy = argv.includes('--noisy');
const runDir = `${dir}results/${new Date().toISOString().replace(/[:.]/g, '-')}-${noisy ? 'noisy' : 'clean'}/`;
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const menu = JSON.parse(read('../data/menu.json'));
const session = sessionConfig({
  config: JSON.parse(read('../agent/station.json')), menu, prompt: read('../agent/prompt.md'),
  voiceFocus: !argv.includes('--no-voice-focus'),
});
const cases = JSON.parse(readFileSync(`${dir}commands.json`, 'utf8')).filter((c) => !only || c.id === only);

const CHUNK = 1920 * 2; // 80 ms of PCM16 at 24 kHz, same batch size as the station
const TAIL_MS = 2500; // silence after the clip so the turn can end
const MAX_WAIT_MS = 10000; // then keep streaming silence until the agent goes quiet
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const words = (t) => /[a-zA-Z0-9]/.test(t || '');

async function token() {
  const res = await fetch(`${AAI_BASE}/v1/token?expires_in_seconds=60&max_session_duration_seconds=300`, {
    headers: { Authorization: ASSEMBLYAI_API_KEY },
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).token;
}

function seeded() {
  let s = initialState(menu);
  for (const t of rushTickets()) s = applyAction(s, { type: 'add_ticket', ...t }).state;
  return s;
}

async function runCase(c) {
  const pcm = readFileSync(`${dir}audio/${c.id}${noisy ? '.noisy' : ''}.pcm`);
  let state = seeded();
  const calls = [];
  const said = [];
  const heard = [];
  const events = [];
  let sessionId = null;
  let stoppedAt = null;
  let actionAt = null;
  let voiceAt = null;
  let replying = false;
  let lastEvent = 0;
  const t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);

  const ws = new WebSocket(`${AAI_BASE.replace(/^http/, 'ws')}/v1/ws?token=${await token()}`);
  const out = (m) => {
    events.push({ t: now(), dir: 'out', ...(m.type === 'input.audio' ? { type: m.type, bytes: m.audio.length } : m) });
    ws.send(JSON.stringify(m));
  };
  const ready = new Promise((resolve, reject) => {
    ws.onerror = () => reject(new Error('socket error'));
    ws.onclose = (e) => reject(new Error(`closed ${e.code} ${e.reason}`));
    ws.onopen = () => out({ type: 'session.update', session });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const t = now();
      lastEvent = t;
      events.push({ t, dir: 'in', ...(m.type === 'reply.audio' ? { type: m.type, bytes: m.data?.length } : m) });
      switch (m.type) {
        case 'session.ready': sessionId = m.session_id; resolve(); break;
        case 'session.error': reject(new Error(`${m.code}: ${m.message}`)); break;
        case 'input.speech.stopped': stoppedAt = t; break;
        case 'transcript.user': heard.push(m.text); break;
        case 'transcript.agent.delta': if (voiceAt == null && words(m.delta)) voiceAt = t; break;
        case 'transcript.agent': if (words(m.text)) said.push(m.text); break;
        case 'reply.started': replying = true; break;
        case 'reply.done': replying = false; break;
        case 'tool.call': {
          const r = applyAction(state, { type: m.name, ...m.arguments });
          state = r.state;
          actionAt ??= t;
          calls.push({ name: m.name, args: m.arguments, ms: stoppedAt == null ? null : t - stoppedAt });
          out({ type: 'tool.result', call_id: m.call_id, result: JSON.stringify(r.result) });
        }
      }
    };
  });
  await Promise.race([ready, sleep(10000).then(() => { throw new Error('session.ready timeout'); })]);

  const silence = Buffer.alloc(CHUNK);
  const tail = Math.round((TAIL_MS / 1000) * 48000);
  const audio = Buffer.concat([pcm, Buffer.alloc(tail + CHUNK - ((pcm.length + tail) % CHUNK))]); // whole 80 ms chunks only
  const send = (b) => ws.readyState === WebSocket.OPEN && out({ type: 'input.audio', audio: b.toString('base64') });
  for (let i = 0; i < audio.length; i += CHUNK) {
    send(audio.subarray(i, i + CHUNK));
    await sleep(80);
  }
  // Keep the line open (silence) until the agent has finished replying and been quiet for 1.5 s.
  for (const end = performance.now() + MAX_WAIT_MS; performance.now() < end; await sleep(80)) {
    if (!replying && now() - lastEvent > 1500) break;
    send(silence);
  }
  if (ws.readyState === WebSocket.OPEN) out({ type: 'session.end' });
  await sleep(500);
  ws.onclose = null;
  ws.close();

  const dirOut = `${runDir}${c.id}/`;
  mkdirSync(dirOut, { recursive: true });
  writeFileSync(`${dirOut}events.jsonl`, events.map((x) => JSON.stringify(x)).join('\n') + '\n');
  writeFileSync(`${dirOut}input.wav`, wav(pcm));
  return {
    sessionId, calls, said: said.join(' '), heard: heard.join(' '),
    speech_end_to_action_ms: actionAt != null && stoppedAt != null ? actionAt - stoppedAt : null,
    voice_latency: voiceAt != null && stoppedAt != null ? voiceAt - stoppedAt : null,
  };
}

function score(c, { calls, said }) {
  const want = c.expect;
  const relevant = calls.filter((k) => !(c.allowTools || []).includes(k.name));
  if (want.tool === null) {
    const okTools = relevant.length === 0 && !calls.some((k) => k.name === 'void_ticket' && k.args.confirmed);
    const okSay = !want.say || new RegExp(want.say, 'i').test(said);
    return { pass: okTools && okSay, why: !okTools ? `unexpected ${calls.map((k) => k.name)}` : okSay ? '' : 'no confirmation/clarification' };
  }
  const call = calls.find((k) => k.name === want.tool);
  if (!call) return { pass: false, why: calls.length ? `called ${calls.map((k) => k.name)}` : 'no action' };
  for (const [k, v] of Object.entries(want.args || {})) {
    const got = call.args[k];
    const ok = k === 'item' ? matchItem(initialState(menu).items, got).item?.id === v : Number(got ?? 0) === Number(v);
    if (!ok) return { pass: false, why: `${k}=${JSON.stringify(got)} want ${v}` };
  }
  return { pass: true, why: '' };
}

const rows = [];
for (const c of cases) {
  let r;
  try {
    r = await runCase(c);
  } catch (err) {
    r = { calls: [], said: '', heard: '', error: err.message };
  }
  const s = r.error ? { pass: false, why: r.error } : score(c, r);
  const lat = r.speech_end_to_action_ms;
  rows.push({ id: c.id, session_id: r.sessionId, chatter: c.id.startsWith('chat-'), ...s, latency: lat, voice_latency: r.voice_latency, heard: r.heard, said: r.said, calls: r.calls });
  console.log(`${s.pass ? '✓' : '✗'} ${c.id.padEnd(18)} action ${String(lat ?? '-').padStart(5)}ms  heard="${r.heard}"  said="${r.said}" ${s.why}`);
}

const cmd = rows.filter((r) => !r.chatter);
const chat = rows.filter((r) => r.chatter);
const lats = cmd.map((r) => r.latency).filter(Number.isFinite).sort((a, b) => a - b);
const pct = (p) => lats[Math.min(lats.length - 1, Math.floor(p * lats.length))];
const summary = {
  mode: noisy ? 'noisy' : 'clean',
  commands: `${cmd.filter((r) => r.pass).length}/${cmd.length}`,
  command_accuracy: +(cmd.filter((r) => r.pass).length / Math.max(1, cmd.length) * 100).toFixed(1),
  chatter_ignored: `${chat.filter((r) => r.pass).length}/${chat.length}`,
  speech_end_to_action_ms_p50: pct(0.5) ?? null,
  speech_end_to_action_ms_p90: pct(0.9) ?? null,
};
console.log('\n', summary);
mkdirSync(runDir, { recursive: true });
writeFileSync(`${runDir}summary.json`, JSON.stringify({ summary, session, rows }, null, 2));
console.log(`saved ${runDir}`);
