// Download AssemblyAI's own record of every voice session: audio recording, timeline, metadata.
//   npm run sessions:save                 -> all sessions on the account (skips ones already saved)
//   npm run sessions:save -- --id sess_x  -> one session
// Saved to recordings/<created_at>_<id>/ : session.json + one file per artifact.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const API = 'https://agents.assemblyai.com/v1/sessions';
const ROOT = new URL('../recordings/', import.meta.url).pathname;
const EXT = { audio: 'ogg', timeline: 'json', metadata: 'json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function key() {
  if (existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
  if (!process.env.ASSEMBLYAI_API_KEY) throw new Error('ASSEMBLYAI_API_KEY missing in .dev.vars');
  return process.env.ASSEMBLYAI_API_KEY;
}

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: key() } });
  if (!res.ok) throw new Error(`${res.status} ${url}: ${await res.text()}`);
  return res.json();
}

// Artifacts appear once the session has finished processing; retry a few times.
export async function saveSession(id, { retries = 6 } = {}) {
  let s;
  for (let i = 0; i <= retries; i++) {
    s = await get(`${API}/${id}`);
    if (s.ended_at && s.artifacts?.length) break;
    if (i < retries) await sleep(5000);
  }
  const dir = `${ROOT}${(s.created_at || '').replace(/[:.]/g, '-')}_${id}/`;
  mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const a of s.artifacts || []) {
    const res = await fetch(a.url); // pre-signed, no auth header
    if (!res.ok) {
      console.warn(`  ! ${id} ${a.type}: ${res.status}`);
      continue;
    }
    const file = `${a.type}.${EXT[a.type] || 'bin'}`;
    writeFileSync(dir + file, Buffer.from(await res.arrayBuffer()));
    saved.push(file);
  }
  // artifact URLs expire; don't keep them
  const text = JSON.stringify({ ...s, artifacts: (s.artifacts || []).map(({ url, ...a }) => a) }, null, 2);
  writeFileSync(`${dir}session.json`, text.replaceAll(key(), '***'));
  console.log(`  ✓ ${id} → ${dir.replace(ROOT, 'recordings/')} (${saved.join(', ') || 'no artifacts yet'})`);
  return { dir, saved };
}

async function listAll() {
  const out = [];
  let cursor = '';
  do {
    const page = await get(`${API}?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    out.push(...page.sessions);
    cursor = page.has_more ? page.response_metadata?.next_cursor : '';
  } while (cursor);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--id');
  mkdirSync(ROOT, { recursive: true });
  const done = new Set(
    existsSync(`${ROOT}index.json`) ? JSON.parse(readFileSync(`${ROOT}index.json`, 'utf8')).filter((x) => x.saved.length).map((x) => x.id) : [],
  );
  const ids = i > -1 ? [process.argv[i + 1]] : (await listAll()).map((s) => s.id).filter((id) => !done.has(id));
  console.log(`Saving ${ids.length} session(s)…`);
  const index = existsSync(`${ROOT}index.json`) ? JSON.parse(readFileSync(`${ROOT}index.json`, 'utf8')) : [];
  for (const id of ids) {
    try {
      const { dir, saved } = await saveSession(id, { retries: 0 });
      index.splice(0, index.length, ...index.filter((x) => x.id !== id), { id, dir: dir.replace(ROOT, ''), saved });
    } catch (err) {
      console.warn(`  ! ${id}: ${err.message}`);
    }
  }
  writeFileSync(`${ROOT}index.json`, JSON.stringify(index, null, 2));
}
