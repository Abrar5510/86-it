---
title: "86 It"
marp: false
---

<style>
section { font-family: -apple-system, "Helvetica Neue", sans-serif; padding: 60px; }
h1 { color: #e8440f; }
table { font-size: 0.9em; }
a { color: #e8440f; }
</style>

<div style="page-break-after: always;"></div>

# 86 It 🔥🎙️

## Say it once. Every screen knows.

**Voice control for restaurant kitchens, built on the AssemblyAI Voice Agent API.**

A cook says "86 salmon" → every screen updates in seconds.

[https://86-it.rd5510.workers.dev/station](https://86-it.rd5510.workers.dev/station)

<div style="page-break-after: always;"></div>

# The problem

- When a kitchen runs out of a dish, **the news travels by shouting**.
- Servers keep selling it — so do DoorDash and Uber Eats.
- Result: refunds, comped meals, angry guests, 1-star reviews.
- Cooks **can't tap screens** with gloved or greasy hands.
- Kitchens are **too loud** for ordinary voice assistants.

> 📌 Add 1–2 sourced numbers here (refund rates, razor-thin restaurant margins) before submitting.

<div style="page-break-after: always;"></div>

# The demo (live)

| The cook says | What happens |
|---|---|
| "86 salmon" | Salmon greys out on KDS, servers' screen and online menu — same moment |
| "Fire 12" / "Bump 4" | Ticket moves on the kitchen display |
| "How long on 7?" | "Seven: 14 minutes." |
| "12 has a nut allergy" | Red banner on ticket 12 |
| "Void 7?" → "yes" | Confirmed before anything happens |
| *(teammate chats about football)* | **Nothing** — the agent stays silent |
| *(ticket passes 10 min)* | Agent speaks up: "Table 4, 12 minutes." |

**Live:** [https://86-it.rd5510.workers.dev/station](https://86-it.rd5510.workers.dev/station)

<div style="page-break-after: always;"></div>

# How it works

```
Browser station ──audio──▶ AssemblyAI Voice Agent (one WebSocket)
      │                      STT + LLM + TTS + turn detection
      │ tool.call                  inline config: prompt, 10 tools,
      ▼                            keyterms, voice focus
Cloudflare Durable Object ──broadcast──▶ KDS  ·  FOH  ·  Online menu
      ▲
AssemblyAI ──HTTP tools──▶ Worker (owner phone line, secret-guarded)
```

**AssemblyAI features used:** Voice Agent API · inline session config ·
10 client tools with JSON-Schema enums · keyterms (kitchen slang) ·
voice focus `near-field` · `transcription_mode: min_latency` ·
semantic barge-in · temporary tokens · `reply.create` alerts ·
`session.resume` reconnect

<div style="page-break-after: always;"></div>

# Results

**43-clip eval: 31 commands + 12 chatter lines, each in a fresh session.**

| Condition | Commands correct | Chatter ignored | Agent spoke on chatter | Speech → screen (p50) |
|---|---|---|---|---|
| Clean | **30 / 31 (96.8%)** | **12 / 12** | **0** | 3.3 s |
| Pink noise −12 dB | **30 / 31 (96.8%)** | **12 / 12** | **0** | 2.4 s |

- Both misses were transcription errors — and the agent did the **safe** thing
  ("Which table?" / stayed silent).
- Safety cases pass: "Void 7" asks first · unknown item → "Which item?"
- **15 unit tests** (`npm test`) · every session recorded and replayable
- ⚠️ Clips are synthesized speech + pink noise (label as such, or record real voices)

<div style="page-break-after: always;"></div>

# Business

- **Buyer:** independent restaurants and restaurant groups (owner / kitchen manager)
- **Price:** per location / month, optional hardware bundle (headset + tablet)
- **Distribution:** add-on for POS & KDS vendors (Toast, Square, Lightspeed) — the `act()` interface is where their inventory APIs plug in
- **Value:** fewer refunds and comps · faster ticket times · allergy flags that can't be missed · timestamped 86 log from the session timeline
- **Roadmap:** multiple stations · multi-location dashboards · manager analytics

### Thanks! Questions?

**86 It — say it once. Every screen knows.**
[https://86-it.rd5510.workers.dev](https://86-it.rd5510.workers.dev) · [docs/SUBMISSION.md](SUBMISSION.md)
