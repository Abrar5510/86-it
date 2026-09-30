// Build eval clips: raw PCM16 mono 24 kHz, clean + noisy.
//   npm run eval:clips              -> synthesize with macOS `say` (quick smoke set)
// For pitch-grade numbers, record yourself instead: put <id>.wav files in eval/recorded/ and rerun;
// recorded files take priority over synthesized speech.
// Noise: drop a real kitchen recording at eval/noise.wav, otherwise synthetic pink noise is used.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./', import.meta.url));
const out = `${dir}audio/`;
const commands = JSON.parse(readFileSync(`${dir}commands.json`, 'utf8'));
const SNR_DB = Number(process.env.NOISE_DB ?? -12); // noise level relative to speech (dB)
const hasNoise = existsSync(`${dir}noise.wav`);
mkdirSync(out, { recursive: true });

const ff = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const PCM = ['-ac', '1', '-ar', '24000', '-f', 's16le'];

for (const c of commands) {
  const recorded = `${dir}recorded/${c.id}.wav`;
  let src = recorded;
  if (!existsSync(recorded)) {
    src = `${out}${c.id}.aiff`;
    execFileSync('say', ['-o', src, c.text]);
  }
  // 300 ms lead-in so the start of speech is not clipped.
  ff('-i', src, '-af', 'adelay=300', ...PCM, `${out}${c.id}.pcm`);
  const noise = hasNoise
    ? ['-stream_loop', '-1', '-i', `${dir}noise.wav`]
    : ['-f', 'lavfi', '-i', 'anoisesrc=color=pink:sample_rate=24000:amplitude=0.5'];
  ff('-i', src, ...noise, '-filter_complex',
    `[0:a]adelay=300,apad=pad_dur=0.5[s];[1:a]volume=${SNR_DB}dB[n];[s][n]amix=inputs=2:duration=first:normalize=0`,
    ...PCM, `${out}${c.id}.noisy.pcm`);
  if (src.endsWith('.aiff')) rmSync(src);
  process.stdout.write('.');
}
console.log(`\n✓ ${commands.length} clips (${hasNoise ? 'kitchen noise' : 'pink noise'} at ${SNR_DB} dB) in eval/audio/`);
