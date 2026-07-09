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
  style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
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

const code = ['exercise-info.js', 'db.js', 'app.js']
  .map(f => fs.readFileSync(ROOT + f, 'utf8').replace(/^'use strict';/m, ''))
  .join('\n');
const tests = fs.readFileSync(path.join(__dirname, 'logic.assertions.js'), 'utf8');
eval(code + '\n' + tests);
