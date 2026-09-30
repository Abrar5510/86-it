// Mock of the AssemblyAI Voice Agent API (v1) — no models, no credits, runs on localhost:9901.
// "Transcription" is scripted: each burst of ~loud audio followed by ~600 ms of quiet becomes the next
// line of SCRIPT, sent as transcript.user.*; a scripted agent answers with the matching tool.call,
// transcript.agent.* and reply.audio (PCM16 24 kHz silence), exercising the station's whole loop:
// tool calls + dedupe, the chatter silent-reply gate, barge-in, void confirmation, reply.create
// alerts, reconnect + session.resume, and the voice_focus fallback.
//
//   node test/mock-aai.js                    -> http://localhost:9901
//   GET /stats                               -> sessions, turns, replies, tool_results, resumes,
//                                               interrupts, violations
//   GET /drop                                -> closes every open stream (tests reconnect + resume)
//   MOCK_REJECT_VOICE_FOCUS=1 node ...       -> rejects session.update carrying voice_focus
//   AAI_BASE=http://localhost:9901           -> point wrangler dev (npm run dev:mock) or eval at it
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.MOCK_PORT || 9901);
const REJECT_VOICE_FOCUS = process.env.MOCK_REJECT_VOICE_FOCUS === '1';
const RATE = 24000;
const CHUNK_MS = 80;
const GRACE_MS = 30_000; // resume window after a drop, same as the real service
const LLM_MS = 700; // scripted model latency after the final transcript
const SILENCE = Buffer.alloc((RATE * CHUNK_MS) / 500); // 80 ms of PCM16 zeros

const SCRIPT = [
  { text: 'Eighty six salmon.', tool: { name: 'mark_86', arguments: { item: 'salmon', remaining: 0 } } },
  { text: 'Fire twelve.', tool: { name: 'fire_ticket', arguments: { table: 12 } } },
  { text: 'Did you watch the game last night?', say: '-' }, // chatter: junk reply, the station drops it
  {
    text: 'How long on seven?',
    tool: { name: 'ticket_status', arguments: { table: 7 } },
    say: 'Seven: fourteen minutes, risotto and two Caesar salads, fired six minutes ago, no allergy noted.',
    chunks: 55, // ~4.5 s, long enough that the next burst can interrupt it
  },
  { text: 'Wait, stop.' }, // said during the long reply: barge-in, no answer
  { text: 'Void seven.', say: 'Void 7?' }, // no tool call: the model asks first
  { text: 'Yes.', tool: { name: 'void_ticket', arguments: { table: 7, confirmed: true } } },
  { text: 'Eighty six the lobster.', say: 'Which item?' }, // unknown item
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = {
  sessions: 0,
  turns: [],
  replies: [],
  tool_results: [],
  resumes: [],
  resumes_refused: 0,
  interrupts: 0,
  voice_focus_rejects: 0,
  violations: [],
};
const sessions = new Map(); // session_id -> { lastSeen, disconnectedAt }
let sessionSeq = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (d) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(d));
  if (url.pathname === '/v1/token') {
    if (!req.headers.authorization) stats.violations.push('token request without Authorization');
    json({ token: 'mock-token', expires_in_seconds: 300 });
  } else if (url.pathname === '/stats') json(stats);
  else if (url.pathname === '/drop') {
    wss.clients.forEach((c) => c.close(1011, 'mock drop'));
    json({ dropped: true });
  } else res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: '/v1/ws' });
wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams;
  if (!q.get('token')) {
    stats.violations.push('stream without token');
    return ws.close(1008, 'missing token');
  }

  let sessionId = null;
  let ready = false;
  let step = 0;
  let callSeq = 0;
  let utterance = 0; // increments on each input.speech.started and reply.create
  let inUtterance = false;
  let audioMs = 0;
  let speechLoudMs = 0;
  let lastLoud = -1;
  let wordsRevealed = 0;
  let replyActive = false;
  let replyAbort = false;
  const pendingCalls = new Map(); // call_id -> resolve(parsed tool.result)

  const send = (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  const violation = (m) => stats.violations.push(m);
  const failSession = (code, message, param) => send({ type: 'session.error', code, message, param });

  // transcript.agent.delta unlocks the station's silent-reply gate; reply.audio is silence, so a
  // junk say ('-') leaves the gate closed and the station drops the reply.
  async function speak(text, myUtterance, chunks) {
    while (replyActive) await sleep(50);
    if (myUtterance !== utterance || !text) return; // superseded by a newer burst or alert
    replyActive = true;
    replyAbort = false;
    send({ type: 'reply.started' });
    send({ type: 'transcript.agent.delta', delta: text });
    const n = chunks ?? Math.max(6, Math.ceil(text.length / 3));
    for (let i = 0; i < n && !replyAbort; i++) {
      send({ type: 'reply.audio', data: SILENCE.toString('base64') });
      await sleep(CHUNK_MS);
    }
    const interrupted = replyAbort;
    replyActive = false;
    replyAbort = false;
    if (interrupted) stats.interrupts++;
    send({ type: 'transcript.agent', text, ...(interrupted ? { interrupted: true } : {}) });
    send({ type: 'reply.done' });
    stats.replies.push(interrupted ? `${text} [interrupted]` : text);
  }

  // The scripted "LLM": think, optionally call the tool (waiting for tool.result, preferring the
  // board's own `say`), then speak.
  async function respond(line, myUtterance) {
    await sleep(LLM_MS);
    if (myUtterance !== utterance) return;
    let say = line.say;
    if (line.tool) {
      const call_id = `call-${++callSeq}`;
      const parsed = new Promise((resolve) => {
        pendingCalls.set(call_id, resolve);
        setTimeout(() => {
          if (pendingCalls.delete(call_id)) {
            violation(`no tool.result for ${call_id} within 5 s`);
            resolve(null);
          }
        }, 5000);
      });
      send({ type: 'tool.call', call_id, name: line.tool.name, arguments: line.tool.arguments });
      const result = await parsed;
      if (myUtterance !== utterance) return;
      say = say || result?.say || 'Done.';
    }
    await speak(say, myUtterance, line.chunks);
  }

  function endUtterance() {
    inUtterance = false;
    const line = SCRIPT[step++ % SCRIPT.length];
    send({ type: 'input.speech.stopped' });
    send({ type: 'transcript.user', text: line.text });
    stats.turns.push(line.text);
    respond(line, utterance).catch(() => {});
  }

  ws.on('close', () => {
    const s = sessionId && sessions.get(sessionId);
    if (s) s.disconnectedAt = Date.now();
  });

  ws.on('message', (data, isBinary) => {
    if (isBinary) return violation('binary frame (the v1 protocol is JSON)');
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return violation(`unparseable message: ${String(data).slice(0, 60)}`);
    }

    if (!ready && msg.type !== 'session.update' && msg.type !== 'session.resume') {
      if (msg.type === 'input.audio') return; // mic batches can beat session.ready; drop them
      violation(`first message was ${msg.type}, expected session.update`);
      return failSession('invalid_request_error', 'expected session.update');
    }

    switch (msg.type) {
      case 'session.update': {
        if (REJECT_VOICE_FOCUS && msg.input?.voice_focus != null) {
          stats.voice_focus_rejects++;
          return failSession('invalid_request_error', "field 'voice_focus' is not supported", 'voice_focus');
        }
        ready = true;
        sessionId = `mock-${++sessionSeq}`;
        sessions.set(sessionId, { lastSeen: Date.now(), disconnectedAt: null });
        stats.sessions++;
        send({ type: 'session.ready', session_id: sessionId });
        break;
      }

      case 'session.resume': {
        const s = sessions.get(msg.session_id);
        const since = s ? Date.now() - (s.disconnectedAt ?? s.lastSeen) : Infinity;
        if (!s || since > GRACE_MS) {
          stats.resumes_refused++;
          return failSession(s ? 'session_expired' : 'session_not_found', 'session is not resumable');
        }
        ready = true;
        sessionId = msg.session_id;
        s.lastSeen = Date.now();
        s.disconnectedAt = null;
        stats.resumes.push(sessionId);
        send({ type: 'session.ready', session_id: sessionId });
        break;
      }

      case 'input.audio': {
        if (sessionId) {
          const s = sessions.get(sessionId);
          if (s) s.lastSeen = Date.now();
        }
        let pcm;
        try {
          pcm = Buffer.from(msg.audio || '', 'base64');
        } catch {
          return violation('input.audio with undecodable base64');
        }
        if (pcm.length % 2) return violation('input.audio with an odd byte count');
        const ms = (pcm.length / 2 / RATE) * 1000;
        if (ms < 40 || ms > 2000) violation(`input.audio batch of ${ms.toFixed(0)} ms (expected 40–2000)`);
        let sum = 0;
        for (let i = 0; i + 1 < pcm.length; i += 2) sum += (pcm.readInt16LE(i) / 32768) ** 2;
        const loud = pcm.length > 0 && Math.sqrt(sum / (pcm.length / 2)) > 0.02;
        if (loud) {
          if (!inUtterance) {
            inUtterance = true;
            utterance++;
            speechLoudMs = 0;
            wordsRevealed = 0;
            send({ type: 'input.speech.started' });
            if (replyActive) replyAbort = true; // barge-in: the station stops playback on this message
          }
          speechLoudMs += ms;
          lastLoud = audioMs + ms;
          const scriptWords = SCRIPT[step % SCRIPT.length].text.split(' ');
          const reveal = Math.min(scriptWords.length, Math.floor(speechLoudMs / 250) + 1);
          if (reveal > wordsRevealed) {
            wordsRevealed = reveal;
            send({ type: 'transcript.user.delta', text: scriptWords.slice(0, reveal).join(' ') });
          }
        }
        audioMs += ms;
        if (inUtterance && !loud && lastLoud >= 0 && audioMs - lastLoud > 600) endUtterance();
        break;
      }

      case 'tool.result': {
        stats.tool_results.push(msg.call_id);
        const resolve = pendingCalls.get(msg.call_id);
        if (!resolve) return violation(`tool.result for unknown call ${msg.call_id}`);
        pendingCalls.delete(msg.call_id);
        if (replyActive) violation('tool.result while a reply is active');
        let parsed = null;
        try {
          parsed = JSON.parse(msg.result);
        } catch {}
        resolve(parsed);
        break;
      }

      case 'reply.create': {
        if (replyActive) return violation('reply.create while a reply is active');
        const m = /Announce exactly: "([^"]+)"/.exec(msg.instructions || '');
        if (!m) return violation(`reply.create without an "Announce exactly" instruction: ${msg.instructions}`);
        utterance++; // take the turn so an in-flight respond() cannot collide with the alert
        speak(m[1], utterance).catch(() => {});
        break;
      }

      case 'session.end':
        send({ type: 'session.ended', session_id: sessionId });
        ws.close(1000, 'session.end');
        break;

      default:
        violation(`unexpected message type ${msg.type}`);
    }
  });
});

// Without a listener, a port clash (EADDRINUSE) surfaces as an unhandled 'error' event and an
// opaque stack trace instead of a usable message. `ws` re-emits the server's error on the
// WebSocketServer, and that emit happens first — so both need the handler.
const onServerError = (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`mock AssemblyAI: port ${PORT} is already in use — stop the other mock (or set MOCK_PORT).`);
    process.exit(1);
  }
  throw err;
};
server.on('error', onServerError);
wss.on('error', onServerError);

server.listen(PORT, () => console.log(`mock AssemblyAI Voice Agent API on http://localhost:${PORT}`));
