import puppeteer from 'puppeteer-core';
const CHROME='/Users/abrar/.cache/puppeteer/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const WAV='/Users/abrar/projects/Assembly/videos/86-it-demo/capture/demo/demo-mic.wav';
const b = await puppeteer.launch({executablePath:CHROME, headless:true, protocolTimeout:20000,
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${WAV}%noloop`,'--autoplay-policy=no-user-gesture-required',
        '--no-first-run','--disable-gpu']});
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,300)));
await p.goto('https://example.com',{waitUntil:'domcontentloaded'});
const r = await p.evaluate(async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const peaks = [];
    for (let i=0;i<30;i++){
      await new Promise(r=>setTimeout(r,500));
      an.getFloatTimeDomainData(buf);
      let m=0; for (const v of buf) m=Math.max(m,Math.abs(v));
      peaks.push(+m.toFixed(4));
    }
    return {ok:true, peaks};
  } catch(e){ return {ok:false, err:String(e)}; }
});
console.log(JSON.stringify(r));
await b.close();
