// Real-loop capture: Chrome fake mic plays capture/demo/demo-mic.wav into the
// deployed station; AssemblyAI really transcribes; screens really update.
// Records station/kds/foh/menu via CDP screencast -> capture/demo/raw/<page>/.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.resolve(ROOT, '..');
const BASE = 'https://86-it.rd5510.workers.dev';
const WAV = path.join(PROJ, 'capture/demo/demo-mic.wav');
const RAW = path.join(PROJ, 'capture/demo/raw');
const CHROME = '/Users/abrar/.cache/puppeteer/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PAGES = { station: '/station', kds: '/kds', foh: '/foh', menu: '/menu' };
const RUN_MS = 145_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!fs.existsSync(CHROME)) { console.error('chrome not found:', CHROME); process.exit(1); }
fs.mkdirSync(RAW, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 30_000,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${WAV}%noloop`,
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--disable-gpu',
    '--no-sandbox',
  ],
});

const rec = {}; // page -> { dir, frames: [{f,t}], client }
const events = [];
const note = (name) => { const t = Date.now(); events.push({ name, t, rel: null }); log('EVENT', name); };

try {
  const pages = {};
  for (const [name, route] of Object.entries(PAGES)) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    p.on('pageerror', (e) => log('pageerror[' + name + ']', String(e).slice(0, 200)));
    if (name === 'station') p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') log('console[' + name + ']', m.text().slice(0, 200)); });
    await p.setViewport({ width: 1600, height: 900 });
    await p.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 30_000 });
    pages[name] = p;
    const dir = path.join(RAW, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const client = await p.createCDPSession();
    await client.send('Page.enable');
    rec[name] = { dir, frames: [], n: 0, client };
    client.on('Page.screencastFrame', async (f) => {
      try {
        const n = String(rec[name].n++).padStart(6, '0');
        fs.writeFileSync(path.join(dir, n + '.jpg'), Buffer.from(f.data, 'base64'));
        rec[name].frames.push({ f: n + '.jpg', t: f.metadata.timestamp });
        await client.send('Page.screencastFrameAck', { sessionId: f.sessionId });
      } catch {}
    });
  }
  log('pages loaded');

  // wait for board connections (green dots) + any hydration
  await sleep(4000);

  // start recording on every page first so reset/seed visuals are captured
  for (const name of Object.keys(PAGES)) {
    await rec[name].client.send('Page.startScreencast', {
      format: 'jpeg', quality: 85, maxWidth: 1600, maxHeight: 900, everyNthFrame: 1,
    });
  }
  note('screencast-start');

  // clean kitchen state, then seed the rush (programmatic clicks — no layout geometry)
  const tap = (sel) => pages.station.evaluate((s) => document.querySelector(s).click(), sel);
  await tap('#reset');
  note('reset');
  await sleep(2500);
  await tap('#seed');
  note('seed');
  await sleep(3000);

  let T0 = 0;
  for (let attempt = 1; attempt <= 4 && !T0; attempt++) {
    await tap('#orb');
    await sleep(3000);
    const phase = await pages.station.$eval('#phase', (e) => e.textContent).catch(() => '?');
    log('start attempt', attempt, '-> phase', phase);
    if (phase && phase !== 'offline') { T0 = Date.now() - 3000; } // mic opened ~3s ago
  }
  if (!T0) { throw new Error('station never left offline'); }
  events.push({ name: 'T0-mic-start', t: T0, rel: 0 });
  log('T0 mic started — running', RUN_MS / 1000, 's');

  // watch the station phase so we know the session is live
  for (let i = 0; i < 6; i++) {
    await sleep(2000);
    const phase = await pages.station.$eval('#phase', (e) => e.textContent).catch(() => '?');
    const said = await pages.station.$eval('#said', (e) => e.textContent).catch(() => '');
    log(`t+${((Date.now() - T0) / 1000).toFixed(0)}s phase=${phase} said="${said.slice(0, 60)}"`);
  }
  await sleep(RUN_MS - 12_000);

  // station log from the DOM (fullLog is module-scoped; <li> keeps last 200)
  const fullLog = await pages.station.evaluate(() =>
    Array.from(document.querySelectorAll('#log li')).map((li) => ({
      time: li.querySelector('time')?.textContent ?? '',
      kind: li.querySelector('.k')?.textContent?.trim() ?? '',
      text: li.querySelector('span:last-child')?.textContent ?? '',
    })).reverse()
  ).catch(() => null);
  const said = await pages.station.$eval('#said', (e) => e.textContent).catch(() => '');
  const stats = await pages.station.evaluate(() => ({
    cmd: document.querySelector('#st-cmd')?.textContent,
    lat: document.querySelector('#st-lat')?.textContent,
  })).catch(() => null);

  for (const name of Object.keys(PAGES)) {
    await rec[name].client.send('Page.stopScreencast').catch(() => {});
  }
  note('screencast-stop');

  const out = {
    t0: T0,
    runMs: RUN_MS,
    events: events.map((e) => ({ ...e, rel: e.t - T0 })),
    pages: Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, { frames: v.frames.length }])),
    said,
    stats,
    fullLog,
  };
  fs.writeFileSync(path.join(RAW, 'run.json'), JSON.stringify(out, null, 2));
  for (const [name, v] of Object.entries(rec)) {
    fs.writeFileSync(path.join(v.dir, 'frames.json'), JSON.stringify(v.frames));
  }
  log('saved run.json + frames:', JSON.stringify(out.pages));
} finally {
  await browser.close().catch(() => {});
}
