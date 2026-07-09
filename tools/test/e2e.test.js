#!/usr/bin/env node
'use strict';
/* Browser end-to-end test. Drives the real app through onboarding, plan
   generation, lightbox, a full session, cool-down, summary, review, repeat,
   HIIT, and discard.

   Setup:  python3 -m http.server 8642   (from repo root)
           npm i playwright   (plus a Chromium; see browser.js)
   Run:    node tools/test/e2e.test.js  */
const { chromium } = require('playwright');
const { chromiumPath, BASE } = require('./browser');

const ok = (cond, msg) => { console.log((cond ? 'ok: ' : 'FAIL: ') + msg); if (!cond) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => ok(false, 'page error: ' + e.message));

  await page.goto(BASE + '/');
  // --- onboarding ---
  await page.fill('#ob-name', 'Ada');
  await page.click('#ob-level [data-v="experienced"]');
  await page.click('#ob-units [data-v="kg"]');
  ok((await page.getAttribute('#ob-bw', 'placeholder')).includes('68'), 'bodyweight placeholder follows units');
  await page.click('#ob-units [data-v="lb"]');
  await page.fill('#ob-bw', '150');
  await page.click('[data-a="ob-start"]');
  ok(await page.locator('h1').first().textContent().then(t => t.includes('Ada')), 'onboarded to Today');

  // --- build legs+cardio plan ---
  await page.click('[data-a="chip"][data-g="full"]');
  await page.click('[data-a="chip"][data-g="legs"]');
  await page.click('[data-a="chip"][data-g="cardio"]');
  await page.click('[data-a="generate"]');
  await page.waitForSelector('.ex-row');
  const rows = await page.locator('.ex-row').count();
  ok(rows >= 4, 'preview has ' + rows + ' exercises');
  const lastRow = await page.locator('.ex-row').last().textContent();
  ok(/min/.test(lastRow) && !/1 ×/.test(lastRow), 'cardio block in minutes without "1 ×": ' + lastRow.trim().slice(0, 50).replace(/\s+/g, ' '));

  // --- lightbox ---
  await page.click('.thumb[data-zoom]');
  await page.waitForSelector('#lightbox.show .lb-img');
  ok(/webp/.test(await page.getAttribute('#lightbox .lb-img', 'src')), 'lightbox serves WebP');
  await page.click('[data-lb="next"]');
  ok((await page.textContent('#lightbox .lb-cap')).includes('2/'), 'lightbox pages frames');
  await page.keyboard.press('Escape');
  ok(await page.locator('#lightbox.show').count() === 0, 'Esc closes lightbox');

  // --- workout: log everything ---
  await page.click('[data-a="start"]');
  await page.waitForSelector('.ex-card');
  ok(await page.locator('.exnote').count() > 0, 'note field on exercise cards');
  const checks = page.locator('[data-a="set-done"]');
  const n = await checks.count();
  for (let i = 0; i < n; i++) await checks.nth(i).click();
  ok(true, 'logged ' + n + ' sets');

  // --- finish → cooldown → summary ---
  await page.click('[data-a="finish"]');
  await page.waitForSelector('[data-a="cooldown-done"]');
  await page.click('[data-a="stretch-timer"]');
  await page.waitForSelector('#restbar.show');
  ok((await page.textContent('#restbar .rest-label')) !== 'Rest', 'stretch name on rest bar');
  await page.click('[data-a="rest-skip"]');
  await page.click('.row-btns .btn-primary');
  await page.waitForSelector('.stats-row');
  ok(/kcal/i.test(await page.textContent('.stats-row')), 'summary shows calorie stat');
  await page.click('[data-a="nav"][data-r="today"]');

  // --- trends: weekly volume card ---
  await page.click('.tab[data-r="trends"]');
  await page.waitForSelector('.wv-row');
  ok(await page.locator('.wv-row').count() >= 1, 'weekly volume bars render');
  ok(/This week/.test(await page.textContent('#app')), 'weekly volume card present');

  // --- history: review + repeat ---
  await page.click('.tab[data-r="history"]');
  await page.click('.hist');
  await page.waitForSelector('[data-a="hist-review"]');
  await page.click('[data-a="hist-review"]');
  await page.waitForSelector('.ex-card');
  ok(await page.locator('.ex-card .demo img').count() > 0, 'review cards include images');
  await page.click('.btn-primary[data-a="hist-repeat"]');
  await page.waitForSelector('.hint');
  ok(/Repeat of/.test(await page.textContent('.hint')), 'repeat builds a preview draft');
  await page.click('[data-a="nav"][data-r="today"]');

  // --- HIIT runner ---
  await page.click('[data-a="hiit-menu"]');
  await page.click('[data-a="hiit-start"][data-id="tabata"]');
  await page.waitForSelector('.hiit-time');
  ok(/All-out/i.test(await page.textContent('.hiit-label')), 'HIIT runner shows first interval');
  ok(/left in block/.test(await page.textContent('#hiit-total')), 'HIIT shows total remaining');
  await page.click('[data-a="hiit-skip"]');
  ok(/Rest/i.test(await page.textContent('.hiit-label')), 'HIIT skip advances');
  page.once('dialog', d => d.accept());
  await page.click('[data-a="hiit-end"]');
  await page.waitForSelector('.workout-screen');
  ok(/Tabata/.test(await page.textContent('.workout-screen')), 'HIIT block logged into session');

  // --- discard ---
  page.once('dialog', d => d.accept());
  await page.click('[data-a="discard"]');
  await page.waitForSelector('[data-a="generate"]');
  ok(await page.locator('.resume').count() === 0, 'discard clears the session');

  await browser.close();
  console.log(process.exitCode ? '--- E2E FAILURES ---' : '--- E2E ALL PASSED ---');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
