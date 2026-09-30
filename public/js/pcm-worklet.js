// Mic -> PCM16 chunks of 40 ms (960 samples at 24 kHz), plus an RMS level for the meter.
// Normally the AudioContext already runs at 24 kHz (Chrome, Edge, Safari). Firefox can't feed a mic into a
// context at another rate, so there the context runs at the mic's native rate and this resamples.
// ponytail: linear interpolation, no low-pass; fine for speech STT, add a filter if aliasing ever shows up.
const OUT_RATE = 24000;
const CHUNK = 960;

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(CHUNK);
    this.n = 0;
    this.sq = 0;
    this.step = sampleRate / OUT_RATE; // input samples per output sample
    this.t = 0; // next output position in current-block coords; -1 = last sample of the previous block
    this.prev = 0;
  }

  push(s) {
    s = Math.max(-1, Math.min(1, s));
    this.sq += s * s;
    this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    if (this.n === CHUNK) {
      const out = this.buf;
      this.port.postMessage({ pcm: out.buffer, level: Math.sqrt(this.sq / CHUNK) }, [out.buffer]);
      this.buf = new Int16Array(CHUNK);
      this.n = 0;
      this.sq = 0;
    }
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    if (this.step === 1) {
      for (let i = 0; i < input.length; i++) this.push(input[i]);
      return true;
    }
    while (this.t < input.length - 1) {
      const i = Math.floor(this.t);
      const a = i < 0 ? this.prev : input[i];
      this.push(a + (input[i + 1] - a) * (this.t - i));
      this.t += this.step;
    }
    this.t -= input.length;
    this.prev = input[input.length - 1];
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
