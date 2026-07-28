#!/usr/bin/env node
'use strict';
/* Browser end-to-end test for Rebuild (rehab mode). Drives the real app
   through the red-flag gate, the intake wizard, a full Rebuild session,
   the during-pain prompt, the morning check, the progression it produces,
   and niggle logging in a normal session.

   Setup:  python3 -m http.server 8642   (from repo root)
           npm i playwright   (plus a Chromium; see browser.js)
   Run:    node tools/test/rehab.test.js  */
const { chromium } = require('playwright');
const { chromiumPath, BASE } = require('./browser');

const ok = (cond, msg) => { console.log((cond ? 'ok: ' : 'FAIL: ') + msg); if (!cond) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => ok(false, 'page error: ' + e.message));

  await page.goto(BASE + '/');
  await page.fill('#ob-name', 'Ada');
  await page.click('[data-a="ob-start"]');
  await page.waitForSelector('[data-a="generate"]');

  /* ---------- the red-flag gate blocks ---------- */

  await page.click('[data-a="nav"][data-r="profile"]');
  await page.click('[data-a="rehab-start"]');
  await page.waitForSelector('[data-a="wiz-region"]');
  await page.click('[data-a="wiz-region"][data-v="back"]');
  await page.click('[data-a="wiz-next"]');           // → red flags (back has no side step)
  await page.waitForSelector('.rb-flag');
  const flagCount = await page.locator('.rb-flag').count();
  ok(flagCount >= 10, 'back shows universal + cauda equina flags (' + flagCount + ')');
  const flagText = await page.locator('.rb-flags').textContent();
  ok(/saddle/i.test(flagText), 'the saddle-numbness question is asked');

  await page.click('.rb-flag >> nth=-1');            // claim a cauda equina symptom
  await page.waitForSelector('.rb-stop');
  const stop = await page.textContent('.rb-stop');
  ok(/emergency department/i.test(stop), 'a back red flag routes to same-day care');
  ok(await page.locator('[data-a="wiz-flags-none"]').count() === 0, 'and the program is not offered');
  await page.click('.rb-flag >> nth=-1');            // un-claim it
  ok(await page.locator('[data-a="wiz-flags-none"]').count() === 1, 'clearing the flag restores the path');
  await page.click('[data-a="wiz-back"]');           // back to the region step
  await page.click('[data-a="wiz-cancel"]');

  /* ---------- the shoulder stiffness self-test routes out ---------- */

  await page.click('[data-a="nav"][data-r="profile"]');
  await page.click('[data-a="rehab-start"]');
  await page.click('[data-a="wiz-region"][data-v="shoulder"]');
  await page.click('[data-a="wiz-next"]');
  await page.click('[data-a="wiz-side"][data-v="right"]');
  await page.click('[data-a="wiz-next"]');
  await page.click('[data-a="wiz-flags-none"]');
  await page.waitForSelector('[data-a="wiz-selftest"]');
  const test = await page.textContent('.rb-body');
  ok(/broomstick/i.test(test), 'the passive external rotation self-test comes first for shoulders');
  await page.click('[data-a="wiz-selftest"][data-v="blocked"]');
  await page.waitForSelector('.rb-stop');
  ok(/stiffness pattern/i.test(await page.textContent('.rb-stop')), 'a blocked shoulder is routed out of loading');
  await page.click('[data-a="wiz-cancel"]');

  /* ---------- full intake for a knee ---------- */

  await page.click('[data-a="nav"][data-r="profile"]');
  await page.click('[data-a="rehab-start"]');
  await page.click('[data-a="wiz-region"][data-v="knee"]');
  await page.click('[data-a="wiz-next"]');
  await page.click('[data-a="wiz-side"][data-v="left"]');
  await page.click('[data-a="wiz-next"]');
  await page.click('[data-a="wiz-flags-none"]');
  await page.waitForSelector('[data-a="wiz-opt"]');
  await page.click('[data-a="wiz-opt"][data-v="diffuse"]');
  await page.click('[data-a="wiz-next"]');
  await page.click('[data-a="wiz-opt"][data-v="stairs"]');
  await page.click('[data-a="wiz-opt"][data-v="sitting"]');   // multi-select
  ok(await page.locator('[data-a="wiz-opt"].on').count() === 2, 'multi-select keeps both answers');
  await page.click('[data-a="wiz-next"]');
  await page.click('[data-a="wiz-opt"][data-v="fine"]');
  await page.click('[data-a="wiz-next"]');

  await page.waitForSelector('[data-a="wiz-scale"]');
  ok(await page.locator('[data-a="wiz-next"][disabled]').count() === 1, 'baseline is required before continuing');
  await page.click('[data-a="wiz-scale"][data-k="worst"][data-v="6"]');
  await page.click('[data-a="wiz-scale"][data-k="typical"][data-v="4"]');
  await page.fill('[data-f="psfs-task"][data-i="0"]', 'going down stairs');
  await page.click('[data-a="wiz-psfs"][data-i="0"][data-v="3"]');
  ok(await page.locator('[data-a="wiz-next"][disabled]').count() === 0, 'and enabled once it is filled in');
  await page.click('[data-a="wiz-next"]');

  await page.waitForSelector('[data-a="wiz-finish"]');
  const plan = await page.textContent('.rb-plan');
  ok(/stairs and sitting/i.test(plan), 'answers routed to the stairs-and-sitting pattern');
  ok(/12 weeks/.test(plan), 'the plan states twelve weeks up front');
  ok(/3× a week/.test(plan), 'and the frequency');
  await page.click('[data-a="wiz-finish"]');

  /* ---------- the hub ---------- */

  await page.waitForSelector('.rb-rail');
  ok(await page.locator('.rb-phase').count() === 4, 'the knee track shows four phases');
  ok(await page.locator('.rb-phase.now span').textContent() === '1', 'starting in phase 1');
  const chains = await page.textContent('.rb-chains');
  ok(chains.length > 10, 'the hub lists where you are on each chain');
  const edu = await page.locator('.howto summary').allTextContents();
  ok(edu.some(t => /twelve weeks/i.test(t)), 'the expectation-setting card is on the hub');

  /* ---------- Today shows the block ---------- */

  await page.click('[data-a="nav"][data-r="today"]');
  await page.waitForSelector('.rb-card');
  ok(/Left knee/.test(await page.textContent('.rb-card')), 'Today shows the active block');
  ok(/0\/3 sessions/.test(await page.textContent('.rb-card')), 'and this week’s session count');

  /* ---------- run a session ---------- */

  await page.click('[data-a="rehab-build"]');
  await page.waitForSelector('.ex-row');
  const preview = await page.textContent('.screen');
  ok(/Week 1 · Settle/.test(preview), 'the preview shows week and phase');
  ok(await page.locator('[data-a="regen"]').count() === 0, 'no Reshuffle on a Rebuild plan');

  await page.click('[data-a="start"]');
  await page.waitForSelector('.ex-card');
  ok(await page.locator('[data-a="open-picker"]').count() === 0, 'no Add-exercise on a Rebuild session');
  ok(await page.locator('.icon-btn.niggle').count() > 0, 'the niggle button is present');

  const checks = page.locator('[data-a="set-done"]');
  const nSets = await checks.count();
  for (let i = 0; i < nSets; i++) await checks.nth(i).click();
  ok(nSets > 0, 'logged ' + nSets + ' Rebuild sets');

  await page.click('[data-a="finish"]');
  await page.waitForSelector('[data-a="rehab-pain"]');
  ok(/5 is fine/i.test(await page.textContent('.sheet')), 'the pain prompt says up to 5 is fine');
  await page.click('[data-a="rehab-pain"][data-v="3"]');
  await page.waitForSelector('.summary, [data-a="skip-cooldown"], .screen');
  const sess = await page.evaluate(() => S.rehab.tracks[0].sessions.length);
  ok(sess === 1, 'the session is recorded on the track');
  const pain = await page.evaluate(() => S.rehab.tracks[0].sessions[0].duringPain);
  ok(pain === 3, 'with the pain score attached');

  /* ---------- the morning check, and the progression it drives ---------- */

  // pretend the session was yesterday so the check comes due
  await page.evaluate(() => {
    const t = S.rehab.tracks[0];
    t.sessions[0].date = new Date(Date.now() - 20 * 3600e3).toISOString();
    saveNow(); go('today');
  });
  await page.waitForSelector('.rb-check');
  ok(/How’s the left knee today/.test(await page.textContent('.rb-check')), 'the morning check asks about the right area');
  await page.click('[data-a="rehab-check"][data-v="better"]');
  await page.waitForSelector('[data-a="rehab-am"]');
  await page.click('[data-a="rehab-am"][data-v="2"]');
  await page.waitForSelector('.rb-card');
  const cls = await page.evaluate(() => S.rehab.tracks[0].sessions[0].cls);
  ok(cls === 'green', 'a better morning classifies the session green');

  const verdict1 = await page.evaluate(() => pendingVerdict(S.rehab.tracks[0]).kind);
  ok(verdict1 === 'hold', 'one green holds — it takes two');

  // second green
  await page.evaluate(() => {
    const t = S.rehab.tracks[0];
    const plan = buildRehabSession(t);
    t.sessions.push({ date: new Date(Date.now() - 20 * 3600e3).toISOString(), phase: t.phase,
      exIds: plan.ex.map(e => e.id), duringPain: 2, cls: null });
    saveNow(); go('today');
  });
  await page.waitForSelector('[data-a="rehab-check"]');
  await page.click('[data-a="rehab-check"][data-v="same"]');
  await page.click('[data-a="rehab-am"][data-v="2"]');
  await page.waitForSelector('.rb-card');
  const verdict2 = await page.evaluate(() => pendingVerdict(S.rehab.tracks[0]).kind);
  ok(verdict2 === 'up', 'two greens in a row earn a step up');

  const before = await page.evaluate(() => {
    const t = S.rehab.tracks[0];
    return JSON.stringify(t.dose);
  });
  await page.click('[data-a="rehab-build"]');
  await page.waitForSelector('.ex-row');
  ok(/stepping it up/i.test(await page.textContent('.rb-verdict')), 'and the plan says so');
  const after = await page.evaluate(() => JSON.stringify(S.rehab.tracks[0].dose));
  ok(before !== after, 'the dose actually changed');

  /* ---------- niggles in a normal session ---------- */

  await page.evaluate(() => { S.draft = null; go('today'); });
  await page.click('[data-a="chip"][data-g="chest"]');
  await page.click('[data-a="generate"]');
  await page.click('[data-a="start"]');
  await page.waitForSelector('.icon-btn.niggle');
  await page.click('.icon-btn.niggle');
  await page.waitForSelector('[data-a="niggle-region"]');
  await page.click('[data-a="niggle-region"][data-v="shoulder"]');
  await page.click('[data-a="niggle-side"][data-v="right"]');
  const nig = await page.evaluate(() => S.rehab.niggles.length);
  ok(nig === 1, 'a niggle is logged from a normal session');
  const nigRegion = await page.evaluate(() => S.rehab.niggles[0].region);
  ok(nigRegion === 'shoulder', 'with the region recorded');
  await page.evaluate(() => { S.active = null; saveNow(); go('today'); });

  /* ---------- one block at a time ---------- */

  await page.click('[data-a="nav"][data-r="profile"]');
  ok(await page.locator('[data-a="rehab-start"]').count() === 0, 'no second block while one is active');
  ok(/One block at a time/.test(await page.textContent('.screen')), 'and it says why');

  /* ---------- pause / resume ---------- */

  await page.click('[data-a="nav"][data-r="rehab"]');
  await page.click('[data-a="rehab-pause"]');
  await page.waitForSelector('[data-a="generate"]');
  ok(await page.locator('.rb-card').count() === 0, 'pausing clears the Today card');
  await page.click('[data-a="nav"][data-r="profile"]');
  ok(await page.locator('[data-a="rehab-start"]').count() === 1, 'and frees you to start another');
  await page.click('[data-a="rehab-resume"]');
  const status = await page.evaluate(() => S.rehab.tracks[0].status);
  ok(status === 'active', 'resume brings it back');

  /* ---------- rehab exercises stay out of normal plans ---------- */

  const leaked = await page.evaluate(() => {
    let bad = [];
    for (let i = 0; i < 30; i++) {
      generateWorkout(['full'], 60).ex.forEach(e => {
        const d = findEx(e.id);
        if (d && d.rehab) bad.push(e.id);
      });
    }
    return bad;
  });
  ok(!leaked.length, 'rehab-only exercises never leak into normal plans' + (leaked.length ? ' — ' + leaked.join(',') : ''));

  /* ---------- state survives a reload ---------- */

  await page.reload();
  await page.waitForSelector('.rb-card');
  ok(/Left knee/.test(await page.textContent('.rb-card')), 'the block survives a reload');

  console.log(process.exitCode ? '--- REHAB E2E FAILURES ---' : '--- REHAB E2E ALL PASSED ---');
  await browser.close();
})();
