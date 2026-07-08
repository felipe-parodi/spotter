#!/usr/bin/env node
'use strict';
/* Performance profile: load timing, SW precache cost, render + input latency
   with a seeded 150-session history. Numbers are desktop-CPU; phones ~5x.
   Setup: python3 -m http.server 8642 (repo root), npm i playwright.
   Run:   node tools/test/perf.test.js  */
const { chromium } = require('playwright');
const { chromiumPath, BASE } = require('./browser');

function seedState(nSessions) {
  const groups = [['legs', 'glutes'], ['chest', 'back', 'shoulders'], ['full'], ['arms', 'core']];
  const exPool = [
    ['bb-squat', 'Barbell Back Squat'], ['db-bench', 'Dumbbell Bench Press'], ['bb-row', 'Barbell Bent-Over Row'],
    ['goblet-squat', 'Goblet Squat'], ['db-rdl', 'Dumbbell Romanian Deadlift'], ['lat-pulldown', 'Lat Pulldown'],
    ['db-ohp', 'Seated Dumbbell Shoulder Press'], ['db-curl', 'Dumbbell Curl'], ['pushdown', 'Cable Pushdown'],
    ['hip-thrust', 'Dumbbell Hip Thrust'], ['plank', 'Plank'], ['cable-row', 'Seated Cable Row'],
  ];
  const history = [];
  for (let i = 0; i < nSessions; i++) {
    const date = new Date(Date.now() - i * 2 * 864e5).toISOString();
    const exercises = [];
    for (let j = 0; j < 6; j++) {
      const [id, name] = exPool[(i + j) % exPool.length];
      exercises.push({
        id, name, mode: id === 'plank' ? 'time' : 'reps', targetReps: [8, 12],
        sets: Array.from({ length: 4 }, (_, k) => ({ w: id === 'plank' ? null : 50 + (i % 20), r: 10 + (k % 3) })),
      });
    }
    const entry = { date, groups: groups[i % groups.length], goal: 'muscle', minutes: 55, exercises };
    entry.volume = exercises.reduce((v, e) => v + e.sets.reduce((x, s) => x + (s.w || 0) * (s.r || 0), 0), 0);
    entry.setCount = 24; entry.prs = [];
    history.push(entry);
  }
  return {
    profile: { name: 'Ada', level: 'experienced', goal: 'muscle', units: 'lb', sex: 'na', bodyweight: 150, bodyfat: null },
    settings: {}, custom: [], active: null, draft: null, sel: { groups: ['full'], minutes: 45 },
    bodyLog: Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.now() - i * 3 * 864e5).toISOString(), w: 150 - i * 0.1 })),
    history,
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: chromiumPath() });

  // ---- 1. cold load (no SW yet) ----
  let ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  console.log('cold load →', Date.now() - t0, 'ms');

  // ---- 2. SW precache cost: wait for SW active, count cached entries + bytes ----
  const swInfo = await page.evaluate(async () => {
    const t = performance.now();
    const reg = await navigator.serviceWorker.ready;
    // wait for install to finish populating caches (poll)
    for (let i = 0; i < 600; i++) {
      const keys = await caches.keys();
      let total = 0;
      for (const k of keys) total += (await (await caches.open(k)).keys()).length;
      if (total >= 200) return { ms: Math.round(performance.now() - t), entries: total, caches: keys };
      await new Promise(r => setTimeout(r, 100));
    }
    const keys = await caches.keys();
    let total = 0;
    for (const k of keys) total += (await (await caches.open(k)).keys()).length;
    return { ms: 'timeout', entries: total, caches: keys };
  });
  console.log('SW full precache →', JSON.stringify(swInfo));
  await page.waitForTimeout(2000); // let the controllerchange reload settle
  await page.waitForSelector('#app');

  // ---- 3. simulated UPDATE: bump version → how many bytes re-fetched? ----
  // count network requests on reload after clearing only versioned cache (simulate what activate does)
  // Instead measure directly: how many entries live in version-named caches (deleted on update)?
  const churn = await page.evaluate(async () => {
    const keys = await caches.keys();
    const out = {};
    for (const k of keys) {
      const c = await caches.open(k);
      const reqs = await c.keys();
      let bytes = 0;
      for (const r of reqs) { const res = await c.match(r); const b = await res.blob(); bytes += b.size; }
      out[k] = { entries: reqs.length, kb: Math.round(bytes / 1024) };
    }
    return out;
  });
  console.log('cache contents →', JSON.stringify(churn));
  await ctx.close();

  // ---- 4. render + input latency with 150-session history ----
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.evaluate(s => localStorage.setItem('spotter-v1', JSON.stringify(s)), seedState(150));
  await page.reload();
  await page.waitForSelector('[data-a="generate"]');

  const timings = await page.evaluate(() => {
    const out = {};
    out.stateKB = Math.round(localStorage.getItem('spotter-v1').length / 1024);
    const time = (label, fn, n = 20) => {
      const t = performance.now();
      for (let i = 0; i < n; i++) fn();
      out[label] = +((performance.now() - t) / n).toFixed(2);
    };
    time('render Today', () => { route = 'today'; render(); });
    time('render Log (150 sessions)', () => { route = 'history'; render(); });
    time('render Trends', () => { route = 'trends'; render(); });
    time('save() [JSON.stringify+setItem]', () => save(), 50);
    time('sessionKcal x150', () => S.history.forEach(w => sessionKcal(w)), 5);
    time('dayStreak', () => dayStreak(), 50);
    route = 'today'; render();
    return out;
  });
  console.log('timings(ms) →', JSON.stringify(timings, null, 1));

  // ---- 5. chip tap latency (full render path today) ----
  const tap = await page.evaluate(() => {
    const btn = document.querySelector('[data-a="chip"][data-g="legs"]');
    const t = performance.now();
    btn.click();
    return +(performance.now() - t).toFixed(2);
  });
  console.log('chip tap (click→handler done) →', tap, 'ms');

  // ---- 6. weight-input keystroke latency during workout ----
  await page.evaluate(() => {
    S.draft = generateWorkout(['full'], 45);
    startWorkout();
  });
  await page.waitForSelector('.set-row input[data-f="w"]');
  const key = await page.evaluate(() => {
    const input = document.querySelector('.set-row input[data-f="w"]');
    input.value = '55';
    const t = performance.now();
    for (let i = 0; i < 20; i++) input.dispatchEvent(new Event('input', { bubbles: true }));
    return +((performance.now() - t) / 20).toFixed(2);
  });
  console.log('weight keystroke handler →', key, 'ms');

  await ctx.close();
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
