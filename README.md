# 86 It 🔥🎙️

**Kitchen voice control, built on the AssemblyAI Voice Agent API.**
A cook says "86 salmon" into a headset. Within about a second, salmon is greyed out on the kitchen display, on the servers' screen and on the online ordering page. Cooks can also say "Fire 12", "Bump 4", "How long on 7?" or "All day fries" without touching a screen.

| Page | What it is |
|---|---|
| `/` | Landing page with a live board: the 86 list, open tickets and the last kitchen events |
| `/station` | The cook's voice station: mic **or typed commands**, live transcript, event log with latency |
| `/kds` | Kitchen display: tickets with ages, allergy banners, 86 bar, all-day tally — tap a ticket to fire/hold/bump (with undo) |
| `/foh` | Front of house: what servers can sell right now, search + category filters, kitchen feed |
| `/menu` | Mock delivery/online ordering page (open it on your phone) |

Docs: [Architecture](docs/ARCHITECTURE.md) · [API & tools](docs/API.md) · [Submission / pitch](docs/SUBMISSION.md) · [Product plan](PLAN.md) · [Build plan](BUILD_PLAN.md) · [Demo video](videos/86-it-demo/renders/86-it-demo-final.mp4)

---

## Stack
- **AssemblyAI Voice Agent API**: speech-to-text, LLM, text-to-speech, turn detection, tool calling. One WebSocket straight from the browser.
- **Cloudflare Workers + Durable Objects**: token minting, HTTP tools, shared kitchen state, real-time fan-out to every screen.
- **Plain HTML/JS**: no framework and no build step. Dev dependencies: `wrangler`, plus `ws` for the test mock.

## Prerequisites
- Node 22+ (the eval harness uses the built-in `WebSocket`)
- An AssemblyAI API key: https://www.assemblyai.com/dashboard
- A Cloudflare account (the free plan works): https://dash.cloudflare.com/sign-up
- Chrome, Edge or Safari for the station page (Firefox can't record the mic into a 24 kHz audio context)
- Optional: `ffmpeg` (for eval clips), a Twilio account (owner phone line)

## Quick start (local)
```bash
npm install
cp .dev.vars.example .dev.vars      # then fill in ASSEMBLYAI_API_KEY
npm test                            # unit tests
npm run dev                         # http://localhost:8787
```
Open `/station`, click **Seed dinner rush**, click **Start**, allow the mic, and say "Fire twelve." Open `/kds`, `/foh` and `/menu` in other windows to watch them update. No mic (or no API key yet)? Type the same commands into the command line on `/station` — it runs the same instant grammar.

The station sends its whole agent config (prompt, tools, keyterms, voice) when each session starts, so there's no agent to create first. Change `agent/prompt.md` or `agent/station.json`, restart, and the next session uses the new config.

## Testing without using credits
`test/mock-aai.js` is a fake AssemblyAI Voice Agent API that follows their v1 WebSocket protocol and records protocol violations (a binary frame, a first message that isn't `session.update`, a `tool.result` for an unknown call, a reply started while one is active). Its "transcription" is scripted: each burst of sound is treated as the next line of a fixed script, and a scripted agent answers with the matching tool call and spoken reply.
```bash
npm run mock                # terminal 1: fake AssemblyAI on :9901 (GET /stats, GET /drop)
npm run dev:mock            # terminal 2: app pointed at the fake server
npm run eval:mock           # terminal 3: runs the eval harness once against the fake server
```
In the browser, speak or make any sound into the mic in bursts. Each burst plays the next scripted command: 86 salmon → fire 12 → chatter → how long on 7 (long reply, so you can interrupt it) → "wait, stop" → void seven ("Void 7?") → yes → 86 lobster (unknown item). Open `http://localhost:9901/stats` to see tool results, resumes, interrupts and `violations` (should be `[]`). `MOCK_REJECT_VOICE_FOCUS=1 npm run mock` tests the voice-focus fallback, and `curl localhost:9901/drop` tests reconnecting.

## Deploy (Cloudflare)
```bash
npx wrangler login
npx wrangler deploy                                   # prints https://86-it.<you>.workers.dev
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put TOOL_SECRET                   # same value as in .dev.vars (only used by the phone line)
```
Check `https://86-it.<you>.workers.dev/api/health`. You should see `{"ok":true,"key":true,"toolSecret":true}`. That's it: open `/station` on the public URL.

## Accuracy eval
```bash
npm run eval:clips          # synthesizes 43 clips with macOS `say` (+ noisy copies)
npm run eval                # clean audio (uses AssemblyAI credits: 43 short sessions)
npm run eval -- --noisy     # with kitchen noise
npm run eval -- --only 86-salmon
npm run eval -- --no-voice-focus   # if AssemblyAI rejects the voice_focus field
```
- **Better numbers:** record your own voice as `eval/recorded/<id>.wav` (ids are in `eval/commands.json`) and drop a real kitchen recording at `eval/noise.wav`, then rerun `eval:clips`.
- **Noise level:** set it with `NOISE_DB=-6 npm run eval:clips` (higher = louder).
- **Results:** each run is saved to `eval/results/<run>/`: `summary.json`, plus a folder per clip with `events.jsonl` (every WebSocket event), `input.wav` and `agent.wav` (what the agent said). See [SUBMISSION.md](docs/SUBMISSION.md#results) for how to report them.

## Session recordings
AssemblyAI keeps a recording, timeline and metadata for every session. To download them:
```bash
npm run sessions:save                  # every session on the account not saved yet → recordings/
npm run sessions:save -- --id sess_…   # one session (ids appear in the station log)
```
`npm run eval` downloads its own sessions automatically. On the station, **Download log** saves the full event log, including session ids.

## Owner phone line (optional, Twilio)
A stored agent with only HTTP tools answers "What did we 86 tonight?" over the phone. AssemblyAI calls the Worker's `/api/tools/*` endpoints directly, so deploy first.
```bash
# in .dev.vars: PUBLIC_URL=https://86-it.<you>.workers.dev  and the same TOOL_SECRET as the Worker
npm run agent:owner          # creates/updates the agent, writes OWNER_AGENT_ID
npm run agent:owner -- --dry # print the request without sending it
```
Then follow AssemblyAI's Twilio guide to point a Twilio number at the agent over SIP:
https://www.assemblyai.com/docs/voice-agents/voice-agent-api/deploy

> Not tested yet: the Twilio part needs a Twilio account. Test the tools first with `curl -H "x-tool-secret: …" https://…/api/tools/report`.

## Configuration
| What | Where |
|---|---|
| Menu (names, aliases, stock, prices) | `data/menu.json` (keyterms and tool enums are generated from it) |
| Station prompt | `agent/prompt.md` |
| Station tools, voice, voice focus, extra keyterms | `agent/station.json` |
| Owner phone agent | `agent/owner.json` |
| Late-ticket alert threshold | `ALERT_AFTER_MS` in `src/state.js` (10 min) |
| Demo tickets | `rushTickets()` in `src/state.js` |

## Project layout
```
src/worker.js        routes: /api/token, /api/tools/*, /api/health, /ws → Durable Object
src/kitchen.js       Kitchen Durable Object: state, WebSocket fan-out, late-ticket alarm
src/state.js         pure reducer + fuzzy item matching (shared by DO, tests, eval)
src/session.js       builds the station's inline session config (shared by Worker, eval, tests)
public/index.html     landing page (live board)  public/js/agent.js   AssemblyAI session logic
public/station.html   voice station              public/js/audio.js   mic capture + playback
public/kds.html       kitchen display            public/js/board.js   Durable Object client
public/foh.html       front of house             public/js/chrome.js  shared header + 86 strip
public/menu.html      online menu                public/js/intent.js  command grammar (typed + voice)
agent/               station config + prompt, owner phone agent config
scripts/agent.js     create/update the owner phone agent via REST
eval/                clips, runner, results
test/mock-aai.js     fake AssemblyAI server for credit-free testing
```

## Troubleshooting
| Symptom | Fix |
|---|---|
| "ASSEMBLYAI_API_KEY is not set" | Local: add it to `.dev.vars` and restart `npm run dev`. Prod: `wrangler secret put` |
| Start does nothing / no audio | Allow mic access. The page must be `localhost` or HTTPS. Use Chrome |
| Agent talks but screens don't change | Check the green dot in the header (board connection) and the event log for `warn` lines |
| Log shows "retrying without voice_focus" | AssemblyAI rejected the inline noise setting; the station reconnects without it automatically. To stop the retry, remove the `voice_focus` block from `agent/station.json` |
| Log shows `session.error` about a tool or field | The message names the field; fix `agent/station.json` and restart |
| Owner line tools fail | `PUBLIC_URL` must be the deployed https URL and `TOOL_SECRET` must match the Worker secret. Rerun `npm run agent:owner` |
| Agent reacts to chatter | Turn on push-to-talk (hold Space, or map a USB foot pedal to Space) |
