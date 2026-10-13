/**
 * Headless checks for the SalaryDance pay/time math.
 *
 * The widget only exposes the React component, so the pure helpers are re-derived
 * here by evaluating the bundle with a stubbed module loader and then probing the
 * rendered tree. Instead of a DOM, this harness re-implements nothing: it loads
 * `client.js`, materializes the factory with a minimal React stub, and calls the
 * exported component function to inspect the props it computes.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/* ------------------------------------------------------------------ *
 * Minimal React stub: enough for createElement + hooks.
 * ------------------------------------------------------------------ */

const states = [];
let cursor = 0;

function createElement(type, props, ...children) {
  return { type, props: props === null || props === undefined ? {} : props, children };
}

const React = {
  createElement,
  useState(init) {
    const index = cursor++;
    if (states[index] === undefined) states[index] = typeof init === 'function' ? init() : init;
    return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
  },
  useEffect() { cursor++; },
  useRef(init) { cursor++; return { current: init }; }
};

/* ------------------------------------------------------------------ *
 * Load the bundle under a fake browser shell.
 * ------------------------------------------------------------------ */

let registered = null;
globalThis.window = {
  __ModuleLoader__: { load(entry) { registered = entry; } },
  localStorage: {
    _v: new Map(),
    getItem(k) { return this._v.has(k) ? this._v.get(k) : null; },
    setItem(k, v) { this._v.set(k, v); }
  },
  setInterval: () => 0,
  clearInterval: () => {},
  innerWidth: 1440,
  innerHeight: 900
};

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
// eslint-disable-next-line no-new-func
new Function('window', 'require', source)(globalThis.window, (name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});

const mod = registered.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});

/* ------------------------------------------------------------------ *
 * Probe helper: render the widget at a fixed instant and return the
 * numbers the card would display.
 * ------------------------------------------------------------------ */

function probe(momentIso, configPatch, probeText) {
  // Pin "now" by freezing Date for the duration of one render.
  const RealDate = Date;
  const frozen = new RealDate(momentIso);
  class FakeDate extends RealDate {
    constructor(...args) { super(...(args.length === 0 ? [frozen.getTime()] : args)); }
    static now() { return frozen.getTime(); }
  }
  globalThis.Date = FakeDate;

  if (configPatch) {
    const merged = Object.assign(
      {
        salaryMode: 'monthly',
        monthlySalary: 8000,
        dailySalary: 400,
        hourlySalary: 50,
        workDaysPerMonth: 21.75,
        workDays: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '18:00',
        lunchEnabled: true,
        lunchStart: '12:00',
        lunchEnd: '13:00',
        theme: 'light',
        alwaysOnTop: true,
        miniFloat: false,
        autoLaunch: false
      },
      configPatch
    );
    globalThis.window.localStorage.setItem('dsh-plugin-salary-dance/config.v1', JSON.stringify(merged));
  } else {
    globalThis.window.localStorage._v.clear();
  }

  cursor = 0;
  states.length = 0;
  const t = (key) => key;
  const tree = mod.SalaryDanceWidget({ t });

  globalThis.Date = RealDate;
  return { tree, text: probeText ? JSON.stringify(tree) : null };
}

/** Walk the element tree and collect every string/number leaf, keys and all. */
function leaves(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach((child) => leaves(child, out)); return out; }
  if (typeof node === 'object' && node.children) {
    leaves(node.children, out);
    if (node.props) {
      for (const [key, value] of Object.entries(node.props)) {
        if (key === 'children' || typeof value === 'function') continue;
        if (key === 'aria-valuenow') out.push('aria-valuenow=' + value);
      }
    }
  }
  return out;
}

/** Find the aria-valuenow of the progress bar. */
function progressOf(tree) {
  let found = null;
  (function walk(node) {
    if (node === null || node === undefined || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.props && node.props['aria-valuenow'] !== undefined) found = node.props['aria-valuenow'];
    if (node.children) walk(node.children);
  })(tree);
  return found;
}

/** Whether any rendered leaf contains `needle`, ignoring how the text is split. */
function hasText(tree, needle) {
  return leaves(tree).join('\u0001').includes(needle);
}

/* ------------------------------------------------------------------ *
 * Cases
 * ------------------------------------------------------------------ */

let failures = 0;
function check(name, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  -> ' + actual + (ok ? '' : '  (expected ' + expected + ')'));
}

// 2026-10-14 is a Wednesday. Default config: 09:00-18:00, lunch 12:00-13:00.
const midMorning = probe('2026-10-14T10:30:00', null);
check('10:30 served = 1h30m', leaves(midMorning.tree).includes('1 h 30 m'), 'true');
check('10:30 progress ~19%', progressOf(midMorning.tree), 19);

const midAfternoon = probe('2026-10-14T15:00:00', null);
// 09:00-15:00 = 6h minus the 1h lunch = 5h served of 8h.
check('15:00 served = 5 h 0 m', leaves(midAfternoon.tree).includes('5 h 0 m'), 'true');
check('15:00 remaining = 3 h 0 m', leaves(midAfternoon.tree).includes('3 h 0 m'), 'true');
check('15:00 progress = 63%', progressOf(midAfternoon.tree), 63);

const duringLunch = probe('2026-10-14T12:30:00', null);
check('12:30 counts no lunch progress (3h served)', leaves(duringLunch.tree).includes('3 h 0 m'), 'true');

const afterHours = probe('2026-10-14T19:30:00', null);
check('19:30 remaining = 0 h 0 m', leaves(afterHours.tree).includes('0 h 0 m'), 'true');
check('19:30 progress = 100%', progressOf(afterHours.tree), 100);

const beforeHours = probe('2026-10-14T07:10:00', null);
check('07:10 progress = 0%', progressOf(beforeHours.tree), 0);

const weekend = probe('2026-10-17T11:00:00', null); // Saturday
check('Saturday shows day-off status', leaves(weekend.tree).includes('status.off'), 'true');

// Monthly 8000 over October 2026 (22 configured work days) => 363.64/day.
const monthly = probe('2026-10-14T18:00:00', { salaryMode: 'monthly', monthlySalary: 8000 });
check('monthly 8000 daily = 363.64', hasText(monthly.tree, '¥363.64'), 'true');

// Daily mode is exactly the daily rate.
const daily = probe('2026-10-14T18:00:00', { salaryMode: 'daily', dailySalary: 500 });
check('daily 500 projected = 500.00', hasText(daily.tree, '¥500.00'), 'true');

// Hourly 60 over an 8h shift => 480/day.
const hourly = probe('2026-10-14T18:00:00', { salaryMode: 'hourly', hourlySalary: 60 });
check('hourly 60 x 8h projected = 480.00', hasText(hourly.tree, '¥480.00'), 'true');

// Overnight shift 22:00 -> 06:00, no lunch, at 02:00 => 4h of 8h.
const overnight = probe('2026-10-14T02:00:00', {
  startTime: '22:00', endTime: '06:00', lunchEnabled: false, salaryMode: 'daily', dailySalary: 480
});
check('overnight 02:00 served = 4 h 0 m', leaves(overnight.tree).includes('4 h 0 m'), 'true');
check('overnight 02:00 progress = 50%', progressOf(overnight.tree), 50);

// Lunch disabled: 09:00-15:00 is a full 6h served.
const noLunch = probe('2026-10-14T15:00:00', { lunchEnabled: false });
check('no-lunch 15:00 served = 6 h 0 m', leaves(noLunch.tree).includes('6 h 0 m'), 'true');

// Off-day projection adds nothing before the shift.
const offDayMorning = probe('2026-10-17T07:00:00', { salaryMode: 'daily', dailySalary: 500 });
check('Saturday 07:00 projected = 0.00', hasText(offDayMorning.tree, '¥0.00'), 'true');

console.log(failures === 0 ? '\nAll math checks passed.' : '\n' + failures + ' check(s) failed.');
process.exit(failures === 0 ? 0 : 1);
