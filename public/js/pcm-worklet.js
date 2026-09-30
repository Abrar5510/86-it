// Mic -> PCM16 chunks of 40 ms (960 samples at 24 kHz), plus an RMS level for the meter.
const CHUNK = 960;

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(CHUNK);
    this.n = 0;
    this.sq = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
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
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
