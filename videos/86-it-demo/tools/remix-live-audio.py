# Swap the cook's voice inside the 51s live-segment mix (assets/sfx/raw-segment-09.wav).
# The original mix = highpassed cook mic + kitchen babble/sizzle/clatter. We subtract the old cook (least-squares
# gain, aligned by cross-correlation), add the new cook at matching loudness, and limit. Ambience is untouched.
# usage: python3 tools/remix-live-audio.py <old-mix.wav> <old-mic.wav> <new-mic.wav> <out.wav>
import subprocess, sys, numpy as np
old_mix, old_mic, new_mic, out = sys.argv[1:5]
SR = 48000
def load(path, ac, af=''):
    cmd = ['ffmpeg', '-loglevel', 'error', '-i', path] + (['-af', af] if af else []) + ['-f', 'f32le', '-ac', str(ac), '-ar', str(SR), '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32).copy()
mix = load(old_mix, 2).reshape(-1, 2); n = len(mix)
om = load(old_mic, 1, 'highpass=f=90'); nm = load(new_mic, 1, 'highpass=f=90')
# align old mic to the mix
L = 1 << int(np.ceil(np.log2(len(om) + n)))
cc = np.fft.irfft(np.fft.rfft(om, L) * np.conj(np.fft.rfft(mix.mean(1), L)), L)
lo, hi = 60 * SR, 90 * SR
off = int(np.argmax(cc[lo:hi])) + lo
print('segment starts at', off / SR, 's')
o = om[off:off + n]; w = nm[off:off + n]
act = np.abs(o) > 0.02                      # samples where the old cook is speaking
g = np.dot(o[act], mix.mean(1)[act]) / np.dot(o[act], o[act])
print('old cook gain in mix', round(float(g), 3))
res = mix - (g * o)[:, None]
# loudness-match new to old over their own active samples
ra = np.sqrt((o[act] ** 2).mean()); wa = np.abs(w) > 0.02; rb = np.sqrt((w[wa] ** 2).mean())
scale = g * ra / rb
print('new cook scale', round(float(scale), 3), '(old active rms', round(float(ra), 4), 'new', round(float(rb), 4), ')')
new = res + (scale * w)[:, None]
raw = out + '.f32'
new.astype(np.float32).tofile(raw)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', raw,
                '-af', 'alimiter=limit=0.89:level=disabled', '-c:a', 'pcm_s16le', out], check=True)
import os; os.remove(raw)
print('wrote', out, 'peak', round(float(np.abs(new).max()), 3))
