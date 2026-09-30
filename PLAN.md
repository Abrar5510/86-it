# 86 It — Build Plan

> Kitchen voice control. What a cook says updates every screen instantly: the kitchen display, the servers' screen, and the online menu.
> Track: **AssemblyAI Voice Agent API**

---

## 1. One-liner & pitch

**Problem:** When a kitchen runs out of an item, the word spreads by shouting. Servers and delivery apps keep selling it → refunds, comped meals, 1-star reviews. Cooks can't touch screens with gloved/greasy hands, and kitchens are too loud for normal voice assistants.

**Solution:** A voice agent on a headset at each station. "86 salmon" → greyed out on every screen and on the online menu in under 2 seconds. "Fire 12", "bump 7", "how long on 4?" — all hands-free.

**Buyer:** Restaurant owners/groups; later, POS vendors (Toast, Square) as a plug-in.
**Model:** Per location per month.

---

## 2. Scope

### MVP (must ship)
- [x] One station talking to the Voice Agent over WebSocket from the browser
- [x] Kitchen display (KDS) with tickets: fire / bump / hold
- [x] 86 / set counts → propagates to KDS, front-of-house (FOH) screen, online menu page
- [x] Status questions ("how long on 7?") answered by voice
- [x] Chatter is ignored (no action unless a command is heard)
- [x] Live event log panel (tool calls + latency) for judges

### Stretch (in order)
1. Proactive ticket-time alerts ("Table 4, 18 minutes") via `reply.create`
2. Second station = second session, same shared boards
3. Twilio SIP line: owner calls in — "what did we 86 tonight?"
4. End-of-night report from the session timelines

### Out of scope
Auth, real POS integration, multi-restaurant, payments, mobile app.

---

## 3. Architecture

```
Browser (station tablet + headset)
  ├─ mic → AudioWorklet → PCM16 24 kHz → base64 → input.audio ─┐
  ├─ reply.audio → playback queue (flushed on barge-in)        │
  ├─ tool.call → local handler → POST /api/action              │
  └─ SSE /api/stream ← state updates                            │
                                                                ▼
                                    wss://agents.assemblyai.com/v1/ws?token=…
                                      stored agent (prompt, tools, keyterms, voice_focus)
                                      └─ HTTP tool → https://<public-host>/api/inventory

Node server (one process, deployed publicly over HTTPS)
  ├─ GET  /api/token      → proxies AssemblyAI temp token (API key never reaches browser)
  ├─ POST /api/action     → mutates in-memory state, broadcasts over SSE
  ├─ GET  /api/stream     → SSE to KDS / FOH / menu screens
  ├─ GET  /api/inventory  → HTTP tool target
  └─ static: /kds  /foh  /menu
```

**Key decisions**
- **Stored agent** (created once via `POST /v1/agents`): HTTP tools and `voice_focus` are configured at agent creation. Browser sends `session.update` with `agent_id` only.
- **Browser auth:** temporary token via `?token=` — never ship the API key to the client.
- **One process, in-memory state, SSE fan-out.** No database needed for the demo.
  `ponytail: in-memory state, move to Supabase realtime if we need multiple servers or persistence.`
- **Must be deployed on public HTTPS** (Render / Railway / Fly). AssemblyAI HTTP tools block localhost/private IPs. Fallback: `cloudflared tunnel`.
- **One session per station.** The Voice Agent API doesn't label speakers, so the device identifies the station.

### File layout (target)
```
server.js            # http server, token proxy, state, SSE, inventory endpoint
scripts/create-agent.js  # creates/updates the stored agent, prints agent_id
public/
  station.html       # mic + agent session + event log
  kds.html           # kitchen display
  foh.html           # server screen
  menu.html          # mock online ordering page
  audio.js           # mic capture worklet + playback queue
  shared.css
menu.json            # items, counts, aliases
.env                 # ASSEMBLYAI_API_KEY, AGENT_ID, PUBLIC_URL
```

---

## 4. Agent configuration

### Tools (≤10 — docs say accuracy drops above that)

| Tool | Kind | Mode | Args | Effect |
|---|---|---|---|---|
| `fire_ticket` | client | interactive | `table` int | Ticket → "cooking" |
| `bump_ticket` | client | interactive | `table` int | Ticket → done, leaves KDS |
| `hold_ticket` | client | interactive | `table` int | Ticket → held |
| `void_ticket` | client | interactive | `table` int, `confirmed` bool | Only runs if `confirmed=true` |
| `mark_86` | client | interactive | `item` string, `remaining` int (0 = out) | Greys item on FOH + menu |
| `restore_item` | client | interactive | `item` string | Un-86 |
| `ticket_status` | client | interactive | `table` int | Returns age + waiting items |
| `flag_allergy` | client | interactive | `table` int, `allergen` string | Red banner on ticket |
| `inventory_lookup` | **HTTP** GET | interactive | `item` string | Returns count from `/api/inventory` |

Schema rules (from the docs): snake_case names; each description starts with the format and gives an example; use `enum` for menu items where possible.

### System prompt (draft)
```
You are the kitchen voice system on a busy restaurant line.
- Reply in 1–4 words. Never chat. Examples: "Fired 12." "86 salmon." "Seven: 14 minutes, risotto."
- Only act on kitchen commands: fire, bump, hold, void, 86, all day, how long, allergy.
- If speech is not a command (chatter, music, arguing), say NOTHING and call no tool.
- Before void_ticket, ask "Void 12?" and only call with confirmed=true after "yes".
- If an item name doesn't match the menu, say "Which item?" — never guess.
- Kitchen slang: "86" = out of stock; "all day" = total count; "on the fly" = rush.
```
⚠️ Interactive tools may produce a short transition phrase ("let me check") — test it and tighten the prompt if it's too chatty.

### Input / output settings
- `input.keyterms`: every menu item + aliases + slang (`86`, `all day`, `on the fly`, `fire`, `bump`, `VIP`, `sub`)
- `input.voice_focus`: `"near-field"` (headset); `voice_focus_threshold` ~0.85, tune up if the noise track leaks through
- `input.turn_detection`: short `min_silence` (try 400–600 ms), `interrupt_response: true`; tune `vad_threshold` against the noise track
- `output.voice`: pick the crispest voice; `volume` loud enough to cut through the noise

### Protocol gotchas (from the WebSocket spec)
- First message must be `session.update`.
- Audio in and out: PCM16, **24 kHz**, base64.
- Send `tool.result` **only after `reply.done`**. Queue results if a reply is in flight, and flush when idle (a tool can finish after `reply.done` has already fired).
- On `input.speech.started`, stop and clear audio playback (barge-in).
- `session.resume` gives a 30 s grace window. Use it to auto-reconnect on Wi-Fi blips.
- `reply.create` with `instructions` = proactive speech (for the stretch alerts).
- HTTP tool responses are capped at 8 KiB; keep `/api/inventory` small.

---

## 5. Phases & tasks

Times assume a ~24–48 h hackathon; scale as needed.

### Phase 0 — Setup (≈1 h)
- [x] AssemblyAI key, `.env`, deploy an empty Node app to the public host (get HTTPS URL early)
- [x] `menu.json` with ~12 items + aliases
- **Done when:** public URL serves `hello`.

### Phase 1 — Voice loop (≈4 h) ← riskiest, do first
- [x] `/api/token` proxy
- [x] `scripts/create-agent.js` with prompt + keyterms + voice_focus + 1 test tool
- [x] `station.html`: mic → worklet → `input.audio`; play `reply.audio`; barge-in flush
- [x] Event log panel showing every server event with timestamps
- **Done when:** you talk, it answers, and interrupting it stops playback.

### Phase 2 — Tools & state (≈4 h)
- [x] In-memory state + `POST /api/action` + SSE `/api/stream`
- [x] All client tools with the queued `tool.result` logic
- [x] `/api/inventory` + register the HTTP tool
- [x] Fuzzy item matching against `menu.json` aliases (e.g. "the fish" → salmon)
- **Done when:** "86 salmon" changes state and the event log shows `tool.call` → `tool.result`.

### Phase 3 — Screens (≈4 h)
- [x] `kds.html`: ticket cards, age timers, colors, allergy banner
- [x] `foh.html`: menu grid, 86'd items greyed with timestamp
- [x] `menu.html`: phone-sized ordering page, "Sold out" badge
- [x] Seed script to generate a realistic dinner rush of tickets
- **Done when:** one command visibly changes three screens.

### Phase 4 — Robustness in noise (≈3 h)
- [ ] Record/find a kitchen noise track; play it through a speaker while testing
- [x] Tune `voice_focus_threshold`, `vad_threshold`, `min_silence`
- [x] Chatter test: 20 non-command sentences → 0 tool calls (log the result as a stat for the pitch)
- [x] Accuracy test: 30 commands → count correct (another pitch stat)
- [x] Latency: measure speech-stopped → tool.call → screen update; show it live in the log
- [x] Push-to-talk fallback button (keyboard / foot pedal = spacebar)
- [x] Auto-reconnect with `session.resume`
- **Done when:** the demo script works 5 times in a row with noise on.

### Phase 5 — Stretch (as time allows)
- [x] Proactive alerts: server timer → `reply.create` with "Say: Table 4, 18 minutes."
- [ ] Second station tab with its own session
- [ ] Twilio SIP number → same agent, owner Q&A

### Phase 6 — Pitch & demo (≈3 h, don't skip)
- [x] Record a full backup demo video
- [x] Slides (below)
- [ ] Rehearse the 3-minute script 3+ times with a timer
- [ ] Hardware: headset, speaker for noise, phone hotspot, phone showing `menu.html`

---

## 6. Demo script (3:00)

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:20 | "Friday, 8 pm. Salmon runs out. DoorDash sells it six more times." | Title slide |
| 0:20–0:40 | Start kitchen noise. "Fire 12." | Ticket turns orange |
| 0:40–1:05 | **"86 salmon."** | KDS + FOH + phone menu grey out at once — pause and let it land |
| 1:05–1:25 | "How long on 7?" → "Seven: 14 minutes, risotto." | Ticket highlights |
| 1:25–1:40 | Teammate chats loudly about football | Nothing happens; log shows no tool call |
| 1:40–1:55 | Interrupt the agent mid-reply | Playback stops instantly |
| 1:55–2:05 | (stretch) Proactive alert fires | "Table 4, 18 minutes" |
| 2:05–2:35 | Tech slide + live event log: tools, keyterms, voice_focus, turn detection, latency | Log panel |
| 2:35–3:00 | Business: buyer, pain in money, pricing, POS integration path | Business slide |

---

## 7. Slides (6 max)
1. Title + tagline
2. Problem (with sourced numbers — cite them, no invented stats)
3. Live demo
4. How it works: architecture diagram + list of AssemblyAI features used and **why each one**
5. Results: chatter test, command accuracy, median latency (your measured numbers)
6. Business: buyer, pricing, roadmap (POS plug-in, multi-station, manager analytics)

---

## 8. Judging checklist

| Criterion | Proof we show |
|---|---|
| Application of Technology | Stored agent, 8 client tools + 1 HTTP tool, keyterms, voice_focus, tuned turn detection, barge-in, `reply.create`, `session.resume`, temp tokens |
| Presentation | One command changes three screens; live log; rehearsed; backup video |
| Business Value | Named buyer, refund/comp problem, per-location pricing, POS plug-in path |
| Originality | Voice drives a live system instead of answering calls; kitchen slang; deliberately ignores chatter; works in noise |

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Chatter triggers actions | Strict prompt, confirmation for voids, push-to-talk fallback |
| Menu items misheard | Keyterms + alias fuzzy matching + "Which item?" |
| Venue Wi-Fi drops | Phone hotspot, `session.resume`, backup video |
| HTTP tool can't reach server | Deploy early (Phase 0); tunnel as fallback |
| Agent too chatty | Prompt examples, test transition phrases, lower output volume |
| Tool results sent at wrong time | Queue + flush after `reply.done` (Phase 2 test) |

---

## 10. To verify early
- [x] Exact temp-token endpoint host/params (`GET /v1/token`)
- [x] Whether client-side tools can be defined on the stored agent alongside HTTP tools
- [x] Available voices — pick one that's crisp at volume
- [x] Whether `reply.create` works while idle with no user turn (needed for alerts)
- [ ] Hackathon rules: team size, whether pre-built code is allowed, submission format (video? repo?)
