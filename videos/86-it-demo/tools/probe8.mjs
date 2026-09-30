import puppeteer from 'puppeteer-core';
const CHROME='/Users/abrar/.cache/puppeteer/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await puppeteer.launch({executablePath:CHROME, headless:true, protocolTimeout:30000,
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--no-sandbox','--disable-gpu',
        '--use-file-for-fake-audio-capture=/tmp/status-only.wav%noloop',
        '--autoplay-policy=no-user-gesture-required','--no-first-run']});
const p = await b.newPage();
p.on('pageerror', e=>console.log('[pageerror]',String(e).slice(0,200)));
await p.setViewport({width:1600,height:900});
await p.goto('https://86-it.rd5510.workers.dev/station',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,3000));
await p.evaluate(()=>document.querySelector('#orb').click());
for (let i=0;i<15;i++){
  await new Promise(r=>setTimeout(r,2000));
  const phase = await p.$eval('#phase',e=>e.textContent).catch(()=>'?');
  const said  = await p.$eval('#said',e=>e.textContent).catch(()=>'');
  console.log(`t+${(i+1)*2}s phase=${phase} said="${said}"`);
}
const log = await p.$$eval('#log li', ls=>ls.map(li=>li.textContent).slice(0,8));
console.log('LOG:', JSON.stringify(log,null,1));
await b.close();
