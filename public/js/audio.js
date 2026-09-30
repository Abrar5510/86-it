// Mic capture as PCM16 mono at 24 kHz, streamed to AssemblyAI as raw binary.
// Prefers a 24 kHz AudioContext (the browser resamples the mic: Chrome, Edge, Safari). Firefox refuses to
// connect a mic to a context at another rate, so it falls back to the native rate and the worklet resamples.
export const SAMPLE_RATE = 24000;

export async function startAudio({ onChunk, onLevel }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
  let src;
  try {
    src = ctx.createMediaStreamSource(stream);
  } catch {
    ctx.close();
    ctx = new AudioContext({ latencyHint: 'interactive' });
    src = ctx.createMediaStreamSource(stream);
  }
  await ctx.audioWorklet.addModule('/js/pcm-worklet.js');
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
