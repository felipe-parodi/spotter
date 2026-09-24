'use strict';
// Start: python3 -m tests.preview_activity EXPORT.json (health repo).
// Run with SPOTTER_TEST_BACKUP=EXPORT.json and NODE_PATH containing Playwright.
const {chromium}=require('playwright');
const fs=require('fs');
const assert=require('assert/strict');
const backup=JSON.parse(fs.readFileSync(process.env.SPOTTER_TEST_BACKUP,'utf8'));
const api='http://127.0.0.1:8873',app='http://127.0.0.1:8842';
async function post(path,payload){const r=await fetch(api+path,{method:'POST',headers:{Origin:api,'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(r.status,200);return r.json();}
async function overview(){return (await fetch(api+'/api/overview')).json();}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome'});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(data=>{if(!localStorage.getItem('spotter-v1'))localStorage.setItem('spotter-v1',JSON.stringify(data));},backup);
 let offline=false,dropAck=false,deliveredRevision;
 await context.route('https://pipepc.tail1c3fb6.ts.net:8448/**',async route=>{
  if(offline)return route.abort();
  const req=route.request();
  const response=await route.fetch({url:api+new URL(req.url()).pathname,headers:{...req.headers(),Origin:'https://felipe-parodi.github.io'}});
  if(dropAck&&new URL(req.url()).pathname==='/api/spotter'&&req.method()==='POST'){
   dropAck=false;deliveredRevision=(await response.json()).revision;return route.abort();
  }
  await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':app}});
 });
 const pair=await post('/api/pair',{});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(app+'/'+new URL(pair.url).hash);
 await page.waitForFunction(()=>!!JSON.parse(localStorage.getItem('spotter-health-sync-v1')||'{}').saved,{timeout:20000});
 assert.equal((await overview()).sessions.filter(s=>s.members.some(m=>m.source==='spotter')).length,backup.history.length);
 const ids=await page.evaluate(()=>S.history.map(w=>w.id));assert.equal(new Set(ids).size,backup.history.length);
 await page.evaluate(()=>{S.notes.test='browser sync';saveNow();go('profile');});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('spotter-health-sync-v1')).ack.includes('browser sync'));
 offline=true;await context.setOffline(true);
 await page.evaluate(()=>{S.notes.test='offline edit';saveNow();});
 await page.waitForTimeout(3500);
 assert.equal(await page.evaluate(()=>S.notes.test),'offline edit');
 offline=false;await context.setOffline(false);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('spotter-health-sync-v1')).ack.includes('offline edit'),{timeout:20000});
 dropAck=true;
 await page.evaluate(()=>{S.notes.test='lost response';saveNow();});
 await page.waitForTimeout(4000);
 assert.ok(deliveredRevision);
 assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('spotter-health-sync-v1')).pending));
 await page.locator('[data-health-sync="sync"]').click();
 await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('spotter-health-sync-v1')).pending);
 assert.equal((await overview()).spotter.revision,deliveredRevision,'lost ACK does not duplicate a revision');
 // Future session boundaries and set completion times survive finish.
 await page.evaluate(()=>{S.draft={groups:['full'],minutes:10,ex:[snapshot(findEx('goblet-squat'),{sets:1,reps:[5,5],rest:60})]};startWorkout();S.active.startedAt=Date.now()-60000;setDone(0,0);finishWorkout(true);});
 const w=await page.evaluate(()=>S.history[0]);assert.ok(w.id&&w.startedAt&&w.endedAt);assert.equal(w.timingQuality,'recorded');assert.ok(w.exercises[0].sets[0].completedAt);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('spotter-health-sync-v1')).ack.includes('"recorded"'));
 await page.evaluate(()=>go('profile'));
 await page.screenshot({path:'/tmp/spotter-private-sync.png',fullPage:true});
 const archive=await context.newPage();await archive.goto(api);await archive.locator('.session').first().waitFor();
 await archive.screenshot({path:'/tmp/health-training-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: pairing, export migration, automatic edits, offline queue, lost-response retry, exact future timestamps');
 await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
