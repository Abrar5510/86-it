// Create or update the stored AssemblyAI agent for the owner phone line (Twilio SIP).
// The kitchen station does NOT need this: it sends its config inline on every session.
//   npm run agent:owner            -> creates/updates, saves OWNER_AGENT_ID to .dev.vars
//   npm run agent:owner -- --dry   -> print the request body only
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://agents.assemblyai.com/v1/agents';
const VARS = '.dev.vars';
const ID_VAR = 'OWNER_AGENT_ID';
const dry = process.argv.includes('--dry');

if (existsSync(VARS)) process.loadEnvFile(VARS);
const { ASSEMBLYAI_API_KEY, PUBLIC_URL = '', TOOL_SECRET = '' } = process.env;

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const cfg = JSON.parse(read('../agent/owner.json'));
const menu = JSON.parse(read('../data/menu.json'));
const names = menu.map((m) => m.name.toLowerCase());
const publicUrl = PUBLIC_URL.replace(/\/$/, '');

if (!/^https:\/\//.test(publicUrl) || /localhost|127\.0\.0\.1/.test(publicUrl) || !TOOL_SECRET) {
  console.error(`The owner line uses HTTP tools, which AssemblyAI calls from its servers.
Set PUBLIC_URL (your deployed https://…workers.dev URL) and TOOL_SECRET in ${VARS} first.`);
  process.exit(1);
}

const tools = cfg.tools.map(({ http, ...t }) => ({
  ...JSON.parse(JSON.stringify(t).replaceAll('"__MENU__"', JSON.stringify(names))),
  http: { url: publicUrl + http.path, http_method: http.http_method, headers: { 'x-tool-secret': TOOL_SECRET } },
}));
const body = { ...cfg, tools, input: { ...cfg.input, keyterms: [...cfg.input.keyterms, ...menu.map((m) => m.name)] } };

if (dry) {
  console.log(JSON.stringify(body, null, 2).replaceAll(TOOL_SECRET, '***'));
  process.exit(0);
}
if (!ASSEMBLYAI_API_KEY) {
  console.error(`ASSEMBLYAI_API_KEY missing in ${VARS}.`);
  process.exit(1);
}

async function call(method, url) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: ASSEMBLYAI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { res, text, data: text ? JSON.parse(text) : {} };
}

const existing = process.env[ID_VAR];
let r = existing ? await call('PUT', `${API}/${existing}`) : await call('POST', API);
if (existing && r.res.status === 404) r = await call('POST', API);
if (!r.res.ok) {
  console.error(`✗ ${r.res.status}: ${r.text}`);
  process.exit(1);
}

const id = r.data.id || existing;
const vars = existsSync(VARS) ? readFileSync(VARS, 'utf8') : '';
const re = new RegExp(`^${ID_VAR}=.*$`, 'm');
writeFileSync(VARS, re.test(vars) ? vars.replace(re, `${ID_VAR}=${id}`) : `${vars.trimEnd()}\n${ID_VAR}=${id}\n`);
console.log(`✓ ${existing ? 'updated' : 'created'} "${body.name}" → ${ID_VAR}=${id} (${tools.length} HTTP tools)`);
console.log('  Next: point a Twilio number at this agent (README → Owner phone line).');
