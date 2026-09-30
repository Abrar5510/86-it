---
format: 1920x1080
duration: 180s
message: "86 It — say it once, every screen knows: real voice control for restaurant kitchens"
arc: Demo Loop → question → product intro → demo cycles (fire / 86 / status / chatter / barge-in / alert) → noisy proof → trust → CTA
audience: hackathon judges (AssemblyAI Voice Agent API track)
mode: collaborative
music: none
---

## Locked

- v1 layout approved by user ("alright perfect build it") — all 12 frame layouts,
  copy, seam map and token choices locked. Frames go outline → built.
- Open: none.

## Frame 1 — Hook: Friday, 8 pm

- scene: Full-bleed kinetic type on ink-black: "friday, 8 pm." → "the salmon ran out." → "the app sold it six more times." — each beat lands solo, orange accent on "six more times."
- voiceover: "Friday, eight pm. The salmon runs out — and the delivery app sells it six more times."
- duration: 6.687s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- type: hook
- persuasion: Pain agitation
- beat: frustration → tension
- blueprint: kinetic-type-beats
- asset_candidates:

narrativeRole: Open on the viewer's pain in their own words — the story every restaurant tells.
keyMessage: Shouting distance is broken; overselling sold-out dishes costs money.

## Frame 2 — Product intro: 86 It

- scene: Title card chain: wordmark "86 It" (big, lowercase 900) → tagline "say it once. every screen knows." → small mono label "VOICE CONTROL FOR THE LINE · ASSEMBLYAI VOICE AGENT API".
- voiceover: "86 It — say it once, every screen knows."
- duration: 4.232s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/02-intro.html
- type: product_intro
- persuasion: Value proposition
- beat: curiosity → clarity
- blueprint: titlecard-reveal
- asset_candidates:

narrativeRole: Land the promise (the message) by beat 2, per the story spine.
keyMessage: The product's one claim, spoken once, before any evidence.

## Frame 3 — Demo 1: "Fire twelve"

- scene: Real capture: station (mic + live transcript) left, KDS tickets right. Caption "🔥 cook: 'Fire twelve.'" → transcript shows tool call → ~2s later ticket 12 flips to orange on the KDS. Real latency, uncut.
- voiceover: "A cook says fire twelve — the ticket moves before he looks up."
- duration: 5.172s
- transition_in: crossfade
- status: animated
- src: compositions/frames/03-fire.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: intrigue → relief
- blueprint: device-surface-showcase
- asset_candidates: assets/demo-fire-12.mp4 — real screen capture: station transcript + KDS ticket 12 firing, live AssemblyAI loop

narrativeRole: Demo cycle 1 — the smallest possible proof that voice reaches the kitchen display.
keyMessage: Spoken words become state changes on the real screens.

## Frame 4 — Demo 2: "Eighty-six salmon"

- scene: Real capture, quad view: station · KDS · FOH · online menu. Caption "'86 salmon.'" → agent replies "86 Salmon." → salmon greys out on all three other screens in the same beat, with the station's event log showing mark_86.
- voiceover: "Eighty-six salmon — greys out on the kitchen display, the servers' screen, and the online menu. Every screen, one sentence."
- duration: 8.751s
- transition_in: crossfade
- status: animated
- src: compositions/frames/04-86-salmon.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: relief + power
- blueprint: device-surface-showcase
- asset_candidates: assets/demo-86-salmon.mp4 — real screen capture: 86 salmon propagating to KDS + FOH + menu simultaneously

narrativeRole: Demo cycle 2 — the headline feature, the moment the whole product justifies itself.
keyMessage: One sentence updates every surface at once.

## Frame 5 — Demo 3: status question

- scene: Real capture: station alone, transcript close. Caption "'How long on seven?'" → agent speaks "Seven: 14 minutes." — transcript + spoken reply visible; log shows ticket_status.
- voiceover: "Ask out loud: how long on seven? — and the kitchen answers back."
- duration: 5.381s
- transition_in: crossfade
- status: animated
- src: compositions/frames/05-status.html
- type: feature_showcase
- persuasion: Friction reduction
- beat: ease + control
- blueprint: prompt-type-submit-generate
- asset_candidates: assets/demo-status-7.mp4 — real screen capture: voice question answered with spoken ticket status

narrativeRole: Demo cycle 3 — prove it's two-way: the agent answers, not just acts.
keyMessage: Status questions by voice; no screen touched.

## Frame 6 — Demo 4: chatter is ignored

- scene: Real capture: station with transcript running during loud football chatter caption ("🎙 teammate: 'did you watch the game last night?'") → log shows NO tool call, dash reply, nothing changes on KDS. Mono stamp: "0 TOOL CALLS".
- voiceover: "A teammate talks about the game. Nothing happens. No tool call — the kitchen stays quiet."
- duration: 6.792s
- transition_in: crossfade
- status: animated
- src: compositions/frames/06-chatter.html
- type: benefit_highlight
- persuasion: Negative contrast (what it doesn't do)
- beat: skepticism → trust
- blueprint: kinetic-type-beats
- asset_candidates: assets/demo-chatter.mp4 — real screen capture: chatter line ignored, event log free of tool calls

narrativeRole: Demo cycle 4 — disarm the judge's biggest doubt ("it'll fire on everything").
keyMessage: Silence on chatter is a feature; safety by default.

## Frame 7 — Demo 5: barge-in

- scene: Real capture: agent mid-sentence (waveform/transcript of a long reply), caption "'wait, stop'" → playback halts instantly, transcript shows interrupt. Mono stamp: "INTERRUPTED · 0ms hesitation".
- voiceover: "And if it talks too long — you just talk over it. It stops."
- duration: 4.78s
- transition_in: crossfade
- status: animated
- src: compositions/frames/07-bargein.html
- type: benefit_highlight
- persuasion: Risk reversal
- beat: control + ease
- blueprint: device-surface-showcase
- asset_candidates: assets/demo-bargein.mp4 — real screen capture: agent reply cut mid-sentence, transcript "Wait, stop." with interrupt ellipsis on the station

narrativeRole: Demo cycle 5 — the cook stays in charge of the exchange.
keyMessage: Semantic barge-in; the agent never holds the floor.

## Frame 8 — Demo 6: the agent speaks first

- scene: Real capture: station idle → agent spontaneously says "Table 4, 12 minutes." (reply.create alert); alert banner appears on station. Mono stamp: "reply.create · PROACTIVE".
- voiceover: "Then, unprompted, it warns you: table four — twelve minutes."
- duration: 5.721s
- transition_in: crossfade
- status: animated
- src: compositions/frames/08-alert.html
- type: feature_showcase
- persuasion: Authority — the system watches the clock
- beat: awe + peace of mind
- blueprint: agent-progress-theater
- asset_candidates: assets/demo-alert.mp4 — real screen capture: proactive late-ticket alert spoken by the agent

narrativeRole: Demo cycle 6 — escalate from command-and-response to a system that initiates.
keyMessage: The agent acts without being asked (reply.create).

## Frame 9 — Live, unedited: the tool in real time

- scene: Raw full-bleed screen capture, station page, t+73→124 of the run3 service run — no overlays, no captions, no voice-over, nothing added. One continuous take: off-topic chatter gets no tool call; "All day fries?" answered live; "Wait, stop." barge-in; "Fire table for" → Fired 4 + proactive "Table 4, 12 minutes." alert + clarification — five commands, ~175 ms median. Audio is the live mic over a busy-kitchen bed (vent hum, crowd babble, sizzle, clatter).
- voiceover: — none (raw segment, deliberately unnarrated)
- duration: 51s
- transition_in: crossfade
- status: animated
- src: compositions/frames/09-live-raw.html
- type: benefit_highlight
- persuasion: Robustness proof under load
- beat: awe + trust
- blueprint: device-surface-showcase
- asset_candidates: assets/demo-live.mp4 — real screen capture: station page, live service, uncut

narrativeRole: Demo cycle 7 — the raw proof. Nothing staged: one unedited take of real service, heard as it happened.
keyMessage: It works live, in real time, over real kitchen noise — no edit, no narration, no motion graphics.

## Frame 10 — How it works

- scene: Diagram build: browser station → one WebSocket → AssemblyAI (STT+LLM+TTS) → tool.call → Cloudflare Durable Object → fan-out arrows to KDS / FOH / menu; nodes pop in as the VO names them, orange connectors draw on last. Mono chips: "session.update", "10 tools", "keyterms", "voice_focus".
- voiceover: "One WebSocket does speech, reasoning and voice. Tools hit a Durable Object. Every screen follows the same state."
- duration: 9.613s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/09-how.html
- type: social_proof
- persuasion: Authority by association
- beat: clarity + confidence
- blueprint: constellation-hub
- asset_candidates:

narrativeRole: The trust beat — show the mechanism behind the magic so judges can audit it.
keyMessage: Built on the AssemblyAI Voice Agent API; real engineering, not a mock.

## Frame 11 — Results

- scene: Count-up hits on a dark stat grid: 96.8% command accuracy · 12/12 chatter ignored · 0 spoken false triggers · 43 eval clips; numbers tick as the VO reads them, "96.8%" lands biggest last. Small mono footnote: "live AssemblyAI sessions · every run recorded".
- voiceover: "Measured over forty-three clips: ninety-six point eight percent accuracy. Twelve of twelve chatter lines ignored. Zero false triggers."
- duration: 10.527s
- transition_in: crossfade
- status: animated
- src: compositions/frames/10-results.html
- type: social_proof
- persuasion: Statistical proof
- beat: trust → confidence
- blueprint: dataviz-countup
- asset_candidates:

narrativeRole: The numbers behind the demo — evidence for the judges' rubric.
keyMessage: The demo isn't lucky; it's measured.

## Frame 12 — Business

- scene: Accumulating value list popping one line per second: "one location, one monthly price" · "headset + tablet bundle" · "plugs into POS vendors via act()" · "fewer refunds, fewer comps" · "timestamped 86 log from session timelines" — holds as a full list.
- voiceover: "Sold per location to restaurants — and it slots into POS vendors as an add-on. Fewer refunds, faster tickets, an audit trail of every 86."
- duration: 11.337s
- transition_in: crossfade
- status: animated
- src: compositions/frames/11-business.html
- type: benefit_highlight
- persuasion: Value stacking
- beat: motivation
- blueprint: grid-card-assemble
- asset_candidates:

narrativeRole: Give the judges the business case they need to score.
keyMessage: Clear buyer, clear model, real money saved.

## Frame 13 — CTA: try it

- scene: Wordmark assembles center ("86 It"), then the URL pushes through to a held end card: 86-it.rd5510.workers.dev + mono line "SAY IT ONCE. EVERY SCREEN KNOWS." — hold with caret blink.
- voiceover: "Try it — say it once. Eight-six, dot it, workers dot dev."
- duration: 5.773s
- transition_in: crossfade
- status: animated
- src: compositions/frames/12-cta.html
- type: cta
- persuasion: Risk reversal — live demo, no signup
- beat: urgency-to-act
- blueprint: logo-assemble-lockup
- asset_candidates:

narrativeRole: Close on the claim + the place to verify it live.
keyMessage: Here's the URL — judge it yourself.

