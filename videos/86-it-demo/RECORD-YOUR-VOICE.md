# Record your voice — 86 It demo

Two sets of recordings. **Set A is the priority**: it's the real voice loop (your voice → AssemblyAI → screens).
Set B is the narration (details in `RECORDING.md`; do it after A if you have time).

Use Voice Memos / QuickTime, any format. Drop files in `videos/86-it-demo/recordings/cook/` named exactly as below.

## Rules for every clip
- **One phrase per file.** Start recording, breathe, wait ~1 s of silence, speak, wait ~1 s of silence, stop. (I trim the silence.)
- Quiet room, no music/TV. Phone/mic ~20–30 cm from your mouth, held still.
- Say it **once, cleanly.** If you flub it, just re-record; extra takes (`fire-12-take2`) are welcome.
- Numbers as words, said clearly: "twelve", "seven", "four". Say "eighty-six" (not "eight-six", not "eight sixth").
- Don't add "um", "okay", "chef" or extra words. The grammar is exact-match; extras go to the slower LLM path.

## Set A — cook lines (the live station loop)

Voice for A: a cook mid-service. Clear, a touch louder than conversation (~70% of shouting), clipped,
flat-falling pitch on commands (a statement, not a question), no smile in the voice.

| File | Say exactly | Tone / delivery | What must happen on screen |
|---|---|---|---|
| `status-7` | **"How long on seven?"** | Only line that rises: real question, curious, relaxed. "seven" clear, lift on the last word. | Station speaks back "7: 14 minutes, new." |
| `fire-12` | **"Fire twelve."** | Sharp, decisive, two beats: **FIRE** — **twelve**. Drop pitch on "twelve". Don't trail off. | Ticket 12 goes orange on KDS |
| `86-salmon` | **"Eighty-six salmon."** | The headline line. Slower, weighty, firm: **eighty-SIX** … **SAL-mon**. Say "salmon" the way you normally do. | Salmon greys out on KDS, FOH, menu |
| `chatter` | **"Did you watch the game last night? That last goal was unreal."** | Opposite of the others: loose, loud, laughing, talking to a buddy, fast, upspeak on "night?". Should sound like NOT-a-command. | Nothing. Log shows no tool call |
| `all-day` | **"All day fries."** | Neutral, quick, matter-of-fact. Sets up the barge-in (agent replies with a count). | Agent starts speaking "3 Truffle Fries all day." |
| `stop` | **"Wait, stop."** | Sharp, urgent, abrupt, slightly louder, like cutting someone off. Two short words, hard **T** on "stop". | Agent cuts off mid-sentence (barge-in) |
| `fire-table-4` | **"Fire table four."** | Calm, businesslike; enunciate **FOUR** hard (STT once heard "for"). | Ticket 4 fires; agent then proactively alerts "Table 4, 12 minutes." |

You don't need to time `stop` against the agent: I place that clip over the agent's reply in post.

Optional extras if you want a stronger demo (all verified phrasings from `eval/commands.json`):
"Hold nine." · "Twelve has a nut allergy." · "Salmon is back on." · "We're out of short rib."
Avoid "un-86 X" (unreliable in noise), and "Void seven" (always goes to the LLM, asks to confirm).

## Set B — narration (12 lines, see `RECORDING.md` for the full table with target times)
Tone: a competent line cook showing you their rig. Confident, plain, a little dry. **Not** announcer voice.
Key beats: land "**six more times**" (line 1) with weight; pause before "**Nothing happens.**" (line 6);
speak the URL slow and plain (line 12). Record it in one continuous take with ~1 s between lines, or as
`01`…`12` files in `recordings/`.

## What I do once files land
1. Convert/trim to 48 kHz mono, rebuild `capture/demo/demo-mic.wav` from your clips (`tools/build-mic.mjs`).
2. Re-run the live capture against the deployed site (`tools/capture-demo.mjs`) so AssemblyAI really hears you.
3. Rebuild the live segment, swap narration + captions, `npx hyperframes check`, render, verify frames + audio.
