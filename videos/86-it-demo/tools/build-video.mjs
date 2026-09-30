import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const FF = '/opt/homebrew/bin/ffmpeg', FP = '/opt/homebrew/bin/ffprobe';
const RAW = 'capture/demo/raw', OUT = 'capture/demo/video', SEQ = path.join(OUT, 'seq');
const run = JSON.parse(fs.readFileSync(path.join(RAW, 'run.json'), 'utf8'));
const T0 = run.t0 / 1000;
const T_stop = run.events.find((e) => e.name === 'screencast-stop').t / 1000;
const FPS = 30, N = Math.round((T_stop - T0) * FPS);

for (const name of Object.keys(run.pages)) {
  const dir = path.join(RAW, name);
  const frames = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
  if (!frames.length) { console.log(name, 'NO FRAMES'); continue; }
  const seq = path.join(SEQ, name);
  fs.rmSync(seq, { recursive: true, force: true });
  fs.mkdirSync(seq, { recursive: true });
  // video time u -> rel time = u/FPS; source = last frame with t <= T0 + u/FPS
  let j = 0;
  for (let k = 0; k < N; k++) {
    const target = T0 + k / FPS;
    while (j + 1 < frames.length && frames[j + 1].t <= target) j++;
    if (frames[j].t > target) continue; // before first frame: skip (shouldn't happen; first ≈ T0-5.5)
    const u = String(k).padStart(6, '0');
    fs.linkSync(path.join(dir, frames[j].f), path.join(seq, u + '.jpg'));
  }
  const out = path.join(OUT, name + '.mp4');
  fs.rmSync(out, { force: true });
  execFileSync(FF, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(seq, '%06d.jpg'),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', out]);
  const dur = execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
  const count = fs.readdirSync(seq).length;
  console.log(name.padEnd(8), count, 'seq frames ->', dur + 's  (expect ' + (N / FPS).toFixed(2) + ')');
}
