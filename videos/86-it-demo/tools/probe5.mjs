import puppeteer from 'puppeteer-core';
const CHROME='/Users/abrar/.cache/puppeteer/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await puppeteer.launch({executablePath:CHROME, headless:true, protocolTimeout:20000,
  dumpio: true,
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--use-file-for-fake-audio-capture=/Users/abrar/projects/Assembly/videos/86-it-demo/capture/demo/demo-mic.wav%noloop',
        '--enable-logging=stderr','--v=1',
        '--autoplay-policy=no-user-gesture-required','--no-first-run','--disable-gpu']});
const p = await b.newPage();
await p.goto('https://example.com',{waitUntil:'domcontentloaded'});
await p.evaluate(async () => { const s = await navigator.mediaDevices.getUserMedia({audio:true}); await new Promise(r=>setTimeout(r,4000)); s.getTracks().forEach(t=>t.stop()); });
await b.close();
