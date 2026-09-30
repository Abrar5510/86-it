# Narration recording — 86 It

You are replacing the TTS voice with your own. 12 short lines, then I transcribe
them for word timings, rebuild the captions, and re-render.

## How to record

- **Easiest:** one continuous file — read the 12 lines top to bottom with a
  ~1 second pause between lines (and 2 seconds of silence at the start).
  I'll auto-split it. Or record 12 separate files (`01` … `12`).
- **App:** phone Voice Memos or QuickTime. Any format (m4a/wav/mp3), any sample rate.
- **Room:** quiet, no music/TV, doors closed. 20–30 cm from the mic, normal
  talking volume — don't project, don't shout.
- **Delivery:** confident, plain, a little dry — a competent line cook showing
  you their rig. Conversational, **not** announcer voice. A "—" is a natural
  pause, not read aloud. If you flub a line, just redo it in the same take.
- **Pacing:** hit roughly the target times below (the "read" column). Under is
  fine; significantly over means the frame gets tight.

## Where to put them

```
videos/86-it-demo/recordings/          ← drop files here (any names; I'll sort them)
```

Extra takes are welcome (`line04-take2` etc.) — I'll pick the best.

## The lines

| # | Read this | Target | ~Frame budget |
|---|---|---|---|
| 01 | Friday, eight pm. The salmon runs out — and the delivery app sells it six more times. | ~5.9 s | 6.7 s |
| 02 | 86 It — say it once, every screen knows. ("86 It" = "eighty-six it") | ~4.2 s | 4.2 s |
| 03 | A cook says fire twelve — the ticket moves before he looks up. | ~4.8 s | 5.2 s |
| 04 | Eighty-six salmon — greys out on the kitchen display, the servers' screen, and the online menu. Every screen, one sentence. | ~8.1 s | 8.8 s |
| 05 | Ask out loud: how long on seven? — and the kitchen answers back. | ~4.9 s | 5.4 s |
| 06 | A teammate talks about the game. Nothing happens. No tool call — the kitchen stays quiet. | ~6.3 s | 6.8 s |
| 07 | And if it talks too long — you just talk over it. It stops. | ~3.9 s | 4.8 s |
| 08 | Then, unprompted, it warns you: table four — twelve minutes. | ~5.4 s | 5.7 s |
| 09 | One WebSocket does speech, reasoning and voice. Tools hit a Durable Object. Every screen follows the same state. | ~8.5 s | 9.6 s |
| 10 | Measured over forty-three clips: ninety-six point eight percent accuracy. Twelve of twelve chatter lines ignored. Zero false triggers. | ~9.3 s | 10.5 s |
| 11 | Sold per location to restaurants — and it slots into POS vendors as an add-on. Fewer refunds, faster tickets, an audit trail of every 86. | ~9.6 s | 11.3 s |
| 12 | Try it — say it once. Eight-six, dot it, workers dot dev. | ~5.4 s | 5.8 s |

Total ≈ 76 seconds of speech across the 135.8-second video.

## What happens after (my side, ~15 min)

1. Split/trim takes, transcribe for word timings (whisper)
2. Rebuild `audio_meta.json` + captions from your actual speech
3. `ensure-video-decls` → assemble → `npm run check` → render
4. Verify frames + audio, update `SCRIPT.md` voice header, commit
