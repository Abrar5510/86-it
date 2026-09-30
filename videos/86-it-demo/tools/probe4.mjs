import puppeteer from 'puppeteer-core';
const CHROME='/Users/abrar/.cache/puppeteer/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const variants = [
  ['no-flag', []],
  ['mono48-noloop', ['--use-file-for-fake-audio-capture=/Users/abrar/projects/Assembly/videos/86-it-demo/capture/demo/demo-mic.wav%noloop']],
  ['stereo48-loop', ['--use-file-for-fake-audio-capture=/tmp/86wav/demo-mic-48k-stereo.wav']],
  ['mono48-loop', ['--use-file-for-fake-audio-capture=/Users/abrar/projects/Assembly/videos/86-it-demo/capture/demo/demo-mic.wav']],
];
for (const [name, extra] of variants) {
  const b = await puppeteer.launch({executablePath:CHROME, headless:true, protocolTimeout:20000,
    args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
          '--autoplay-policy=no-user-gesture-required','--no-first-run','--disable-gpu',
    '--no-sandbox', ...extra]});
  const p = await b.newPage();
  await p.goto('https://example.com',{waitUntil:'domcontentloaded'});
  const r = await p.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      const ctx = new AudioContext();
      const an = ctx.createAnalyser(); ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize); let mx=0;
      for (let i=0;i<24;i++){ await new Promise(r=>setTimeout(r,500));
        an.getFloatTimeDomainData(buf); for (const v of buf) mx=Math.max(mx,Math.abs(v)); }
      return {max:+mx.toFixed(4)};
    } catch(e){ return {err:String(e)}; }
  });
  console.log(name, JSON.stringify(r));
  await b.close();
}
