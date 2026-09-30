---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "86 It — say it once, every screen knows: real voice control for restaurant kitchens"
destination: youtube
aspect: 1920x1080
language: en
length: 180s
audience: hackathon judges (AssemblyAI Voice Agent API track)
angle: show-it-as-is — a real, automated live-demo capture of the working app
narration: yes
---

## Intent

A ~3:00 backup demo video for the hackathon submission: show the working
"86 It" app doing exactly what the demo script in `docs/SUBMISSION.md`
says, beat for beat, on the real deployed site. Automated but with a
**real voice loop**: a scripted WAV (macOS `say` synthesis of the cook's
lines over silence) is fed to Chrome as a fake microphone, so AssemblyAI
actually transcribes, the agent actually replies, tools actually fire,
and the KDS/FOH/menu screens actually update — all captured live. Voice
commands also appear as on-screen captions; a TTS narration carries the
story for judges. Honest as a backup recording: judges hear the loop
worked without a human at the keyboard.

## Assets

- https://86-it.rd5510.workers.dev — the deployed app (capture target):
  /station, /kds, /foh, /menu.
- `docs/SUBMISSION.md` § Demo script (3:00) — the authoritative beat list.
- Generated at build time: `demo-mic.wav` (scripted cook lines over
  silence, placed at beat timestamps) and the per-beat screen recordings
  (`capture/demo/*.mp4|webm` + stills) from the real loop.

## Customizations

- Real voice via scripted-WAV fake mic
  (`--use-file-for-fake-audio-capture`), not captions-only simulation.
- Animated count-up on the results beat (96.8% accuracy, 12/12 chatter).
- No music (`music: none`); voice + captions + captured app audio only.
- Design preset picked by the workflow (dark UI + the app's orange
  accent) — user delegated this choice.
- Captions for the cook's spoken lines (they are the demo's dialogue).

## Notes

- Aspect 16:9 / 1920x1080 (YouTube embed for the submission form).
- Latency honesty: screens change 2–4 s after each spoken line, matching
  measured behavior — don't compress it to instant.
- Mishearing beats (if any occur in the real capture) are honest; keep
  them if they show the safe fallback ("Which table?").
- The agent's real spoken replies can be pulled from the AssemblyAI
  session recording (`npm run sessions:save`) if tab audio is not captured.
- Two run-shape answers from the user: storyboard first, automation flow.
