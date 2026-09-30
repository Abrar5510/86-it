// Builds capture/demo/demo-mic.wav — scripted "cook" phrases on silence, 48k mono s16.
// Order matters: status FIRST (fresh session context; the STT biases later turns toward
// recently spoken menu words — "86 salmon" made a later "7" transcribe as "salmon").
// Barge-in (stop): must start AFTER VAD closes the all-day turn (~speech_end+1.9s) and
// AFTER the agent reply starts (~close+2s ≈ t94.8), BEFORE it ends (t≈95.7-97.0). Live
// measured: turn close ≈+1.9s, reply start ≈+2s after close, reply length ≈1.1-1.5s.
// Any gap <2s between user phrases merges them into one turn ("All day fries? Wait, stop.")
// and kills the barge-in. stop t=95.0 was measured mid-reply with ~0.7s worst-case overlap.
// t is seconds after mic-open (capture T0).
import { execFileSync } from 'node:child_process';
const FF = '/opt/homebrew/bin/ffmpeg', FP = '/opt/homebrew/bin/ffprobe';
const dur = (f) => parseFloat(execFileSync(FP, ['-v','error','-show_entries','format=duration','-of','csv=p=0',f]).toString());
const PHRASES = [
  { t: 4.0,   f: '/tmp/86wav/p3.wav',           name: 'status-7' },
  { t: 34,    f: '/tmp/86wav/p1.wav',           name: 'fire-12' },
  { t: 55,    f: '/tmp/86wav/p2.wav',           name: '86-salmon' },
  { t: 75,    f: '/tmp/86wav/p4.wav',           name: 'chatter' },
  { t: 90,    f: '/tmp/86wav/p8-allday.wav',    name: 'all-day' },
  { t: 95.0,  f: '/tmp/86wav/p6.wav',           name: 'stop' },
  { t: 110,   f: '/tmp/86wav/p9.wav',           name: 'fire-table-4' },
];
const TOTAL = 135;
const args = [];
const parts = [];
let idx = 0, cursor = 0, n = 0;
const silence = (t) => { if (t > 0.001) { args.push('-t', String(t), '-f','lavfi','-i','anullsrc=r=48000:cl=mono'); parts.push(`[${idx++}]`); n++; } };
for (const p of PHRASES) {
  const d = dur(p.f);
  silence(p.t - cursor);
  args.push('-i', p.f);
  parts.push(`[${idx++}]`);
  n++;
  cursor = p.t + d;
  console.log(`${p.name.padEnd(11)} @ ${p.t}s (${d.toFixed(2)}s)`);
}
silence(TOTAL - cursor);
args.push('-filter_complex', `${parts.join('')}concat=n=${n}:v=0:a=1[a]`, '-map','[a]', '-ar','48000','-ac','1','-c:a','pcm_s16le', 'capture/demo/demo-mic.wav');
execFileSync(FF, ['-y','-loglevel','error', ...args]);
console.log('wrote capture/demo/demo-mic.wav', dur('capture/demo/demo-mic.wav') + 's');
