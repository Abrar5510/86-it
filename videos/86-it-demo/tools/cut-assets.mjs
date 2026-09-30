// Cuts assets/demo-*.mp4 from capture/demo/video/{station,kds,foh,menu}.mp4 (all T0-relative, 30fps, 1600x900).
// Offsets: originals recovered by frame-matching the first capture, then shifted to this run's measured event times
// (alert banner is wall-clock driven, so it lands later than the mic timeline; its cut follows the banner).
// Usage: node tools/cut-assets.mjs [outDir=assets]
import { execFileSync } from 'node:child_process';
const FF = '/opt/homebrew/bin/ffmpeg';
const V = 'capture/demo/video/', OUT = process.argv[2] || 'assets';
const BG = '0x16181c';
const enc = ['-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30'];
const run = (args) => execFileSync(FF, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const cut = (name, ss, t, inputs, filter) => {
  const a = [];
  for (const i of inputs) a.push('-ss', String(ss), '-t', String(t), '-i', V + i + '.mp4');
  if (filter) a.push('-filter_complex', filter, '-map', '[o]');
  run([...a, ...enc, `${OUT}/demo-${name}.mp4`]);
  console.log('wrote', name);
};
// plain station cuts (1600x900)
cut('status-7', 9.1, 5.4333, ['station']);
cut('chatter', 78.5, 6.8333, ['station']);
cut('bargein', 96.6, 4.8, ['station']);
cut('alert', 124.7, 5.7667, ['station']);
// station + KDS side by side, vertically centred on the ink background
cut('fire-12', 34.5, 5.2, ['station', 'kds'],
  `[0]scale=960:540[a];[1]scale=960:540[b];[a][b]hstack,pad=1920:1080:0:270:color=${BG}[o]`);
// quad: station | KDS / FOH | menu
cut('86-salmon', 57.4, 8.8, ['station', 'kds', 'foh', 'menu'],
  '[0]scale=960:540[a];[1]scale=960:540[b];[2]scale=960:540[c];[3]scale=960:540[d];[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[o]');
// raw live segment: station scaled to 1080p
cut('live', 73.0, 51.0333, ['station'], '[0]scale=1920:1080[o]');
