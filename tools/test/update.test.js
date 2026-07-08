#!/usr/bin/env node
'use strict';
/* Service-worker update test: install → close tab → bump VERSION on disk →
   reopen → accept the update toast. Verifies the persistent image cache
   survives (no photo re-downloads) and old shell caches are cleaned up.

   NOTE: temporarily edits sw.js on disk (restored on exit, even on failure).
   Setup:  python3 -m http.server 8642   (from repo root)
   Run:    node tools/test/update.test.js  */
const { chromium } = require('playwright');
const { chromiumPath, BASE } = require('./browser');
const fs = require('fs');
const path = require('path');

const SW = path.join(__dirname, '..', '..', 'sw.js');
const orig = fs.readFileSync(SW, 'utf8');
const ver = orig.match(/const VERSION = '(v[^']+)';/)[1];
const restore = () => fs.writeFileSync(SW, orig);

const ok = (cond, msg) => { console.log((cond ? 'ok: ' : 'FAIL: ') + msg); if (!cond) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const ctx = await browser.newContext();
  let page = await ctx.newPage();
  await page.goto(BASE + '/');
  const nImgs = await page.evaluate(async () => {
    for (let i = 0; i < 600; i++) {
      const c = await caches.open('spotter-img-v1');
      const n = (await c.keys()).length;
      if (n >= 200) return n;
      await new Promise(r => setTimeout(r, 100));
    }
    return 0;
  });
  ok(nImgs >= 200, 'initial install cached ' + nImgs + ' photos');
  await page.close();

  fs.writeFileSync(SW, orig.replace(`'${ver}'`, `'${ver}-test'`));

  page = await ctx.newPage();
  const reqs = [];
  page.on('request', r => reqs.push(new URL(r.url()).pathname));
  await page.goto(BASE + '/');
  await page.waitForSelector('#toast.show .toast-btn', { timeout: 30000 });
  await page.click('#toast.show .toast-btn'); // accept the update → reload
  await page.waitForLoadState('load');
  await page.waitForTimeout(5000);
  const dump = await page.evaluate(async () => {
    const out = {};
    for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
    return out;
  });
  ok(dump['spotter-img-v1'] >= nImgs, 'image cache survived the update (' + dump['spotter-img-v1'] + ')');
  ok(dump['spotter-shell-' + ver + '-test'] === 11, 'new shell cache populated');
  ok(!dump['spotter-shell-' + ver], 'old shell cache removed');
  ok(reqs.filter(p => p.includes('/img/')).length === 0, 'no photo re-downloads during update');

  await browser.close();
  console.log(process.exitCode ? '--- UPDATE FAILURES ---' : '--- UPDATE FLOW PASSED ---');
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; }).finally(restore);
