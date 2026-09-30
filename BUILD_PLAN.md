# 86 It: End-to-End Build Plan (13 days, solo, Cloudflare)

> **Implementation note:** the built app differs from this plan in two ways. The station sends its config inline in `session.update` instead of using a stored agent, because AssemblyAI's docs require client-side tools to be declared inline. Only the owner phone line uses a stored agent. And `tool.result` is sent as soon as the tool finishes, not after `reply.done` (see the result-timing finding in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

## Context
`/Users/abrar/projects/Assembly` holds only `PLAN.md`, the product plan: pitch, scope, tools, demo script and risks. This file is the **engineering build plan**. It covers how to build, test, deploy and document the app end to end for the AssemblyAI Voice Agent API track. Constraints: solo builder, 13 days, stack chosen for **speed and accuracy**, hosted on **Cloudflare Workers**, with four documents (README, architecture, API/tool reference, submission).

**Answer on Cloudflare: yes, Workers fits well.**
- AssemblyAI's HTTP tools need a public HTTPS host, and `*.workers.dev` provides one.
- Workers alone can't hold shared state between requests. A **Durable Object** fixes that: it holds the kitchen state and pushes updates to every screen over WebSockets.
- One `wrangler deploy` ships everything, and there are no servers to manage.

## Stack decision (why it's the fastest and most accurate)
- **Latency:** most of the delay comes from AssemblyAI's speech-to-response pipeline. The browser station therefore connects **directly** to `wss://agents.assemblyai.com/v1/ws`, so audio never passes through our server. Our backend only handles state, tokens and HTTP tools, and runs close to the user on Cloudflare.
- **Accuracy:** keyterms, menu `enum`s in the tool schemas, `input.voice_focus: "near-field"` for noise, `transcription_mode` tuning, and alias/fuzzy matching of item names. All of it is measured with an **eval harness** (Day 7–8), so the pitch has real numbers.
- **Build speed:** plain JS (ES modules), no framework and no build step. The only dev dependency is `wrangler`, and tests run on the built-in `node --test`.

## Architecture
```
Station page (browser, headset)
  mic → AudioWorklet → PCM16 24kHz base64 → input.audio ──► AssemblyAI Voice Agent (inline session config)
  reply.audio → playback queue (flushed on input.speech.started)        │ tool.call (client tools)
  tool.call → board.send(action) ──► Durable Object ──ack/result──► tool.result (immediately)
                                             │ broadcast
                          KDS / FOH / Menu pages (WebSocket to the same DO)

Worker (workers.dev, HTTPS)
  GET  /api/token            → mints AssemblyAI temp token (API key stays server-side)
  GET  /ws                   → upgrade → Kitchen Durable Object
  GET  /api/tools/inventory  → HTTP tool (owner phone agent), secret header required
  GET  /api/tools/report     → HTTP tool (owner phone agent, stretch)
  static assets              → /public
Durable Object "Kitchen": authoritative state, applyAction(), broadcast, alarm() for ticket-age alerts
```
- **Two agents:**
  - *Station agent:* mostly client tools plus the `inventory_lookup` HTTP tool.
  - *Owner phone agent* (stretch): HTTP tools only, because a Twilio SIP call has no browser to run client tools.
- **Hybrid tools on purpose:** client tools update the screen instantly and show off client-side tool calling. HTTP tools cover server-side reads and the phone line.

## Repo layout
```
wrangler.jsonc             # assets dir, DO binding + migration, vars
package.json               # devDependency: wrangler; scripts: dev, deploy, test, agent, eval
src/worker.js              # router: token, ws upgrade, tool endpoints, static fallthrough
src/kitchen.js             # Durable Object (state, websockets w/ hibernation, alarm)
src/state.js               # pure applyAction(state, action) → {state, result}; matchItem()
src/state.test.js          # node --test: reducer + fuzzy matching
data/menu.json             # items, aliases, counts (imported by worker + agent script)
public/station.html  kds.html  foh.html  menu.html
public/js/agent.js         # AssemblyAI session, event log, tool dispatch, result queue, resume
public/js/audio.js         # mic capture + playback queue; public/js/pcm-worklet.js
public/js/board.js         # shared DO websocket client used by all pages
public/css/app.css
agent/station.json         # stored-agent config (prompt, tools, keyterms, input/output)
agent/prompt.md
scripts/agent.js           # create/update agents via REST; writes AGENT_ID to .dev.vars
eval/commands.json         # utterance → expected tool + args (incl. chatter = no tool)
eval/audio/*.wav           # recorded clips, + noise-mixed copies
eval/run.js                # replays clips over WebSocket (Node 22 global WebSocket), scores
README.md  docs/ARCHITECTURE.md  docs/API.md  docs/SUBMISSION.md
```
`PLAN.md` stays as the product plan and is linked from the README.

## Key implementation details
- **Auth:**
  - The REST API (`https://agents.assemblyai.com/v1/agents`) takes `Authorization: <key>`; a `Bearer` prefix also works.
  - The browser connects with `?token=` from `/api/token`.
  - Secrets are managed with `wrangler secret put ASSEMBLYAI_API_KEY` and `TOOL_SECRET`.
- **Session:**
  - The first message is `session.update {agent_id}`.
  - `system_prompt` and `turn_detection` can be changed mid-session; the rest is fixed on the stored agent.
  - `input.voice_focus` and HTTP tools are set when the agent is created.
- **Tool result queue (`agent.js`):** on `tool.call`, run the action and queue the result. Send queued results only once `reply.done` has arrived and no new reply or user speech is in progress; re-check after every tool finishes. This is the bug most likely to bite.
- **Barge-in:** on `input.speech.started`, stop and clear playback.
- **Reconnect:** on WebSocket close, reconnect and send `session.resume {session_id}` within the 30-second window.
- **Proactive alerts:** a DO `alarm()` checks ticket ages every 30 seconds and broadcasts `alert`. The station sends `reply.create {instructions}` only when idle.
- **Item matching (`state.js`):** exact name, then alias, then edit distance ≤ 2. If still ambiguous, return `{error:"unknown_item", options:[…]}` so the agent asks "Which item?".
- **Void safety:** `void_ticket` only runs when `confirmed:true`.
- **HTTP tool endpoints:** check the `X-Tool-Secret` header; keep responses under 8 KiB; return clear error messages.
- **Latency log:** the station records `input.speech.stopped` → `tool.call` → DO ack; each screen records ack → render. Both show live in the event log.

## 13-day schedule (docs updated as you go, not at the end)
| Day | Build | Exit check | Docs |
|---|---|---|---|
| 1 | Cloudflare + AssemblyAI accounts; `wrangler init`; deploy "hello"; **check the unknowns** (exact temp-token endpoint and params, voice list, client tools on a stored agent, `reply.create` when idle) | Public URL works; unknowns written down | README skeleton |
| 2 | `audio.js` + worklet, `agent.js` with a minimal agent, playback, barge-in, event log | Talk ↔ reply works; interrupting stops audio | ARCHITECTURE: audio + session flow |
| 3 | `state.js` + tests, Kitchen DO, `board.js`, `/ws` | `npm test` passes; two tabs stay in sync | API: state model, WS messages |
| 4 | All client tools, result queue, `scripts/agent.js`, `agent/station.json` | "86 salmon" → DO state → `tool.result` shown in log | API: tool reference |
| 5 | KDS / FOH / menu pages, rush seed | One command visibly changes three screens | — |
| 6 | `inventory_lookup` HTTP tool + secret, fuzzy matching, void confirmation | "How many short rib?" answered from Worker | API: HTTP endpoints |
| 7 | Eval harness: record ~40 commands + ~20 chatter lines; mix in kitchen noise with ffmpeg | `npm run eval` prints accuracy, false triggers, latency | SUBMISSION: eval method |
| 8 | Tune `transcription_mode`, `voice_focus_threshold`, keyterms, prompt against eval | Numbers improve and are recorded | SUBMISSION: results table |
| 9 | DO alarm alerts, `session.resume`, push-to-talk (spacebar) fallback | Alert spoken; unplugging Wi-Fi recovers | ARCHITECTURE: resilience |
| 10 | *Stretch:* owner phone agent (HTTP tools) + Twilio SIP number | Phone call answers "what did we 86?" (skip if behind) | README: Twilio setup |
| 11 | UI polish, latency meter, visual check on a phone, deploy hardening | Full demo runs on deployed URL | README complete |
| 12 | Submission write-up, slides, record backup video | Video done | SUBMISSION complete |
| 13 | Buffer, rehearse the demo 5× with noise, code freeze | 5/5 clean runs | Final proofread |

## Documentation deliverables
- **README.md:** what it is, a 30-second GIF, prerequisites (Node 22, Cloudflare account, AssemblyAI key), `npm i`, `.dev.vars`, `npm run agent`, `npm run dev`, `npm run deploy`, secrets, Twilio (optional), troubleshooting (mic permissions, token errors, HTTP tool can't reach the host).
- **docs/ARCHITECTURE.md:** diagram, event sequence for a command (speech → tool.call → DO → broadcast → tool.result → reply), design decisions and why (direct WebSocket, DO, hybrid tools, stored agent), resilience, latency budget.
- **docs/API.md:** Worker endpoints, WebSocket message types (`action`, `ack`, `state`, `alert`), state shape, every tool with its JSON schema, mode, and example call and result.
- **docs/SUBMISSION.md:** problem, solution, AssemblyAI features used and why, eval results, business model, demo script (from `PLAN.md` §6), slide outline, limitations and roadmap.

## Verification
1. `npm test`: reducer, item matching, and void-confirm cases.
2. `npm run dev` (wrangler dev) → open station + KDS + FOH + menu → say the demo commands and watch all screens update. Note that HTTP tools can't reach localhost, so test those on the deployed URL.
3. `npm run eval` against the deployed agent, clean and with noise. Targets: command accuracy ≥ 90%, 0 false triggers from chatter, and median speech-end → screen update < 1.5 s. Record the actual results.
4. `npm run deploy` → run the full `PLAN.md` demo script 5× on the public URL with a speaker playing kitchen noise and a phone showing `/menu`.
5. Resilience: kill Wi-Fi for 10 s during a session and confirm it resumes. Test alerts by seeding an old ticket.
6. (Stretch) Call the Twilio number and ask the owner questions.
