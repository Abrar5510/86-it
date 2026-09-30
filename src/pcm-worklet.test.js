import test from 'node:test';
import assert from 'node:assert/strict';

// Loads the browser worklet with the AudioWorklet globals stubbed and feeds it `rate` Hz audio in 128-sample blocks.
async function capture(rate, seconds) {
  let Proc;
  Object.assign(globalThis, { sampleRate: rate, AudioWorkletProcessor: class { port = { postMessage: (m) => chunks.push(new Int16Array(m.pcm)) }; }, registerProcessor: (_, c) => { Proc = c; } });
  const chunks = [];
  await import(`../public/js/pcm-worklet.js?rate=${rate}`);
  const p = new Proc();
  const total = rate * seconds;
  for (let off = 0; off < total; off += 128) {
    const block = Float32Array.from({ length: 128 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * (off + i)) / rate));
    p.process([[block]]);
  }
  return chunks;
}

for (const rate of [24000, 44100, 48000]) {
  test(`worklet emits 24 kHz, 960-sample chunks from ${rate} Hz input`, async () => {
    const chunks = await capture(rate, 1);
    assert.ok(chunks.every((c) => c.length === 960));
    assert.ok(Math.abs(chunks.length - 25) <= 1, `${chunks.length} chunks for 1 s`); // 24000 / 960
    // A 440 Hz tone survives resampling: sample 40 (≈ 1/600 s in) matches the analytic value at 24 kHz.
    const expected = Math.round(0.5 * Math.sin((2 * Math.PI * 440 * 40) / 24000) * 0x7fff);
    assert.ok(Math.abs(chunks[0][40] - expected) < 300, `${chunks[0][40]} vs ${expected}`);
  });
}
