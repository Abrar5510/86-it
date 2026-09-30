import puppeteer from 'puppeteer-core';
const CHROME='/Users/abrar/.cache/puppeteer/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await puppeteer.launch({executablePath:CHROME, headless:true, protocolTimeout:15000,
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=/Users/abrar/projects/Assembly/videos/86-it-demo/capture/demo/demo-mic.wav%noloop','--autoplay-policy=no-user-gesture-required','--no-first-run','--disable-gpu']});
const p = await b.newPage();
p.on('console', m => console.log('console:', m.text().slice(0,120)));
p.on('pageerror', e => console.log('pageerror:', String(e).slice(0,200)));
await p.setViewport({width:1600,height:900});
await p.goto('https://86-it.rd5510.workers.dev/station',{waitUntil:'domcontentloaded',timeout:20000});
console.log('title:', await p.title());
console.log('phase:', await p.$eval('#phase', e=>e.textContent).catch(e=>'ERR '+e.message));
console.log('seed exists:', await p.$('#seed').then(h=>!!h).catch(e=>'ERR '+e.message));
try { await p.click('#reset'); console.log('clicked reset'); } catch(e){ console.log('click ERR:', e.message.slice(0,150)); }
await new Promise(r=>setTimeout(r,3000));
console.log('after reset phase:', await p.$eval('#phase', e=>e.textContent).catch(e=>'ERR'));
await b.close();
