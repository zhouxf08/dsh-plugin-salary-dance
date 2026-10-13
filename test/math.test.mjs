/**
 * Headless checks for the SalaryDance pay/time math.
 *
 * `client.js` is a browser bundle, so this harness gives it the two globals it
 * touches — a module loader and a minimal React — then drives the exported
 * component and the pure helpers. No DOM is emulated: the assertions read the
 * values the card would render and the helpers' own return values.
 *
 * The expected working-day counts are derived by hand from the State Council
 * notices transcribed in `client.js`; a mismatch means the calendar table or
 * the counting rule regressed.
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

// Effects are recorded with their dependency array and flushed after each
// render, so a test can drive animation frames the way a browser does.
const effects = [];

function depsChanged(previous, next) {
  if (previous === undefined) return true;
  if (next === undefined || next === null) return true;
  if (next.length !== previous.length) return true;
  return next.some((value, index) => !Object.is(value, previous[index]));
}

const React = {
  createElement,
  useState(init) {
    const index = cursor++;
    if (states[index] === undefined) states[index] = typeof init === 'function' ? init() : init;
    return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
  },
  useEffect(callback, deps) {
    const index = cursor++;
    effects[index] = { callback, deps: deps || null, cleanup: effects[index] ? effects[index].cleanup : undefined, seen: effects[index] ? effects[index].seen : false };
  },
  useRef(init) {
    const index = cursor++;
    if (refs[index] === undefined) refs[index] = { current: init };
    return refs[index];
  }
};

// Hook slots persist across renders, like React's own store. A `useRef` that
// handed back a fresh object each render would reset the widget's frame handle
// and its own next-frame request would cancel itself.
const refs = [];

/** Run every pending effect whose dependencies changed, after a render. */
function flushEffects() {
  effects.forEach((entry, index) => {
    if (!entry) return;
    if (entry.seen && !depsChanged(entry.deps || undefined, entry.deps || undefined)) return;
    if (entry.seen && entry.deps !== null && !depsChanged(effects[index]._prevDeps, entry.deps)) return;
    if (entry.seen && entry.cleanup) entry.cleanup();
    effects[index] = Object.assign({}, entry, { seen: true, _prevDeps: entry.deps, cleanup: entry.callback() });
  });
}

/* ------------------------------------------------------------------ *
 * Load the bundle under a fake browser shell.
 * ------------------------------------------------------------------ */

let registered = null;
/** Frames queued by the widget, so the ticker can be driven deterministically. */
let rafQueue = [];
/** The tree from the most recent render. */
let lastTree = null;
/** Timers the widget registered, so the heartbeat can be driven by the clock. */
const intervals = new Map();
let intervalSeq = 0;
globalThis.window = {
  __ModuleLoader__: { load(entry) { registered = entry; } },
  localStorage: {
    _v: new Map(),
    getItem(k) { return this._v.has(k) ? this._v.get(k) : null; },
    setItem(k, v) { this._v.set(k, v); }
  },
  setInterval: (cb, ms) => { intervals.set(++intervalSeq, { cb, ms }); return intervalSeq; },
  clearInterval: (id) => { intervals.delete(id); },
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
  cancelAnimationFrame: () => {},
  matchMedia: () => ({ matches: false }),
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
const api = mod.__internal;

/* ------------------------------------------------------------------ *
 * Harness helpers
 * ------------------------------------------------------------------ */

let failures = 0;
function check(name, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  -> ' + actual + (ok ? '' : '  (expected ' + expected + ')'));
}

function baseConfig(patch) {
  return Object.assign({}, api.DEFAULT_CONFIG, patch || {});
}

/** Render the widget at a pinned instant and return the element tree. */
function render(momentIso, configPatch, initialState) {
  const RealDate = Date;
  const frozen = new RealDate(momentIso);
  class FakeDate extends RealDate {
    constructor(...args) { super(...(args.length === 0 ? [frozen.getTime()] : args)); }
    static now() { return frozen.getTime(); }
  }
  globalThis.Date = FakeDate;

  if (configPatch) {
    globalThis.window.localStorage.setItem(
      'dsh-plugin-salary-dance/config.v1',
      JSON.stringify(baseConfig(configPatch))
    );
  } else {
    globalThis.window.localStorage._v.clear();
  }

  cursor = 0;
  states.length = 0;
  effects.length = 0;
  refs.length = 0;
  // The component's hook order is fixed: [config, open, step, now, liquid, pos].
  // Seeding a slot skips that useState initializer, which is how the settings
  // panel (open) is reached without a DOM.
  if (initialState) initialState.forEach((value, index) => { if (value !== undefined) states[index] = value; });
  const tree = mod.SalaryDanceWidget({ t: localeAwareT });
  lastTree = tree;
  flushEffects();
  globalThis.Date = RealDate;
  return tree;
}

/** A `t` that resolves against the Chinese dictionary and flags missing keys. */
function localeAwareT(key) {
  const zh = api.DICTIONARIES.zh;
  return Object.prototype.hasOwnProperty.call(zh, key) ? zh[key] : 'MISSING:' + key;
}

/**
 * Drive the ticker the way a browser would: render, run the queued animation
 * frames while the clock advances, and return the amount shown on each frame.
 *
 * This is the check the old implementation failed. It interpolated with the
 * last rendered value as its base and the frame budget as its ratio, so the
 * figure converged to well under the true amount and a bigger true delta made
 * the rendered figure move *less*.
 */
function driveTicker(startIso, seconds, patch) {
  const config = baseConfig(patch);
  globalThis.window.localStorage.setItem('dsh-plugin-salary-dance/config.v1', JSON.stringify(config));

  const start = new Date(startIso).getTime();
  let clock = start;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) { super(...(args.length === 0 ? [clock] : args)); }
    static now() { return clock; }
  }
  globalThis.Date = FakeDate;

  cursor = 0;
  states.length = 0;
  effects.length = 0;
  refs.length = 0;

  // Render without clearing the hook slots afterwards, so state, refs and
  // effects survive across frames the way they do in a real tree.
  function renderOnce() {
    cursor = 0;
    rafQueue = [];
    lastTree = mod.SalaryDanceWidget({ t: localeAwareT });
    flushEffects();
  }

  intervals.clear();
  const samples = [];
  renderOnce();
  const steps = seconds * 60;
  for (let step = 0; step < steps; step += 1) {
    clock += 1000 / 60;
    // Fire the heartbeat when its period has elapsed, then the queued frames.
    // Both settle state, so the tree is rendered again before it is read.
    if ((step + 1) % 60 === 0) intervals.forEach((timer) => timer.cb());
    const queue = rafQueue;
    rafQueue = [];
    queue.forEach((cb) => cb(clock));
    renderOnce();
    const text = amountTextOf(lastTree);
    const shown = amountOf(lastTree);
    if (shown !== null) samples.push({ clock, shown, text });
  }

  globalThis.Date = RealDate;
  return samples;
}

/** The amount line as rendered text, e.g. "¥301.4938". */
function amountTextOf(tree) {
  let text = '';
  let found = false;
  (function walk(node, inside) {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') {
      if (inside) text += String(node);
      return;
    }
    if (Array.isArray(node)) { node.forEach((child) => walk(child, inside)); return; }
    if (typeof node === 'object') {
      const isAmount = node.props !== undefined && node.props.className === 'pd-amount';
      if (isAmount) found = true;
      if (node.children) walk(node.children, inside || isAmount);
    }
  })(tree, false);
  return found ? text : null;
}

/** The number rendered inside the card's amount block. */
function amountOf(tree) {
  let text = '';
  let found = false;
  (function walk(node, inside) {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') {
      if (inside) text += String(node);
      return;
    }
    if (Array.isArray(node)) { node.forEach((child) => walk(child, inside)); return; }
    if (typeof node === 'object') {
      const isAmount = node.props !== undefined && node.props.className === 'pd-amount';
      if (isAmount) found = true;
      if (node.children) walk(node.children, inside || isAmount);
    }
  })(tree, false);
  if (!found) return null;
  const value = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : null;
}

/**
 * The true amount at a pinned instant, read through the widget's own helper.
 * Using the exported helper keeps the harness from drifting from the card; the
 * "never leads" assertion below is still meaningful because the card only ever
 * *renders* a value, while this reads the function directly.
 */
function trueEarned(iso, patch) {
  return api.earnedAt(baseConfig(patch), new Date(iso));
}

/** Render with the settings panel already open. */
function renderPanel(momentIso, configPatch) {
  return render(momentIso, configPatch, [undefined, true]);
}

/** Every string/number leaf in the tree. */
function leaves(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach((child) => leaves(child, out)); return out; }
  if (typeof node === 'object' && node.children) {
    leaves(node.children, out);
    if (node.props && node.props['aria-valuenow'] !== undefined) out.push('aria-valuenow=' + node.props['aria-valuenow']);
  }
  return out;
}

/** Whether any rendered leaf contains `needle`, however the text is split. */
function hasText(tree, needle) {
  return leaves(tree).join('\u0001').includes(needle);
}

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

/* ------------------------------------------------------------------ *
 * 1. Working days against the State Council notices
 *    https://www.gov.cn/zhengce/zhengceku/202411/content_6986383.htm  (2025)
 *    https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm  (2026)
 * ------------------------------------------------------------------ */

console.log('\n--- 法定工作日 ---');
const WEEKDAYS = [1, 2, 3, 4, 5];

// Each number was walked day by day against the notice: the configured
// weekdays, minus the holiday block, plus the makeup Saturdays.
const EXPECTED_2025 = [19, 19, 21, 22, 19, 20, 23, 21, 23, 18, 20, 23];
const EXPECTED_2026 = [21, 16, 22, 21, 19, 21, 23, 21, 22, 18, 21, 23];

EXPECTED_2025.forEach((expected, monthIndex) => {
  const result = api.monthWorkdays(2025, monthIndex, WEEKDAYS);
  check('2025-' + String(monthIndex + 1).padStart(2, '0') + ' 工作日', result.count, expected);
});
EXPECTED_2026.forEach((expected, monthIndex) => {
  const result = api.monthWorkdays(2026, monthIndex, WEEKDAYS);
  check('2026-' + String(monthIndex + 1).padStart(2, '0') + ' 工作日', result.count, expected);
});

console.log('\n--- 日历覆盖与节假日名 ---');
check('2025 有日历', api.monthWorkdays(2025, 0, WEEKDAYS).covered, 'true');
check('2026 有日历', api.monthWorkdays(2026, 9, WEEKDAYS).covered, 'true');
check('2027 无日历', api.monthWorkdays(2027, 0, WEEKDAYS).covered, 'false');
check('2026-02 含春节', api.monthWorkdays(2026, 1, WEEKDAYS).holidays.includes('春节'), 'true');
check('2025-10 含国庆节', api.monthWorkdays(2025, 9, WEEKDAYS).holidays.includes('国庆节'), 'true');
check(
  '2027 退回周一至周五',
  api.monthWorkdays(2027, 0, WEEKDAYS).count,
  (() => {
    let n = 0;
    for (let day = 1; day <= 31; day += 1) {
      const wd = new Date(2027, 0, day).getDay();
      if (WEEKDAYS.includes(wd === 0 ? 7 : wd)) n += 1;
    }
    return n;
  })()
);

// The 2026 makeup Saturdays must count as working days, even though they are
// weekends the configured work week would otherwise skip.
console.log('\n--- 调休上班日 ---');
[[2026, 0, 4], [2026, 1, 14], [2026, 1, 28], [2026, 4, 9], [2026, 8, 20], [2026, 9, 10]]
  .forEach(([year, monthIndex, day]) => {
    const key = year + '-' + String(monthIndex + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const date = new Date(year, monthIndex, day);
    check(key + ' 是周末', date.getDay() === 0 || date.getDay() === 6, 'true');
    check(key + ' 计入工作日', api.MAKEUP_WORKDAYS[key] === 1, 'true');
  });

/* ------------------------------------------------------------------ *
 * 2. Hourly rate: monthly / actual workdays / paid hours
 * ------------------------------------------------------------------ */

console.log('\n--- 时薪 ---');
const HOURS = 8;

function rate(iso, patch) {
  const date = new Date(iso);
  const config = baseConfig(patch);
  const actual = api.monthWorkdays(date.getFullYear(), date.getMonth(), config.workDays);
  return api.computePay(config, date, actual, HOURS);
}

// October 2026 has 18 working days: 17 weekdays, National Day takes 7 (two of
// them weekend), and 10-10 is a makeup Saturday. 8000 / 18 / 8.
const oct = rate('2026-10-14T12:00:00', { monthlySalary: 8000 });
check('2026-10 工作日', oct.workdays, 18);
check('2026-10 日薪', oct.daily.toFixed(2), '444.44');
check('2026-10 时薪 4 位小数', oct.hourly.toFixed(4), '55.5556');

// February 2026 has 16 working days after Spring Festival: 8000 / 16 / 8.
const feb = rate('2026-02-10T12:00:00', { monthlySalary: 8000 });
check('2026-02 工作日', feb.workdays, 16);
check('2026-02 日薪', feb.daily.toFixed(2), '500.00');
check('2026-02 时薪 4 位小数', feb.hourly.toFixed(4), '62.5000');

// March 2026 is an untouched month: 22 working days.
const mar = rate('2026-03-10T12:00:00', { monthlySalary: 8000 });
check('2026-03 工作日', mar.workdays, 22);
check('2026-03 时薪 4 位小数', mar.hourly.toFixed(4), '45.4545');

// The hourly rate must move with the shift length, not only with the month.
const shortShift = api.computePay(
  baseConfig({ monthlySalary: 8000 }),
  new Date('2026-10-14T12:00:00'),
  api.monthWorkdays(2026, 9, WEEKDAYS),
  6
);
check('6 小时班的时薪', shortShift.hourly.toFixed(4), '74.0741');
check('时薪随工时变化', shortShift.hourly > oct.hourly, 'true');

// A manual override wins over the calendar.
const manual = rate('2026-10-14T12:00:00', { monthlySalary: 8000, manualWorkdays: 20 });
check('手填 20 天的工作日', manual.workdays, 20);
check('手填 20 天的时薪', manual.hourly.toFixed(4), '50.0000');
check('手填时不标未覆盖', manual.covered, 'false');

// Hourly mode derives the day from the rate rather than taking a fixed number.
const hourly = rate('2026-10-14T12:00:00', { salaryMode: 'hourly', monthlySalary: 8000 });
check('时薪模式日薪 = 时薪 x 工时', hourly.daily.toFixed(4), (hourly.hourly * HOURS).toFixed(4));

/* ------------------------------------------------------------------ *
 * 3. Shift solving: lunch, overnight, boundaries
 * ------------------------------------------------------------------ */

console.log('\n--- 班次与进度 ---');
function shiftAt(iso, patch) {
  const config = baseConfig(patch);
  return api.solveShift(config, new Date(iso));
}

check('09:00-18:00 有效工时 = 8h', shiftAt('2026-10-14T10:00:00').hoursPerDay, 8);
check('每日有效工时 = 8 小时', shiftAt('2026-10-14T10:00:00').workSpanMin, 480);
check('10:30 已工作 90 分钟', Math.round(shiftAt('2026-10-14T10:30:00').servedMin), 90);
check('15:00 已工作 300 分钟', Math.round(shiftAt('2026-10-14T15:00:00').servedMin), 300);
check('15:00 剩余 180 分钟', Math.round(shiftAt('2026-10-14T15:00:00').remainingMin), 180);
check('12:30 午休中仍为 180 分钟', Math.round(shiftAt('2026-10-14T12:30:00').servedMin), 180);
check('班前为 0', Math.round(shiftAt('2026-10-14T07:10:00').servedMin), 0);
check('班后为满', Math.round(shiftAt('2026-10-14T19:30:00').servedMin), 480);
check('取消午休后 15:00 = 360', Math.round(shiftAt('2026-10-14T15:00:00', { lunchEnabled: false }).servedMin), 360);
check('跨夜 02:00 已工作 240', Math.round(shiftAt('2026-10-14T02:00:00', { startTime: '22:00', endTime: '06:00', lunchEnabled: false }).servedMin), 240);
check('跨夜 23:00 已工作 60', Math.round(shiftAt('2026-10-14T23:00:00', { startTime: '22:00', endTime: '06:00', lunchEnabled: false }).servedMin), 60);

/* ------------------------------------------------------------------ *
 * 4. Rendered card
 * ------------------------------------------------------------------ */

console.log('\n--- 卡片渲染 ---');
const midMorning = render('2026-10-14T10:30:00', null);
check('10:30 显示 1 h 30 m', leaves(midMorning).includes('1 h 30 m'), 'true');
check('10:30 进度 19%', progressOf(midMorning), 19);

const afterHours = render('2026-10-14T19:30:00', { monthlySalary: 8000 });
check('19:30 进度 100%', progressOf(afterHours), 100);
check('2026-10 日薪入卡 ¥444.44', hasText(afterHours, '¥444.44'), 'true');
check('2026-10 时薪入卡 ¥55.5556', hasText(afterHours, '¥55.5556'), 'true');

const beforeHours = render('2026-10-14T07:10:00', { salaryMode: 'daily', dailySalary: 500 });
check('班前今日预计 ¥500.00', hasText(beforeHours, '¥500.00'), 'true');

const saturday = render('2026-10-17T11:00:00', null);
check('周六显示今日休息', leaves(saturday).includes('今日休息'), 'true');

const saturdayMorning = render('2026-10-17T07:00:00', { salaryMode: 'daily', dailySalary: 500 });
check('周六班前入账 ¥0.00', hasText(saturdayMorning, '¥0.00'), 'true');

// The calendar note lives on settings step 1, so the panel has to be open.
const noCalendar = renderPanel('2027-01-05T10:00:00', { monthlySalary: 8000 });
check('2027 提示日历缺失', hasText(noCalendar, '2027 年的法定节假日安排尚未内置'), 'true');

const withCalendar = renderPanel('2026-10-14T10:00:00', { monthlySalary: 8000 });
check('2026-10 显示 18 个工作日', hasText(withCalendar, '实际工作日 18 天'), 'true');
check('2026-10 显示时薪', hasText(withCalendar, '折合时薪 ¥55.5556'), 'true');
check('2026-10 列出国庆节', hasText(withCalendar, '本月节假日：国庆节'), 'true');

// The card's footer must name the month it projects and its working-day basis,
// so a projection can be checked against the calendar rather than taken on trust.
const octCard = render('2026-10-14T10:00:00', { monthlySalary: 8000 });
check('底部注明 2026 年 10 月', hasText(octCard, '2026年10月'), 'true');
check('底部注明实际工作日 18 天', hasText(octCard, '实际工作日 18 天'), 'true');
check('底部注明日薪', hasText(octCard, '日薪 444.44 元'), 'true');
check('底部注明本月预计', hasText(octCard, '本月预计'), 'true');

// The basis line has to agree with the projection it explains: in monthly mode
// the card's own daily figure is the same monthly-derived one.
check('底部日薪与今日预计一致', hasText(octCard, '¥444.44'), 'true');

const febCard = render('2026-02-10T10:00:00', { monthlySalary: 8000 });
check('二月底部注明 16 天', hasText(febCard, '实际工作日 16 天'), 'true');
check('二月底部日薪 500 元', hasText(febCard, '日薪 500.00 元'), 'true');

// A manual override has to be reflected in that same line.
const manualCard = render('2026-10-14T10:00:00', { monthlySalary: 8000, manualWorkdays: 20 });
check('手填 20 天时底部跟着变', hasText(manualCard, '实际工作日 20 天'), 'true');
check('手填 20 天时日薪 400 元', hasText(manualCard, '日薪 400.00 元'), 'true');

// In daily mode the footer states the monthly-derived figure, not the daily rate
// the mode itself uses, because the footer explains the monthly projection.
const dailyModeCard = render('2026-10-14T10:00:00', { salaryMode: 'daily', dailySalary: 500 });
check('日薪模式下底部仍说明月度口径', hasText(dailyModeCard, '日薪 444.44 元'), 'true');

const february = renderPanel('2026-02-10T10:00:00', { monthlySalary: 8000 });
check('2026-02 显示春节', hasText(february, '本月节假日：春节'), 'true');
check('2026-02 显示 16 个工作日', hasText(february, '实际工作日 16 天'), 'true');

check('金额格式 2 位小数', api.formatMoney(1234.5), '1234.50');
check('时薪格式 4 位小数', api.formatMoney(58.82352941, 4), '58.8235');
check('时薪舍入到 4 位', api.formatMoney(55.55555555, 4), '55.5556');
check('时薪不补零丢失位数', api.formatMoney(50, 4), '50.0000');

// A 4-decimal rate must reach the card itself, not only the formatter.
const rateCard = render('2026-10-14T19:30:00', { monthlySalary: 8000 });
check('卡片上时薪带 4 位小数', hasText(rateCard, '¥55.5556'), 'true');
check('卡片上时薪带单位', hasText(rateCard, '¥55.5556/时'), 'true');
const tidyRate = render('2026-03-10T19:30:00', { monthlySalary: 8000 });
check('整点时薪也补足 4 位', hasText(tidyRate, '¥45.4545'), 'true');

/* ------------------------------------------------------------------ *
 * 4b. The ticker: does the rendered figure actually follow the clock?
 * ------------------------------------------------------------------ */

console.log('\n--- 跳动 ---');
const TICK_AT = '2026-10-14T10:00:00';
const TICK_PATCH = { monthlySalary: 8000 };

const frames = driveTicker(TICK_AT, 6, TICK_PATCH);
check('采集到动画帧', frames.length > 100, 'true');

const amounts = frames.map((sample) => sample.shown);
const nonDecreasing = amounts.every((value, index) => index === 0 || value >= amounts[index - 1]);
check('入账只增不减', nonDecreasing, 'true');

const first = amounts[0];
const last = amounts[amounts.length - 1];
const grew = last - first;
// 8000 / 18 工作日 / 8 小时 => 55.5556 元/时, so six seconds adds about 0.0926.
// Anything near zero means the figure is frozen, which is the bug this guards.
check('6 秒内确实在动（> 0.05 元）', grew > 0.05, 'true');

// The card floors the figure to four decimals, so it can never claim an amount
// that has not been earned. No rounding allowance is needed.
const overshoot = frames.filter((sample) => {
  const truth = api.earnedAt(baseConfig(TICK_PATCH), new Date(sample.clock));
  return sample.shown > truth + 1e-9;
});
check('显示值严格不超前真值', overshoot.length, 0);

const truthAtEnd = api.earnedAt(baseConfig(TICK_PATCH), new Date(frames[frames.length - 1].clock));
check('显示值追上真实值（差值 < 1e-4）', Math.abs(last - truthAtEnd) < 1e-4, 'true');

// The figure has to move *within* the run, not only at the end: find the first
// sample that differs from the opening value.
const movedAt = amounts.findIndex((value) => value > amounts[0] + 1e-9);
check('2 秒内开始变化', movedAt >= 0 && movedAt < 120, 'true');

// The rendered figure must track a rate change, not crawl: a much larger hourly
// rate has to produce a visibly larger six-second gain.
const slow = driveTicker(TICK_AT, 6, { monthlySalary: 8000 }).map((s) => s.shown);
const fast = driveTicker(TICK_AT, 6, { monthlySalary: 40000 }).map((s) => s.shown);
const slowGain = slow[slow.length - 1] - slow[0];
const fastGain = fast[fast.length - 1] - fast[0];
check('五倍月薪的跳动也约五倍', fastGain > slowGain * 4, 'true');

// The amount line carries four decimals, and its tail turns between frames:
// that is what makes the figure look alive rather than stepping once a second.
const texts = frames.map((sample) => sample.text).filter((text) => text !== null);
check('金额显示 4 位小数', /^¥[\d,]+\.\d{4}$/.test(texts[0]), 'true');
check('小数位数不是 2', /\.\d{4}$/.test(texts[0]) && !/\.\d{2}$/.test(texts[0]), 'true');

const distinctTexts = new Set(texts).size;
check('大量不同取值（每帧都在变）', distinctTexts > texts.length / 10, 'true');

// Consecutive frames must actually differ, not just drift over the run.
let changedPairs = 0;
for (let index = 1; index < texts.length; index += 1) if (texts[index] !== texts[index - 1]) changedPairs += 1;
check('相邻帧大多不同', changedPairs > texts.length * 0.8, 'true');

// A frozen shift must stay frozen rather than drifting on its own.
const frozen = driveTicker('2026-10-17T07:00:00', 4, { salaryMode: 'daily', dailySalary: 500 });
check('休息日班前恒为 0', frozen.every((sample) => sample.shown === 0), 'true');

/* ------------------------------------------------------------------ *
 * 5. Copy coverage: every rendered string resolves to a dictionary entry,
 *    and the two dictionaries carry the same key set.
 * ------------------------------------------------------------------ */

console.log('\n--- 文案覆盖 ---');
const zhKeys = Object.keys(api.DICTIONARIES.zh);
const enKeys = Object.keys(api.DICTIONARIES.en);
check('中英词条数量一致', zhKeys.length, enKeys.length);
check('仅中文独有的词条', zhKeys.filter((k) => !enKeys.includes(k)).join(',') || '(none)', '(none)');
check('仅英文独有的词条', enKeys.filter((k) => !zhKeys.includes(k)).join(',') || '(none)', '(none)');

[[undefined, '卡片'], [1, '步骤 1'], [2, '步骤 2'], [3, '步骤 3']].forEach(([stepIndex, label]) => {
  const initialState = stepIndex === undefined ? undefined : [undefined, true, stepIndex];
  const tree = render('2026-10-14T15:00:00', { monthlySalary: 8000 }, initialState);
  const missing = leaves(tree).filter((leaf) => leaf.startsWith('MISSING:'));
  check(label + ' 无缺失词条', missing.join(',') || '(none)', '(none)');
});

console.log(failures === 0 ? '\nAll checks passed.' : '\n' + failures + ' check(s) failed.');
process.exit(failures === 0 ? 0 : 1);
