export { Kitchen } from './kitchen.js';
import menu from '../data/menu.json';
import stationConfig from '../agent/station.json';
import prompt from '../agent/prompt.md';
import { sessionConfig } from './session.js';

const DEFAULT_AAI = 'https://agents.assemblyai.com';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const kitchen = (env) => env.KITCHEN.get(env.KITCHEN.idFromName('main'));

// /api/token is the only endpoint that spends money: it mints a real AssemblyAI token on the
// account's key, and it has to stay reachable from an unauthenticated browser. So it is metered
// per client IP. Fixed window, held in the isolate — best effort (it resets with the isolate),
// but enough to stop the endpoint being used as a credit faucet.
const TOKEN_WINDOW_MS = 60_000;
const TOKEN_LIMIT = 60; // tokens per IP per minute: a station mints one per connect
const tokenBuckets = new Map(); // ip -> { window, count }, insertion-ordered so the oldest is evictable
const TOKEN_BUCKET_CAP = 4096;

function clientIp(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'unknown';
}

function overTokenLimit(request) {
  const now = Date.now();
  const ip = clientIp(request);
  let bucket = tokenBuckets.get(ip);
  if (!bucket || now - bucket.window >= TOKEN_WINDOW_MS) {
    if (!bucket && tokenBuckets.size >= TOKEN_BUCKET_CAP) tokenBuckets.delete(tokenBuckets.keys().next().value);
    tokenBuckets.set(ip, { window: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > TOKEN_LIMIT;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/ws':
        return kitchen(env).fetch(request);

      // Browser gets a short-lived Voice Agent token + the WebSocket URL + the inline session config.
      // The API key never leaves the Worker. AAI_BASE can point at a local mock for testing.
      case '/api/token': {
        if (!env.ASSEMBLYAI_API_KEY) return json({ error: 'ASSEMBLYAI_API_KEY is not set' }, 500);
        if (overTokenLimit(request)) {
          return new Response(JSON.stringify({ error: `Too many token requests; retry in ${Math.ceil(TOKEN_WINDOW_MS / 1000)}s` }), {
            status: 429,
            headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': String(Math.ceil(TOKEN_WINDOW_MS / 1000)) },
          });
        }
        const base = env.AAI_BASE || DEFAULT_AAI;
        const t = new URL('/v1/token', base);
        t.searchParams.set('expires_in_seconds', '300');
        t.searchParams.set('max_session_duration_seconds', '10800');
        const res = await fetch(t, { headers: { Authorization: env.ASSEMBLYAI_API_KEY } }).catch((err) => err);
        if (res instanceof Error) return json({ error: `AssemblyAI unreachable: ${res.message}` }, 502);
        if (!res.ok) return json({ error: `AssemblyAI token request failed: ${res.status} ${await res.text()}` }, 502);
        const { token } = await res.json();
        const session = sessionConfig({ config: stationConfig, menu, prompt, voiceFocus: url.searchParams.get('voice_focus') !== '0' });
        return json({ token, wsUrl: `${base.replace(/^http/, 'ws')}/v1/ws`, session });
      }

      case '/api/health':
        return json({ ok: true, key: Boolean(env.ASSEMBLYAI_API_KEY) });
    }

    return env.ASSETS.fetch(request);
  },
};
