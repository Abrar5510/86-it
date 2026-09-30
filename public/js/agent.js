// Voice station on AssemblyAI Voice Agent API: STT + LLM + tool calling + TTS in one WebSocket.
//   mic -> input.audio -> transcript.user -> instant lane (grammar) -> Kitchen action   (~0 ms after speech end)
//                                         -> LLM tool.call -> same action, deduped -> tool.result -> reply.audio
// The instant lane only fires on strict command phrasings (public/js/intent.js); everything else, and every
// spoken reply, comes from the LLM. eval/replay.js scores the instant lane against recorded sessions.
import { startAudio } from './audio.js';
import { parse } from './intent.js';
import { matchItem } from './match.js';

const BATCH = 2; // worklet chunks are 40 ms; send 80 ms batches
const VOID_WINDOW_MS = 10_000;
const DEDUPE_MS = 6000; // the LLM's tool.call lands ~2-4 s after the instant action
const RESUME_REFUSED = ['session_not_found', 'session_forbidden', 'session_expired'];

// Audio playback: PCM16 24 kHz chunks from AssemblyAI, gapless, with barge-in.
function createPlayback() {
  let ctx;
  let gain;
  let at = 0;
  const sources = [];

  function ensure() {
    if (ctx) return;
    ctx = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' });
    gain = ctx.createGain();
    gain.connect(ctx.destination);
  }

  function scheduleChunk(pcm16) {
    ensure();
    const f32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) f32[i] = pcm16[i] / 32768;
    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.onended = () => {
      const idx = sources.indexOf(src);
      if (idx >= 0) sources.splice(idx, 1);
    };
    at = Math.max(at, ctx.currentTime);
    src.start(at);
    at += buf.duration;
    sources.push(src);
  }

  return {
    scheduleChunk,
    stop() {
      for (const s of sources) try { s.stop(); } catch {}
      sources.length = 0;
      at = 0;
    },
    get busy() { return sources.length > 0; },
    setVolume(v) { ensure(); gain.gain.value = Math.min(1, v); },
    close() { ctx?.close(); ctx = null; },
  };
}

export async function startAgent({ board, getItems, log, onTranscript, onLevel, onPhase }) {
  let ws;
  let ended = false;
  let muted = false;
  let retry = 0;
  let batch = [];
  let sessionId = null; // set on session.ready; a reconnect resumes it
  let voiceFocus = true; // dropped if AssemblyAI rejects the field
  let speechEnd = performance.now(); // latency clock: input.speech.stopped

  let pending = null; // { action, at } for a void awaiting yes/no
  let recent = null; // { key, result: Promise, at } last instant-lane action, for deduping the LLM's call
  let replyInProgress = false;
  let replyAudioChunks = []; // held until the reply says real words (silent-reply gate)
  let replyHasRealWords = false;

  const playback = createPlayback();
  const after = () => `+${Math.round(performance.now() - speechEnd)}ms after speech end`;

  const health = await fetch('/api/health').then((r) => r.json());
  if (!health.key) throw new Error('ASSEMBLYAI_API_KEY is not set on the server (.dev.vars or wrangler secret)');

  const audio = await startAudio({
    onLevel,
    onChunk(pcm) {
      if (ws?.readyState !== WebSocket.OPEN) return;
      batch.push(muted ? new ArrayBuffer(pcm.byteLength) : pcm);
      if (batch.length < BATCH) return;
      const out = new Uint8Array(batch.reduce((n, b) => n + b.byteLength, 0));
      batch.reduce((off, b) => (out.set(new Uint8Array(b), off), off + b.byteLength), 0);
      batch = [];
      ws.send(JSON.stringify({ type: 'input.audio', audio: toBase64(out) }));
    },
  });

  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function send(msg) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  // Same action from both lanes -> same key. Items compare by menu id; free-text args (allergen) are ignored.
  function keyOf(a) {
    const item = a.item == null ? '' : matchItem(getItems(), a.item).item?.id ?? a.item;
    return [a.type, a.table ?? '', item, a.remaining ?? ''].join('|');
  }

  // Instant lane: a strict grammar match on the final transcript updates every screen now.
  // Voids and unknown items are left to the LLM, which asks "Void 7?" / "Which item?".
  async function instant(text) {
    const action = parse(text, getItems())?.action;
    if (!action || action.type === 'void_ticket') return;
    if (action.item != null && !matchItem(getItems(), action.item).item) return;
    const key = keyOf(action);
    recent = { key, result: board.act(action), at: performance.now() };
    const result = await recent.result;
    log(result.ok ? 'ack' : 'warn', `instant ${action.type} → ${result.say || result.error} ${after()}`);
  }

  // Tool call from the LLM. Results go back as soon as the tool finishes: live timelines showed the
  // service streams ~2 s of silent transition audio before reply.done, so waiting only delayed the reply.
  async function handleToolCall(callId, name, args) {
    const action = { type: name, ...args };

    if (name === 'void_ticket' && args.confirmed !== true) {
      const live = pending && performance.now() - pending.at < VOID_WINDOW_MS ? pending.action : null;
      if (!live) {
        log('tool', `void_ticket(needs confirmation) ${after()}`);
        pending = { action: { type: 'void_ticket', table: args.table, confirmed: true }, at: performance.now() };
        return sendResult(callId, { ok: false, error: 'needs_confirmation', say: `Void ${args.table}?` });
      }
    }
    pending = null;

    const hit = recent && recent.key === keyOf(action) && performance.now() - recent.at < DEDUPE_MS ? recent : null;
    if (hit) recent = null; // one LLM call consumes one instant action
    log('tool', `${name}(${JSON.stringify(args)}) ${after()}${hit ? ' · instant lane already applied' : ''}`);
    const result = await (hit ? hit.result : board.act(action));
    if (!hit) log(result.ok ? 'ack' : 'warn', `${name} → ${result.say || result.error} ${after()}`);
    if (result.error === 'needs_confirmation') pending = { action, at: performance.now() };
    sendResult(callId, result);
  }

  function sendResult(callId, result) {
    log('tool-result', `call_id=${callId}`);
    send({ type: 'tool.result', call_id: callId, result: JSON.stringify(result) });
  }

  function onMessage(e) {
    const msg = JSON.parse(e.data);

    switch (msg.type) {
      case 'session.ready':
        retry = 0;
        sessionId = msg.session_id || sessionId;
        log('info', `session ready ${sessionId}`);
        onPhase('listening');
        break;

      case 'session.ended':
        log('info', 'session ended');
        break;

      case 'session.error': {
        log('error', `${msg.code}: ${msg.message}${msg.param ? ` (${msg.param})` : ''}`);
        const badVoiceFocus = /voice_focus/.test(`${msg.param} ${msg.message}`);
        if (badVoiceFocus) {
          log('warn', 'retrying without voice_focus');
          voiceFocus = false;
        }
        if (badVoiceFocus || RESUME_REFUSED.includes(msg.code)) {
          sessionId = null; // start a fresh session on the reconnect
          ws.close();
        }
        break;
      }

      case 'input.speech.started':
        // Barge-in: stop playback immediately.
        playback.stop();
        replyAudioChunks = [];
        replyHasRealWords = false;
        break;

      case 'input.speech.stopped':
        speechEnd = performance.now();
        break;

      case 'transcript.user.delta':
        if (msg.text) onTranscript('user', msg.text, false);
        break;

      case 'transcript.user':
        if (!msg.text) return;
        onTranscript('user', msg.text, true);
        log('user', msg.text);
        instant(msg.text);
        break;

      case 'transcript.agent.delta':
        // Silent-reply gate: on chatter the model answers "-" (or junk); only real words unlock the audio.
        if (!replyHasRealWords && /[a-zA-Z0-9]/.test(msg.delta || '')) {
          replyHasRealWords = true;
          for (const chunk of replyAudioChunks) playback.scheduleChunk(chunk);
          replyAudioChunks = [];
        }
        break;

      case 'transcript.agent':
        if (!msg.text || !/[a-zA-Z0-9]/.test(msg.text)) return;
        onTranscript('agent', msg.text, true, msg.interrupted);
        log('agent', msg.text);
        break;

      case 'reply.started':
        replyInProgress = true;
        replyAudioChunks = [];
        replyHasRealWords = false;
        onPhase('speaking');
        break;

      case 'reply.audio': {
        if (!msg.data) break;
        const pcm = new Int16Array(fromBase64(msg.data));
        if (replyHasRealWords) playback.scheduleChunk(pcm);
        else replyAudioChunks.push(pcm);
        break;
      }

      case 'reply.done':
        replyInProgress = false;
        onPhase('listening');
        if (!replyHasRealWords && replyAudioChunks.length) log('info', 'silent reply dropped');
        replyAudioChunks = [];
        break;

      case 'tool.call':
        handleToolCall(msg.call_id, msg.name, msg.arguments || {});
        break;

      default:
        if (msg.type?.startsWith?.('input.') || msg.type?.startsWith?.('reply.')) log('info', `unhandled: ${msg.type}`);
    }
  }

  async function connect() {
    const res = await fetch(`/api/token${voiceFocus ? '' : '?voice_focus=0'}`);
    const { token, wsUrl, session, error } = await res.json().catch(() => ({ error: `token endpoint returned ${res.status}` }));
    if (error) throw new Error(error);
    batch = [];
    ws = new WebSocket(`${wsUrl}?token=${token}`);
    ws.onmessage = onMessage;
    ws.onopen = () => {
      // First message: resume the dropped session (30 s grace window), or start one with the inline config.
      if (sessionId) log('info', `resuming ${sessionId}`);
      send(sessionId ? { type: 'session.resume', session_id: sessionId } : { type: 'session.update', session });
    };
    ws.onclose = (e) => {
      onPhase('connecting');
      if (ended) return;
      log('warn', `socket closed (${e.code}${e.reason ? `: ${e.reason}` : ''}); reconnecting`);
      setTimeout(reconnect, Math.min(5000, 500 * 2 ** retry++));
    };
  }

  async function reconnect() {
    if (ended) return;
    try {
      await connect();
    } catch (err) {
      log('error', `reconnect failed: ${err.message}`);
      setTimeout(reconnect, Math.min(5000, 500 * 2 ** retry++));
    }
  }

  onPhase('connecting');
  await connect();

  return {
    setMuted(v) {
      muted = v;
    },
    setVolume(v) {
      playback.setVolume(v);
    },
    // Proactive speech (late-ticket alerts) through the agent's own voice. Only while idle.
    say(text) {
      if (replyInProgress || playback.busy || ws?.readyState !== WebSocket.OPEN) return false;
      send({ type: 'reply.create', instructions: `Announce exactly: "${text}"` });
      return true;
    },
    stop() {
      ended = true;
      send({ type: 'session.end' });
      ws?.close();
      playback.stop();
      playback.close();
      audio.stop();
    },
  };
}
