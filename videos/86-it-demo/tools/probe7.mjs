import puppeteer from 'puppeteer-core';
const CHROME='/Users/abrar/.cache/puppeteer/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await puppeteer.launch({executablePath:CHROME, headless:true, protocolTimeout:20000,
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--no-sandbox','--disable-gpu',
        '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
        '--autoplay-policy=no-user-gesture-required','--no-first-run']});
const counts = {station:0,kds:0,foh:0};
const sessions = [];
for (const [name, route] of Object.entries({station:'/station',kds:'/kds',foh:'/foh'})) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({width:1600,height:900});
  await p.goto('https://86-it.rd5510.workers.dev'+route,{waitUntil:'domcontentloaded'});
  const c = await p.createCDPSession(); await c.send('Page.enable');
  c.on('Page.screencastFrame', async f => { counts[name]++; await c.send('Page.screencastFrameAck',{sessionId:f.sessionId}); });
  sessions.push({p,c,name});
}
await new Promise(r=>setTimeout(r,2500));
for (const s of sessions) await s.c.send('Page.startScreencast',{format:'jpeg',quality:80,maxWidth:1600,maxHeight:900});
await sessions[0].p.evaluate(()=>document.querySelector('#seed').click());
await new Promise(r=>setTimeout(r,8000));
console.log(JSON.stringify(counts));
await b.close();
