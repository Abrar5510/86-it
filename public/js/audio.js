// Mic capture as PCM16 mono at 24 kHz, streamed to AssemblyAI as raw binary.
// ponytail: relies on the browser resampling the mic into a 24 kHz AudioContext (Chrome, Edge, Safari).
export const SAMPLE_RATE = 24000;

export async function startAudio({ onChunk, onLevel }) {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
  await ctx.audioWorklet.addModule('/js/pcm-worklet.js');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm-capture');
  node.port.onmessage = ({ data }) => {
    onLevel?.(data.level);
    onChunk(data.pcm);
  };
  src.connect(node); // not connected to destination: no local monitoring

  return {
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    },
  };
}
