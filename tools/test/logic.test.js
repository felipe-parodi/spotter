#!/usr/bin/env node
'use strict';
/* Headless logic tests: stub the browser APIs, eval the app, exercise the
   generator, progression, streaks, calories, HIIT catch-up, and views.
   Run from anywhere:  node tools/test/logic.test.js  */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..') + path.sep;

/* ---- browser stubs ---- */
const storage = {};
global.localStorage = {
  getItem: k => storage[k] || null,
  setItem: (k, v) => { storage[k] = v; },
  removeItem: k => { delete storage[k]; },
};
const fakeEl = () => ({
  style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  dataset: {}, setAttribute() {}, getAttribute() { return null; },
  addEventListener() {}, appendChild() {}, remove() {}, click() {}, focus() {},
  querySelector: () => fakeEl(), querySelectorAll: () => [],
  scrollIntoView() {}, setPointerCapture() {},
  clientWidth: 300, clientHeight: 300, innerHTML: '', textContent: '', value: '',
});
global.document = {
  querySelector: () => fakeEl(), querySelectorAll: () => [],
  addEventListener: () => {}, createElement: () => fakeEl(),
  documentElement: { removeAttribute() {}, setAttribute() {} },
  visibilityState: 'visible', body: { appendChild() {} },
};
global.window = { addEventListener: () => {}, scrollTo: () => {} };
Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });
global.confirm = () => true;
global.setInterval = () => {};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
global.Blob = class {};

storage['spotter-v1'] = JSON.stringify({
  profile: { name: 'T', level: 'experienced', goal: 'muscle', units: 'lb', sex: 'na', bodyweight: 150 },
  history: [], custom: [],
  bodyLog: [{ date: new Date(Date.now() - 10 * 864e5).toISOString(), w: 150 }],
});

const code = ['exercise-info.js', 'db.js', 'rehab.js', 'app.js']
  .map(f => fs.readFileSync(ROOT + f, 'utf8').replace(/^'use strict';/m, ''))
  .join('\n');
const tests = fs.readFileSync(path.join(__dirname, 'logic.assertions.js'), 'utf8');
eval(code + '\n' + tests);

/* Fresh-boot pass with a machine-named custom already in storage: the custom
   migration runs inside the very first loadState(), before later module-level
   bindings exist — if it ever throws there, the catch silently resets ALL
   state. Boot the app a second time in a clean scope and prove state survives. */
const vm = require('vm');
const bootStorage = {
  'spotter-v1': JSON.stringify({
    profile: { name: 'T', level: 'experienced', goal: 'muscle', units: 'lb', sex: 'na', bodyweight: 150 },
    custom: [{ id: 'c-x1', name: 'Tríceps extension', m: ['custom'], eq: [], custom: true, mode: 'reps', incr: 5 }],
    history: [{ date: new Date().toISOString(), groups: ['freestyle'], goal: 'muscle', minutes: 30, exercises: [{ id: 'c-x1', name: 'Tríceps extension', sets: [{ w: 40, r: 10 }] }] }],
  }),
};
const bootCheck = `__boot(S.profile && S.profile.name, S.history.length && S.history[0].exercises[0].id, S.custom.length);`;
const ctx = vm.createContext({
  console, Date, Math, JSON, setInterval: () => {},
  localStorage: { getItem: k => bootStorage[k] || null, setItem: (k, v) => { bootStorage[k] = v; }, removeItem: k => { delete bootStorage[k]; } },
  document: global.document, window: global.window, navigator: { onLine: true },
  confirm: () => true, URL: global.URL, Blob: global.Blob,
  __boot: (name, firstId, customs) => {
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else console.log('ok: ' + msg); };
    assert(name === 'T', 'fresh boot with customs keeps the profile (' + name + ')');
    assert(firstId === 'machine-triceps-press', 'fresh boot migrates history id at startup (' + firstId + ')');
    assert(customs === 0, 'fresh boot retires the migrated custom');
  },
});
vm.runInContext(code + '\n' + bootCheck, ctx);
