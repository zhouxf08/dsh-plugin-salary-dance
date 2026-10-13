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
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
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
  // The component's hook order is fixed: [config, open, step, now, liquid, pos].
  // Seeding a slot skips that useState initializer, which is how the settings
  // panel (open) is reached without a DOM.
  if (initialState) initialState.forEach((value, index) => { if (value !== undefined) states[index] = value; });
  const tree = mod.SalaryDanceWidget({ t: localeAwareT });
  globalThis.Date = RealDate;
  return tree;
}

/** A `t` that resolves against the Chinese dictionary and flags missing keys. */
function localeAwareT(key) {
  const zh = api.DICTIONARIES.zh;
  return Object.prototype.hasOwnProperty.call(zh, key) ? zh[key] : 'MISSING:' + key;
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

const february = renderPanel('2026-02-10T10:00:00', { monthlySalary: 8000 });
check('2026-02 显示春节', hasText(february, '本月节假日：春节'), 'true');
check('2026-02 显示 16 个工作日', hasText(february, '实际工作日 16 天'), 'true');

check('金额格式 2 位小数', api.formatMoney(1234.5), '1234.50');
check('时薪格式 4 位小数', api.formatMoney(58.82352941, 4), '58.8235');

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
