# 86 It: Submission

> **Say it once. Every screen knows.**
> Voice control for restaurant kitchens, built on the AssemblyAI Voice Agent API.

## The problem
When a kitchen runs out of a dish, the news spreads by shouting. Servers keep selling it, and so do delivery apps. That leads to refunds, comped meals, angry guests and bad reviews. Cooks can't tap screens with gloved or greasy hands, and kitchens are too loud for ordinary voice assistants.

> - Nearly **75% of all restaurant traffic is off-premises** — about 3 of 4 orders leave the building, so whatever the screens say is what the customer is sold ([National Restaurant Association, *Off-Premises Restaurant Trends 2025*, Apr 2025](https://restaurant.org/research-and-media/media/press-releases/from-trend-to-transformation-off-premises-dining-now-essential-for-restaurant-consumers,-operators)).
> - US restaurants cancelled **1.5–3% of their online orders in 2023**, and cancellation rates track the store's rating (below 2% → 4.5★ average; above 8% → 4.0★) — with **two cancellations in a row able to auto-pause the store** on the delivery apps ([Otter, analysis of 2023 order data, Dec 2023](https://financialpost.com/pmn/business-wire-news-releases-pmn/restaurant-operating-system-otter-releases-performance-data-to-help-restaurants-understand-order-cancellation-trends-and-mitigate-holiday-spike)).

## The solution
A headset voice station for the line. Cooks speak in their own slang, and the kitchen system reacts immediately:

| The cook says | What happens |
|---|---|
| "86 salmon" | Salmon greys out on the kitchen display, the servers' screen and the online menu at the same moment |
| "Two short rib left" | The count updates everywhere, and the item is flagged as low |
| "Fire 12" / "Bump 4" / "Hold 9" | The ticket moves on the kitchen display |
| "How long on 7?" | "Seven: 14 minutes." |
| "All day fries" | "Three fries all day." |
| "Twelve has a nut allergy" | A red banner appears on ticket 12 |
| "Void 7" | "Void 7?" → only acts after "yes" |
| *(kitchen chatter)* | Nothing: it stays silent |
| *(ticket 4 passes 10 minutes)* | The agent speaks up by itself: "Table 4, 12 minutes." |

Stretch goal: the owner calls a phone number and asks "What did we 86 tonight?" (Twilio SIP to a second agent).

## How we use AssemblyAI
| Feature | How we use it | Why |
|---|---|---|
| **Voice Agent API (single WebSocket)** | The browser streams audio directly, with speech-to-text, LLM and speech in one connection | Lowest latency, and no media server to run |
| **Inline session config** | Prompt, tools, keyterms and voice are sent in `session.update`, generated from files in git | Config is versioned; a change applies on the next session |
| **Client-side tools** (10) | Kitchen actions run in the station and go to the Durable Object | The UI updates the moment a tool is called |
| **Stored agent + HTTP tools** (owner line) | AssemblyAI calls our Worker directly, with an encrypted header secret | Works on a phone call, where there's no browser |
| **JSON Schema + enums** | Menu items restricted to an enum; integer table numbers; examples in descriptions | The model can't output an item that isn't on the menu |
| **Keyterms** | Every menu item and alias plus kitchen slang ("86", "all day", "on the fly") | Correct transcription of kitchen vocabulary |
| **Voice focus (noise suppression)** | `near-field` for a headset in a loud kitchen | Isolates the cook from background noise |
| **Turn detection + semantic barge-in** | Defaults, plus 1–5 word replies | Fast back-and-forth; cooks can cut the agent off |
| **Temporary tokens** | `/api/token` on the Worker | The API key never reaches the browser |
| **`reply.create`** | Late-ticket alerts | The agent speaks without being asked |
| **`session.resume`** | Automatic reconnect, falling back to a new session | Survives Wi-Fi blips mid-service |

## Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md). In short: browser ⇄ AssemblyAI for voice; browser ⇄ Cloudflare Durable Object for state; the Durable Object broadcasts to every screen; on the owner phone line, AssemblyAI calls the Worker's HTTP tools.

## Engineering quality
- 13 unit tests (`npm test`) cover the kitchen logic, fuzzy item matching, void safety, alerts and the session config.
- A protocol-faithful fake AssemblyAI server (`test/mock-aai.js`) flags protocol violations. The full voice loop was tested against it in the browser: tool calls, result timing, barge-in, chatter, an unknown item, a spoken alert, a dropped connection with resume, a refused resume, and the voice-focus fallback. It recorded 0 violations.

## Results
Measured with `npm run eval` (43 clips: 31 commands, 12 chatter lines). Each clip runs in its own fresh session.

Final run, 2026-09-17: live AssemblyAI Voice Agent API, managed LLM, `transcription_mode: min_latency`, voice focus `near-field`. Clips were synthesized with macOS `say`; noise is synthetic pink noise at −12 dB. All 86 sessions are recorded (see `eval/results/2026-09-17T15-14-59-333Z-clean/`, `…15-25-56-092Z-noisy/`, and `recordings/`).

| Condition | Commands correct | Chatter ignored (no tool) | Agent spoke on chatter | End of speech → screen updated (p50 / p90) | End of speech → spoken confirmation (p50) |
|---|---|---|---|---|---|
| Clean | **30 / 31 (96.8%)** | **12 / 12** | **0** | 3.3 s / 3.9 s | 4.9 s |
| Pink noise −12 dB | **30 / 31 (96.8%)** | **12 / 12** | **0** | 2.4 s / 3.1 s | 4.2 s |

The two misses were both transcription misses, and in both the agent did something safe:
- Clean: "Fire four on the fly" was heard as "Fire **for** on the fly", and the agent asked "Which table?".
- Noise: "Out of chicken" was heard as "**I got** chicken", and the agent stayed silent.

It also passed the safety cases: "Void 7" → "Void 7?" (nothing voided), "86 the lobster" → "Which item?", and "86 the fish" → salmon.

> Before quoting these, record real voices (`eval/recorded/`) and a real kitchen noise track (`eval/noise.wav`) and rerun, or label them as synthetic speech.

### What we tuned (live, every session recorded)
Every change below was measured on recorded live sessions: local event logs and audio in `eval/results/`, and AssemblyAI's own recording and timeline in `recordings/`.

| Change | Evidence | Result |
|---|---|---|
| Station config sent inline, not as a stored agent | Docs: client-side tools must be declared inline, and `agent_id` can't be mixed with inline fields | Tools work; voice focus accepted inline |
| `transcription_mode: min_latency` | A/B on 3 commands: 2.85–4.3 s (`balanced`) vs 2.2–3.7 s | **0.6–1 s faster** end of speech → action, same accuracy |
| Send tool results immediately | Timelines showed the service streams ~2 s of **silent** "transition" audio after `tool.call` before `reply.done`; waiting for it delayed every confirmation | Spoken confirmation **~2 s sooner**, no errors in any session |
| `execution_mode: hold` | Still sent `reply.started` before the tool call | No gain; reverted |
| Shorter prompt | Same 3 commands | No speed gain; kept the detailed prompt |
| `min_silence` 400 ms | "86 salmon" split into two turns | No gain; kept the defaults |
| Bring-your-own faster LLM (via AssemblyAI LLM Gateway) | Only allowed on stored agents; on this account the only available gateway model has no tool support | Not possible; stayed on the managed model |
| Silent-reply gate | On chatter the model returned "\uFEFF", "&nbsp;", "<blank>", "empty"… and the TTS voiced them | Station holds reply audio until real words arrive and drops junk |
| "Dash" rule for chatter + menu nicknames + number homophones in prompt | First full run failed "86 the fish" (model didn't know the nickname) and "fire for" (mishearing of "four") | See final results |
| "Un-86 X" → "X is back on" | In noise, "un-86 the soup" was heard as "86, the soup" and marked it **out** | Restore with "…is back on"; "un-86" is a documented limitation |

First full run (before the last prompt fixes): clean **28/31** commands, 12/12 chatter ignored, median end of speech → action **3.3 s**; noisy (pink noise, −12 dB) **29/31**, 12/12, **2.8 s**.

## Business model
- **Buyer:** independent restaurants and restaurant groups (the kitchen manager or owner).
- **Price:** per location per month, with a hardware bundle (headset + tablet) as an option.
- **Distribution:** an add-on for POS and kitchen-display vendors (Toast, Square, Lightspeed). The `act()` interface is where their inventory APIs plug in.
- **Value:** fewer refunds and comps on dishes that are already gone, faster ticket times, allergy flags that can't be missed, and a timestamped 86 log for managers (from the AssemblyAI session timeline).
- **Next:** multiple stations per kitchen, multi-location dashboards, and manager analytics (what runs out, when).

## Demo script (3:00)
| Time | Beat | Screen |
|---|---|---|
| 0:00–0:20 | "Friday, 8 pm. The salmon runs out. The delivery app sells it six more times." | Title |
| 0:20–0:40 | Start the kitchen noise. **"Fire twelve."** | Ticket 12 turns orange about 2–3 s after you finish speaking; pause for it |
| 0:40–1:05 | **"Eighty-six salmon."** Pause. | Kitchen display, servers' screen and the phone menu all grey out |
| 1:05–1:25 | "How long on seven?" → "Seven: 14 minutes." | |
| 1:25–1:40 | A teammate talks loudly about football | Nothing happens; the log shows no tool call |
| 1:40–1:55 | Interrupt the agent mid-sentence | It stops instantly |
| 1:55–2:05 | Late-ticket alert fires | "Table 4, 12 minutes." |
| 2:05–2:35 | Tech: event log, tool calls, keyterms, voice focus, latency counter | Station log |
| 2:35–3:00 | Business: buyer, pricing, POS add-on | Slide |

**Demo setup:**
- Seed the rush about 12 minutes before presenting, or fire table 4 early, so the alert is ready.
- Bring a speaker playing kitchen noise, the headset, a phone showing `/menu`, and a phone hotspot.
- Record a backup video beforehand.

## Slides (6)
1. **86 It:** "Say it once. Every screen knows."
2. **Problem:** the 86 problem, with sourced numbers.
3. **Live demo.**
4. **How it works:** the diagram, plus the AssemblyAI feature table above.
5. **Results:** the eval table.
6. **Business:** buyer, pricing, POS add-on, roadmap.

## Limitations (be upfront)
- One restaurant per deployment, with no auth on the demo screens.
- Every station receives every alert.
- The POS is a mock; stock lives in the Durable Object.
- The eval uses synthesized speech (macOS `say`) and synthetic pink noise unless you record real clips.
- The screen updates about 2–4 s after the end of speech, mostly LLM time on the managed model. That's fast enough for a kitchen, but not instant.
- "Un-86 X" is unreliable in noise (it can be heard as "86 X"); use "X is back on".
