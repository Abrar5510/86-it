export { Kitchen } from './kitchen.js';
import menu from '../data/menu.json';
import stationConfig from '../agent/station.json';
import prompt from '../agent/prompt.md';
import { sessionConfig } from './session.js';

const DEFAULT_AAI = 'https://agents.assemblyai.com';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const kitchen = (env) => env.KITCHEN.get(env.KITCHEN.idFromName('main'));

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

      // HTTP tools, called by AssemblyAI's servers. Must be public HTTPS; guarded by a shared secret.
      case '/api/tools/inventory':
      case '/api/tools/report': {
        if (!env.TOOL_SECRET || request.headers.get('x-tool-secret') !== env.TOOL_SECRET) return json({ error: 'unauthorized' }, 401);
        const action = url.pathname.endsWith('inventory')
          ? { type: 'inventory_lookup', item: url.searchParams.get('item') }
          : { type: 'report' };
        const { say, ...rest } = await kitchen(env).act(action);
        return json({ ...rest, summary: say });
      }

      case '/api/health':
        return json({ ok: true, key: Boolean(env.ASSEMBLYAI_API_KEY), toolSecret: Boolean(env.TOOL_SECRET) });
    }

    return env.ASSETS.fetch(request);
  },
};
