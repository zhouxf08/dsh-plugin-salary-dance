window.__ModuleLoader__.load({
	id: 'dsh-plugin-salary-dance',
	factory(require) {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require('react');
		const h = React.createElement;

		/**
		 * Declared Client dependencies. These only order activation against the
		 * shipped packages; nothing is imported from them on purpose, because a
		 * plugin must not load another Harness Client package as a module.
		 * `react` itself comes from the shell's frozen platform module table.
		 */
		const inject = ['slots', 'locale'];

		const NS = 'salarydance';
		/** The Loader row id, kept in step with the package name. */
		const ROW_ID = 'salarydance';
		const PACKAGE_NAME = 'dsh-plugin-salary-dance';
		const STYLE_TAG_ID = 'dsh-plugin-salary-dance/widget.css';
		// A persistence contract: keep it in step with PACKAGE_NAME, since changing it
		// discards every existing user's saved configuration.
		const STORAGE_KEY = PACKAGE_NAME + '/config.v1';

		/* ------------------------------------------------------------------ *
		 * Statutory holiday calendar (mainland China)
		 *
		 * Transcribed from the State Council notices:
		 *   2025 — 国办发明电〔2024〕12号
		 *          https://www.gov.cn/zhengce/zhengceku/202411/content_6986383.htm
		 *   2026 — 国办发明电〔2025〕7号
		 *          https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
		 * Each date appears once; `label` is only used for the month summary.
		 * ------------------------------------------------------------------ */

		const HOLIDAYS = {
			'2025-01-01': { label: '元旦' },
			'2025-01-28': { label: '春节' },
			'2025-01-29': { label: '春节' },
			'2025-01-30': { label: '春节' },
			'2025-01-31': { label: '春节' },
			'2025-02-01': { label: '春节' },
			'2025-02-02': { label: '春节' },
			'2025-02-03': { label: '春节' },
			'2025-02-04': { label: '春节' },
			'2025-04-04': { label: '清明节' },
			'2025-04-05': { label: '清明节' },
			'2025-04-06': { label: '清明节' },
			'2025-05-01': { label: '劳动节' },
			'2025-05-02': { label: '劳动节' },
			'2025-05-03': { label: '劳动节' },
			'2025-05-04': { label: '劳动节' },
			'2025-05-05': { label: '劳动节' },
			'2025-05-31': { label: '端午节' },
			'2025-06-01': { label: '端午节' },
			'2025-06-02': { label: '端午节' },
			'2025-10-01': { label: '国庆节' },
			'2025-10-02': { label: '国庆节' },
			'2025-10-03': { label: '国庆节' },
			'2025-10-04': { label: '国庆节' },
			'2025-10-05': { label: '国庆节' },
			'2025-10-06': { label: '国庆节' },
			'2025-10-07': { label: '国庆节' },
			'2025-10-08': { label: '国庆节' },

			'2026-01-01': { label: '元旦' },
			'2026-01-02': { label: '元旦' },
			'2026-01-03': { label: '元旦' },
			'2026-02-15': { label: '春节' },
			'2026-02-16': { label: '春节' },
			'2026-02-17': { label: '春节' },
			'2026-02-18': { label: '春节' },
			'2026-02-19': { label: '春节' },
			'2026-02-20': { label: '春节' },
			'2026-02-21': { label: '春节' },
			'2026-02-22': { label: '春节' },
			'2026-02-23': { label: '春节' },
			'2026-04-04': { label: '清明节' },
			'2026-04-05': { label: '清明节' },
			'2026-04-06': { label: '清明节' },
			'2026-05-01': { label: '劳动节' },
			'2026-05-02': { label: '劳动节' },
			'2026-05-03': { label: '劳动节' },
			'2026-05-04': { label: '劳动节' },
			'2026-05-05': { label: '劳动节' },
			'2026-06-19': { label: '端午节' },
			'2026-06-20': { label: '端午节' },
			'2026-06-21': { label: '端午节' },
			'2026-09-25': { label: '中秋节' },
			'2026-09-26': { label: '中秋节' },
			'2026-09-27': { label: '中秋节' },
			'2026-10-01': { label: '国庆节' },
			'2026-10-02': { label: '国庆节' },
			'2026-10-03': { label: '国庆节' },
			'2026-10-04': { label: '国庆节' },
			'2026-10-05': { label: '国庆节' },
			'2026-10-06': { label: '国庆节' },
			'2026-10-07': { label: '国庆节' }
		};

		/** Weekend days the notices turned into working days (调休上班). */
		const MAKEUP_WORKDAYS = {
			'2025-01-26': 1,
			'2025-02-08': 1,
			'2025-04-27': 1,
			'2025-09-28': 1,
			'2025-10-11': 1,

			'2026-01-04': 1,
			'2026-02-14': 1,
			'2026-02-28': 1,
			'2026-05-09': 1,
			'2026-09-20': 1,
			'2026-10-10': 1
		};

		/** Years the calendar table above actually covers. */
		const CALENDAR_YEARS = [2025, 2026];

		/** The animation asks for the month's workday count on every frame. */
		const workdayMemo = new Map();

		/** `YYYY-MM-DD` key in the local zone. */
		function dateKey(year, monthIndex, day) {
			return (
				year +
				'-' +
				String(monthIndex + 1).padStart(2, '0') +
				'-' +
				String(day).padStart(2, '0')
			);
		}

		/** Sunday-first `getDay()` to the ISO 1..7 weekday. */
		function isoWeekday(jsDay) {
			return jsDay === 0 ? 7 : jsDay;
		}

		/**
		 * The paid working days of a month: the configured weekdays, minus public
		 * holidays, plus the weekend days the notices turned into working days.
		 * @returns the count, whether the holiday table covers that year, and the
		 *          holiday names falling in that month.
		 */
		function monthWorkdays(year, monthIndex, workDays) {
			const memoKey = year + '-' + monthIndex + '-' + workDays.join(',');
			const memo = workdayMemo.get(memoKey);
			if (memo !== undefined) return memo;
			const total = new Date(year, monthIndex + 1, 0).getDate();
			let count = 0;
			const holidays = [];
			for (let day = 1; day <= total; day += 1) {
				const date = new Date(year, monthIndex, day);
				const key = dateKey(year, monthIndex, day);
				const holiday = HOLIDAYS[key];
				if (holiday !== undefined) {
					holidays.push(holiday.label);
					continue;
				}
				if (MAKEUP_WORKDAYS[key] === 1) {
					count += 1;
					continue;
				}
				if (workDays.indexOf(isoWeekday(date.getDay())) >= 0) count += 1;
			}
			const result = {
				count: count,
				covered: CALENDAR_YEARS.indexOf(year) >= 0,
				holidays: holidays
			};
			workdayMemo.set(memoKey, result);
			return result;
		}

		/** Leading blank cells before the 1st, under a Monday-first week. */
		function leadingBlanks(year, monthIndex) {
			const weekday = isoWeekday(new Date(year, monthIndex, 1).getDay());
			return weekday - 1;
		}

		/**
		 * One month laid out for display: every day with the classification the
		 * calendar paints, so the widget never re-derives it while rendering.
		 *
		 * `kind` is 'holiday' (a statutory day off), 'makeup' (a weekend the notices
		 * turned into a working day), 'workday' (a normal working day) or 'rest'
		 * (a weekend that is neither). `label` carries the holiday's name.
		 */
		function monthCalendar(year, monthIndex, workDays) {
			const total = new Date(year, monthIndex + 1, 0).getDate();
			const blanks = leadingBlanks(year, monthIndex);
			const days = [];
			for (let day = 1; day <= total; day += 1) {
				const date = new Date(year, monthIndex, day);
				const key = dateKey(year, monthIndex, day);
				const holiday = HOLIDAYS[key];
				const makeup = MAKEUP_WORKDAYS[key] === 1;
				let kind;
				if (holiday !== undefined) kind = 'holiday';
				else if (makeup) kind = 'makeup';
				else if (workDays.indexOf(isoWeekday(date.getDay())) >= 0) kind = 'workday';
				else kind = 'rest';
				days.push({
					day: day,
					weekday: isoWeekday(date.getDay()),
					kind: kind,
					label: holiday === undefined ? null : holiday.label
				});
			}
			return { year: year, monthIndex: monthIndex, blanks: blanks, days: days, covered: CALENDAR_YEARS.indexOf(year) >= 0 };
		}

		/* ------------------------------------------------------------------ *
		 * Defaults and configuration
		 * ------------------------------------------------------------------ */

		const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

		const DEFAULT_CONFIG = {
			salaryMode: 'monthly', // 'monthly' | 'daily' | 'hourly'
			monthlySalary: 8000,
			dailySalary: 400,
			hourlySalary: 50,
			manualWorkdays: 0, // > 0 is a hand-set override; 0 follows the calendar
			// Fixed: the statutory calendar is defined against the ordinary Monday to
			// Friday week, so asking the user to pick weekdays only invited mistakes
			// (and produced nonsense like a 14.5-hour "day" from a two-day week).
			workDays: [1, 2, 3, 4, 5],
			startTime: '09:00',
			endTime: '18:00',
			lunchEnabled: true,
			lunchStart: '12:00',
			lunchEnd: '13:00',
			// null = never set (auto); true = hand-set override; false = explicitly
			// released by the reset control. A plain `false` default cannot distinguish
			// "never set" from "set back to auto", which the migration below needs.
			manualWorkdaysOverride: null,
			theme: 'light', // 'light' | 'dark' | 'system' — toggled from the card
			miniFloat: false
		};

		const SALARY_MODES = ['monthly', 'daily', 'hourly'];
		const THEMES = ['light', 'dark', 'system'];

		/** Read the saved configuration, falling back to defaults for anything unusable. */
		function loadConfig() {
			const config = Object.assign({}, DEFAULT_CONFIG);
			let raw = null;
			try {
				raw = window.localStorage.getItem(STORAGE_KEY);
			} catch (error) {
				return config;
			}
			if (raw === null) return config;
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch (error) {
				return config;
			}
			if (parsed === null || typeof parsed !== 'object') return config;
			const merged = Object.assign(config, parsed);
			// Migration first: it has to see the stored shape, not the normalized one.
			// Storage written before the switch existed carries a positive count and no
			// flag at all, and such a count was hand-set, so it stays an override.
			if (parsed.manualWorkdaysOverride === undefined && merged.manualWorkdays > 0) {
				merged.manualWorkdaysOverride = true;
			}
			if (SALARY_MODES.indexOf(merged.salaryMode) < 0) merged.salaryMode = DEFAULT_CONFIG.salaryMode;
			if (THEMES.indexOf(merged.theme) < 0) merged.theme = DEFAULT_CONFIG.theme;
			if (!Array.isArray(merged.workDays)) merged.workDays = DEFAULT_CONFIG.workDays.slice();
			merged.workDays = merged.workDays
				.filter(function (day) { return Number.isInteger(day) && day >= 1 && day <= 7; })
				.sort(function (a, b) { return a - b; });
			['monthlySalary', 'dailySalary', 'hourlySalary', 'manualWorkdays'].forEach(function (key) {
				const value = Number(merged[key]);
				merged[key] = Number.isFinite(value) && value >= 0 ? value : DEFAULT_CONFIG[key];
			});
			['startTime', 'endTime', 'lunchStart', 'lunchEnd'].forEach(function (key) {
				if (!isClockString(merged[key])) merged[key] = DEFAULT_CONFIG[key];
			});
			['lunchEnabled', 'miniFloat'].forEach(function (key) {
				merged[key] = merged[key] === true;
			});
			// Tri-state: anything that is not a real boolean falls back to the sentinel.
			merged.manualWorkdaysOverride = merged.manualWorkdaysOverride === true
				? true
				: merged.manualWorkdaysOverride === false
					? false
					: null;
			return merged;
		}

		/** Persist the configuration; storage failures never break the widget. */
		function saveConfig(config) {
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
			} catch (error) {
				/* Quota or a disabled storage area: the widget keeps working in memory. */
			}
		}

		/* ------------------------------------------------------------------ *
		 * Time and pay math
		 * ------------------------------------------------------------------ */

		const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

		/** Whether a value is a `HH:mm` clock string. */
		function isClockString(value) {
			return typeof value === 'string' && CLOCK_RE.test(value);
		}

		/** Parse `HH:mm` into minutes after midnight; an unusable value reads as `fallback`. */
		function toMinutes(value, fallback) {
			const match = typeof value === 'string' ? CLOCK_RE.exec(value) : null;
			if (match === null) return fallback === undefined ? 0 : fallback;
			return Number(match[1]) * 60 + Number(match[2]);
		}

		/** Minutes after midnight, keeping the sub-minute part for a smooth ticker. */
		function minutesOfDay(date) {
			return (
				date.getHours() * 60 +
				date.getMinutes() +
				date.getSeconds() / 60 +
				date.getMilliseconds() / 60000
			);
		}

		/**
		 * Solve the day's shift against the current instant.
		 * Returns the shift window, how much of it is unpaid lunch break, how much
		 * work time has actually been served, and what is left.
		 */
		function solveShift(config, date) {
			const startMin = toMinutes(config.startTime, 9 * 60);
			let endMin = toMinutes(config.endTime, 18 * 60);
			const overnight = endMin <= startMin;
			if (overnight) endMin += 1440;

			const now = minutesOfDay(date);
			// On an overnight shift, a clock reading before the start belongs to the
			// next calendar day.
			const resolvedNow = overnight && now < startMin ? now + 1440 : now;
			const span = Math.max(0, endMin - startMin);

			// Unpaid lunch break, clipped to the shift window.
			let breakMin = 0;
			let lunchStart = 0;
			let lunchEnd = 0;
			if (config.lunchEnabled) {
				let lunchStartRaw = toMinutes(config.lunchStart, 12 * 60);
				let lunchEndRaw = toMinutes(config.lunchEnd, 13 * 60);
				if (overnight) {
					if (lunchStartRaw < startMin) lunchStartRaw += 1440;
					if (lunchEndRaw < startMin) lunchEndRaw += 1440;
					if (lunchEndRaw <= lunchStartRaw) lunchEndRaw += 1440;
				} else if (lunchEndRaw <= lunchStartRaw) {
					// A same-day break that ends before it starts is not a break.
					lunchEndRaw = lunchStartRaw;
				}
				lunchStart = Math.min(Math.max(lunchStartRaw, startMin), startMin + span);
				lunchEnd = Math.min(Math.max(lunchEndRaw, startMin), startMin + span);
				breakMin = Math.max(0, lunchEnd - lunchStart);
			}

			const workSpan = Math.max(0, span - breakMin);
			const clampedNow = Math.min(Math.max(resolvedNow, startMin), startMin + span);

			// Work minutes served so far, excluding the lunch window.
			let servedRaw = clampedNow - startMin;
			if (breakMin > 0 && clampedNow > lunchStart) {
				servedRaw -= Math.min(clampedNow, lunchEnd) - lunchStart;
			}
			servedRaw = Math.min(Math.max(servedRaw, 0), workSpan);

			return {
				startMin: startMin,
				spanMin: span,
				workSpanMin: workSpan,
				hoursPerDay: workSpan / 60,
				breakMin: breakMin,
				servedMin: servedRaw,
				remainingMin: Math.max(0, workSpan - servedRaw),
				progress: workSpan > 0 ? Math.min(1, Math.max(0, servedRaw / workSpan)) : 0,
				before: resolvedNow < startMin,
				after: resolvedNow >= startMin + span,
				overnight: overnight
			};
		}

		/**
		 * The pay for one full working day, before any of it has been served.
		 * @param actual - the calendar's answer for this month.
		 * @param hoursPerDay - paid hours in one full shift.
		 */
		function dailyRate(config, actual, hoursPerDay) {
			const manual = manualWorkdaysOf(config);
			const workdays = manual === null ? actual.count : manual;
			const safeWorkdays = workdays > 0 ? workdays : 1;
			const hours = hoursPerDay > 0 ? hoursPerDay : 0;
			const hourly = hours > 0 ? config.monthlySalary / safeWorkdays / hours : 0;
			if (config.salaryMode === 'monthly') return config.monthlySalary / safeWorkdays;
			if (config.salaryMode === 'daily') return config.dailySalary;
			return hourly * hours;
		}

		/**
		 * The amount earned at one instant, from the shift and the day's rate.
		 *
		 * A day the configured week does not cover earns nothing, whatever the clock
		 * says: the display gates on this same rule, so leaving it out here made the
		 * ticker and the card disagree on a weekend.
		 */
		function earnedAt(config, date) {
			if (config.workDays.indexOf(isoWeekday(date.getDay())) < 0) return 0;
			const shift = solveShift(config, date);
			if (shift.workSpanMin <= 0) return 0;
			const actual = monthWorkdays(date.getFullYear(), date.getMonth(), config.workDays);
			return dailyRate(config, actual, shift.hoursPerDay) * (shift.servedMin / shift.workSpanMin);
		}

		/**
		 * Derive the month's rate card.
		 *
		 * Hourly is the anchor: the month's actual working days (public holidays and
		 * makeup days included) and one shift's paid hours give
		 * `hourly = monthly / workdays / hoursPerDay`, so the rate moves with the
		 * month and with the configured shift.
		 *
		 * @param actual - the calendar's answer for this month.
		 * @param hoursPerDay - paid hours in one full shift.
		 */
		function computePay(config, date, actual, hoursPerDay) {
			const monthNames = [
				'一月', '二月', '三月', '四月', '五月', '六月',
				'七月', '八月', '九月', '十月', '十一月', '十二月'
			];
			const manual = manualWorkdaysOf(config);
			const workdays = manual === null ? actual.count : manual;
			const safeWorkdays = workdays > 0 ? workdays : 1;
			const hours = hoursPerDay > 0 ? hoursPerDay : 0;
			const hourly = hours > 0 ? config.monthlySalary / safeWorkdays / hours : 0;
			const daily = dailyRate(config, actual, hoursPerDay);

			return {
				mode: config.salaryMode,
				workdays: workdays,
				hoursPerDay: hours,
				hourly: hourly,
				daily: daily,
				monthTotal: config.salaryMode === 'monthly' ? config.monthlySalary : daily * workdays,
				monthLabel: monthNames[date.getMonth()],
				covered: actual.covered && manual === null,
				manual: manual !== null,
				holidayNames: actual.holidays
			};
		}

		/**
		 * The hand-set working-day count, or null when the calendar is in charge.
		 *
		 * This is the single place that decides whether the row is an override. It
		 * used to be spelled `manualWorkdays > 0` in the rate math and differently
		 * again in the row, so switching back to automatic left the old number in
		 * force for the rate while the row showed the calendar's.
		 *
		 * A real 0 is never a valid count, which is what keeps a cleared field from
		 * reading as an override.
		 */
		function manualWorkdaysOf(config) {
			if (config.manualWorkdaysOverride === true && config.manualWorkdays > 0) {
				return config.manualWorkdays;
			}
			return null;
		}

		/**
		 * What the working-days row shows: the hand-set count while the row is an
		 * override, otherwise the calendar's own answer.
		 */
		function resolveManualWorkdays(config, calendarCount) {
			const manual = manualWorkdaysOf(config);
			return manual === null ? calendarCount : manual;
		}

		/** Format a currency amount with the requested decimals and no symbol. */
		function formatMoney(value, decimals) {
			const places = decimals === undefined ? 2 : decimals;
			const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
			return safe.toFixed(places);
		}

		/** Format a duration in minutes as parts, so the card can style each unit. */
		function formatDuration(minutes) {
			const safe = Math.max(0, Math.round(minutes || 0));
			return { hours: Math.floor(safe / 60), minutes: safe % 60 };
		}

		/** Group a money string with thousands separators, keeping its decimals. */
		function groupMoney(text) {
			const parts = String(text).split('.');
			parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
			return parts.join('.');
		}

		/* ------------------------------------------------------------------ *
		 * Styles — theme tokens only, no imported Harness stylesheet
		 * ------------------------------------------------------------------ */

		const CSS = `
.pd-root{
  position:fixed;
  z-index:40;
  font-family:var(--dsw-font-family,inherit);
  color:var(--dsw-alias-label-primary,#16181d);
  pointer-events:auto;
  touch-action:none;
}
.pd-root[data-raised="true"]{ z-index:60; }
.pd-card{
  width:296px;
  box-sizing:border-box;
  border-radius:var(--dsw-radius-lg,14px);
  border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));
  background:var(--dsw-alias-bg-layer-2,#fff);
  box-shadow:var(--dsw-shadow-lv2,0 8px 28px rgba(16,24,40,.14));
  /* Deliberately not overflow:hidden: the time popovers hang outside the card,
     and clipping them is what made them invisible. The header carries the only
     full-bleed background, so it clips itself instead. */
}
.pd-head{
  border-radius:calc(var(--dsw-radius-lg,14px) - 1px) calc(var(--dsw-radius-lg,14px) - 1px) 0 0;
  overflow:hidden;
  display:flex;
  align-items:center;
  gap:8px;
  padding:10px 12px;
  cursor:grab;
  user-select:none;
}
.pd-head:active{ cursor:grabbing; }
.pd-dot{
  width:8px;height:8px;border-radius:50%;
  background:var(--dsw-alias-brand-primary,#f68b1f);
  box-shadow:0 0 0 3px rgba(246,139,31,.22);
  flex:0 0 auto;
}
.pd-title{
  font-size:13px;
  font-weight:600;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.pd-iconbtn{
  appearance:none;
  border:0;
  background:transparent;
  color:var(--dsw-alias-label-tertiary,#8a9099);
  width:22px;height:22px;
  border-radius:var(--dsw-radius-xs,6px);
  display:inline-flex;align-items:center;justify-content:center;
  cursor:pointer;
  padding:0;
  flex:0 0 auto;
}
.pd-iconbtn:hover{ background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06)); color:var(--dsw-alias-label-primary,#16181d); }
.pd-iconbtn.on{ background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06)); color:var(--dsw-alias-brand-primary,#f68b1f); }
/* The three card-level controls sit together at the header's trailing edge. */
.pd-head-actions{ margin-left:auto; display:flex; align-items:center; gap:2px; flex:0 0 auto; }
.pd-iconbtn:focus-visible{ outline:2px solid var(--dsw-alias-state-business-primary,#4a90e2); outline-offset:1px; }
.pd-body{ padding:0 14px 11px; }
.pd-caption{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  font-size:11px;
  color:var(--dsw-alias-label-tertiary,#8a9099);
  text-align:center;
}
/* The hourly rate drives the ticker, so it sits beside the amount rather than
   buried in a footnote: four decimals, per the rate the settings derive. */
.pd-caprate{
  font-variant-numeric:tabular-nums;
  font-weight:600;
  color:var(--dsw-alias-label-secondary,#4a505a);
  background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));
  border-radius:999px;
  padding:1px 7px;
}
.pd-amount{
  display:flex;
  align-items:baseline;
  justify-content:center;
  gap:2px;
  margin:2px 0 12px;
  font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-primary,#16181d);
}
.pd-amount .sym{ font-size:17px; font-weight:600; opacity:.82; }
.pd-amount .int{ font-size:28px; font-weight:700; letter-spacing:-.02em; line-height:1.05; }
/* Four decimals sit slightly smaller so the whole figure stays on one line and
   the turning tail stays legible. */
.pd-amount .frac{ font-size:16px; font-weight:600; opacity:.7; }
.pd-stats{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  border:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));
  border-radius:var(--dsw-radius-md,10px);
  overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.015));
}
.pd-stat{ padding:8px 6px; text-align:center; }
.pd-stat + .pd-stat{ border-left:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08)); }
.pd-stat .k{ font-size:10.5px; color:var(--dsw-alias-label-tertiary,#8a9099); margin-bottom:3px; }
.pd-stat .v{ font-size:12.5px; font-weight:600; font-variant-numeric:tabular-nums; }
.pd-bar{
  margin-top:12px;
  height:8px;
  border-radius:999px;
  background:var(--dsw-alias-border-l1,rgba(0,0,0,.07));
  position:relative;
}
.pd-bar .knob{
  position:absolute;top:50%;left:0;
  width:14px;height:14px;border-radius:50%;
  background:var(--dsw-alias-brand-primary,#f68b1f);
  border:2px solid var(--dsw-alias-bg-layer-2,#fff);
  box-shadow:0 1px 4px rgba(0,0,0,.22);
  transform:translate(-50%,-50%);
  box-sizing:border-box;
}
.pd-rate{
  display:flex;align-items:center;justify-content:space-between;
  gap:8px;
  margin-top:8px;
  font-size:10.5px;
  color:var(--dsw-alias-label-tertiary,#8a9099);
  font-variant-numeric:tabular-nums;
}
.pd-rate .b{ color:var(--dsw-alias-label-secondary,#4a505a); font-weight:600; }
/* The projection's fine print: which month, and how many working days it uses. */
.pd-foot{ margin-top:0; }
.pd-foot-meta{
  display:flex;align-items:center;justify-content:center;gap:5px;
  margin-top:4px;
  font-size:10px;
  line-height:14px;
  white-space:nowrap;
  color:var(--dsw-alias-label-tertiary,#8a9099);
  font-variant-numeric:tabular-nums;
}
.pd-foot-meta svg{ flex:0 0 auto; }
.pd-foot-meta .lead{ font-weight:600; color:var(--dsw-alias-label-secondary,#4a505a); }
.pd-foot-meta > span + span::before{ content:'·'; margin-right:5px; color:var(--dsw-alias-border-l3,rgba(0,0,0,.25)); }
.pd-foot-row{ display:flex; align-items:center; gap:8px; margin-top:10px; }
.pd-foot-row .pd-rate{ flex:1 1 auto; margin-top:0; }
/* Icon-only settings entry: quiet until hovered, matching the header's controls. */
.pd-gear{
  appearance:none;
  flex:0 0 auto;
  height:24px;
  padding:0 7px;
  border:0.5px solid transparent;
  border-radius:var(--dsw-radius-sm,8px);
  background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));
  color:var(--dsw-alias-label-secondary,#4a505a);
  display:inline-flex;align-items:center;justify-content:center;
  gap:2px;
  cursor:pointer;
}
.pd-gear svg:last-child{ color:var(--dsw-alias-label-tertiary,#8a9099); }
.pd-gear:hover{
  background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.09));
  color:var(--dsw-alias-label-primary,#16181d);
}
.pd-gear:focus-visible{ outline:2px solid var(--dsw-alias-state-business-primary,#4a90e2); outline-offset:1px; }
.pd-btn{
  flex:1 1 auto;
  appearance:none;
  border:0;
  border-radius:var(--dsw-radius-md,10px);
  height:34px;
  font-size:13px;
  font-weight:600;
  font-family:inherit;
  cursor:pointer;
  color:var(--dsw-alias-label-primary-foreground,#fff);
  background:var(--dsw-alias-button-primary-fill,#f68b1f);
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
}
.pd-btn:hover{ background:var(--dsw-alias-button-primary-hover,#e07c12); }
.pd-btn:focus-visible{ outline:2px solid var(--dsw-alias-state-business-primary,#4a90e2); outline-offset:2px; }
.pd-btn.ghost{
  flex:0 0 auto;
  width:34px;
  background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));
  color:var(--dsw-alias-label-secondary,#4a505a);
}
.pd-btn.ghost:hover{ background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.09)); }
.pd-mini{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:2px 12px 10px;
  cursor:pointer;
  user-select:none;
}
.pd-mini-main{ display:flex;align-items:baseline;gap:1px; flex:0 0 auto; }
.pd-mini .v{ font-size:19px;font-weight:700;font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
.pd-mini .sym{ font-size:13px;font-weight:600;opacity:.8; }
/* Two stacked figures: the pace, and where the day lands. */
.pd-mini-metrics{ display:flex; flex-direction:column; gap:3px; align-items:flex-end; }
.pd-mini-metrics > div{ display:flex; align-items:baseline; gap:5px; }
.pd-mini-metrics .k{ font-size:9.5px; color:var(--dsw-alias-label-tertiary,#8a9099); }
.pd-mini-metrics b{
  font-size:11px; font-weight:600;
  color:var(--dsw-alias-label-secondary,#4a505a);
  font-variant-numeric:tabular-nums;
}
/* How far through the shift, drawn at the card's bottom edge. */
.pd-mini-bar{ height:3px; background:var(--dsw-alias-border-l1,rgba(0,0,0,.07)); }
.pd-mini-bar .fill{ display:block; height:100%; background:var(--dsw-alias-brand-primary,#f68b1f); }
.pd-panel{
  padding:0 14px 14px;
  /* The calendar makes step 2 tall; on a short window the panel scrolls rather
     than pushing its own controls off the bottom. */
  max-height:min(74vh, 620px);
  overflow-y:auto;
  overscroll-behavior:contain;
  scrollbar-width:thin;
}
.pd-panel-head{
  display:flex;align-items:center;justify-content:flex-end;
  padding:6px 10px 0;
}
.pd-steps{ display:flex;align-items:center;gap:6px; padding:10px 14px 4px; }
.pd-step{ display:flex;align-items:center;gap:6px; flex:0 0 auto; }
.pd-step .n{
  width:18px;height:18px;border-radius:50%;
  display:inline-flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:700;
  background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));
  color:var(--dsw-alias-label-tertiary,#8a9099);
}
.pd-step.on .n{ background:var(--dsw-alias-brand-primary,#f68b1f); color:#fff; }
.pd-step .l{ font-size:12px; font-weight:600; color:var(--dsw-alias-label-tertiary,#8a9099); }
.pd-step.on .l{ color:var(--dsw-alias-label-primary,#16181d); }
.pd-conn{ flex:1 1 auto; height:1px; background:var(--dsw-alias-border-l2,rgba(0,0,0,.1)); }
.pd-group{ margin-top:11px; }
.pd-label{ font-size:11.5px; color:var(--dsw-alias-label-secondary,#4a505a); margin-bottom:6px; }

/* Segmented control copies the host primitive's shape: a soft track with a
   raised indicator riding on it. */
.pd-seg{
  display:grid;
  grid-auto-flow:column;
  grid-auto-columns:1fr;
  gap:2px;
  padding:4px;
  border-radius:var(--dsw-radius-md,10px);
  background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));
}
.pd-seg button{
  appearance:none;border:0;background:transparent;font-family:inherit;
  height:26px;padding:0 6px;cursor:pointer;
  border-radius:var(--dsw-radius-sm,8px);
  font-size:12.5px;font-weight:500;
  color:var(--dsw-alias-label-secondary,#4a505a);
  transition:color 120ms ease, background 120ms ease;
}
.pd-seg button[aria-pressed="true"]{
  background:var(--dsw-alias-bg-layer-1,#fff);
  box-shadow:var(--dsw-elevation-soft,0 1px 2px rgba(0,0,0,.12));
  color:var(--dsw-alias-label-primary,#16181d);
  font-weight:600;
}
.pd-seg button:focus-visible{ outline:2px solid var(--dsw-alias-state-business-primary,#4a90e2); outline-offset:-1px; }

.pd-input{ display:flex;align-items:center;gap:6px; }
.pd-input > input{
  flex:1 1 auto; min-width:0;
  height:34px; box-sizing:border-box;
  border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));
  border-radius:var(--dsw-radius-sm,8px);
  background:var(--dsw-alias-bg-layer-1,#fff);
  color:var(--dsw-alias-label-primary,#16181d);
  padding:0 9px; font-size:12.5px; font-family:inherit;
  font-variant-numeric:tabular-nums;
}
.pd-input > input:focus-visible{
  outline:2px solid var(--dsw-alias-state-business-primary,#4a90e2);
  outline-offset:1px;
}
.pd-input .unit{ font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8a9099); flex:0 0 auto; }
/* The working-days row is a readout until it is edited, so the way back to the
   calendar sits beside it rather than hidden in another step. */
.pd-reset{
  appearance:none;
  flex:0 0 auto;
  height:26px;
  padding:0 8px;
  border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));
  border-radius:var(--dsw-radius-sm,8px);
  background:transparent;
  color:var(--dsw-alias-label-secondary,#4a505a);
  font-family:inherit;
  font-size:10.5px;
  cursor:pointer;
}
.pd-reset:hover{ background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06)); color:var(--dsw-alias-label-primary,#16181d); }
.pd-reset:focus-visible{ outline:2px solid var(--dsw-alias-state-business-primary,#4a90e2); outline-offset:1px; }
.pd-row{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
/* The work week is not a choice: the statutory calendar is defined against the
   ordinary Monday-to-Friday week, so the month is shown rather than configured. */
.pd-cal-week,
.pd-cal-grid{
  display:grid;
  grid-template-columns:repeat(7,1fr);
  gap:2px;
}
.pd-cal-week{ margin-bottom:3px; }
.pd-cal-wd{
  text-align:center;
  font-size:9.5px;
  color:var(--dsw-alias-label-tertiary,#8a9099);
}
.pd-cal-wd[data-rest]{ color:var(--dsw-alias-label-tertiary,#8a9099); opacity:.6; }
.pd-cal-pad{ height:0; }
.pd-cal-day{
  height:20px;
  display:flex;align-items:center;justify-content:center;
  border-radius:var(--dsw-radius-xs,6px);
  font-size:10.5px;
  font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-secondary,#4a505a);
  background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.02));
}
.pd-cal-day[data-kind="rest"]{ color:var(--dsw-alias-label-tertiary,#8a9099); background:transparent; opacity:.55; }
.pd-cal-day[data-kind="weekend"]{ color:var(--dsw-alias-label-tertiary,#8a9099); }
/* Statutory days off are the point of the grid, so they are the loudest cell. */
.pd-cal-day[data-kind="holiday"]{
  background:var(--dsw-alias-label-error,#e5484d);
  color:var(--dsw-alias-label-primary-foreground,#fff);
  font-weight:600;
}
.pd-cal-day[data-kind="makeup"]{
  background:var(--dsw-alias-brand-primary,#f68b1f);
  color:var(--dsw-alias-label-primary-foreground,#fff);
  font-weight:600;
}
.pd-cal-legend{
  display:flex;flex-wrap:wrap;gap:10px;
  margin-top:7px;
  font-size:9.5px;
  color:var(--dsw-alias-label-tertiary,#8a9099);
}
.pd-cal-legend span{ display:inline-flex;align-items:center;gap:4px; }
.pd-cal-legend i{
  width:8px;height:8px;border-radius:2px;
  background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.08));
  border:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));
}
.pd-cal-legend i[data-kind="holiday"]{ background:var(--dsw-alias-label-error,#e5484d); border-color:transparent; }
.pd-cal-legend i[data-kind="makeup"]{ background:var(--dsw-alias-brand-primary,#f68b1f); border-color:transparent; }
.pd-switchrow{
  display:flex; align-items:center; gap:10px;
  padding:9px 0 0;
}
.pd-switchrow .ic{
  width:16px; height:16px; flex:0 0 auto;
  color:var(--dsw-alias-label-secondary,#4a505a);
  display:inline-flex; align-items:center; justify-content:center;
}
.pd-switchrow .tx{ flex:1 1 auto; min-width:0; }
.pd-switchrow .tx .a{ font-size:12.5px; }
.pd-switchrow .tx .b{ font-size:10.5px; color:var(--dsw-alias-label-tertiary,#8a9099); margin-top:1px; line-height:1.4; }
.pd-switch{
  position:relative; flex:0 0 auto;
  width:36px;height:20px;padding:2px;
  border:0;border-radius:999px;
  background:var(--dsw-alias-border-l3,rgba(0,0,0,.2));
  cursor:pointer;
}
.pd-switch[aria-checked="true"]{ background:var(--dsw-alias-brand-primary,#f68b1f); }
.pd-switch span{
  display:block;width:16px;height:16px;border-radius:50%;
  background:var(--dsw-alias-label-primary-foreground,#fff);
  box-shadow:0 1px 2px rgba(0,0,0,.25);
  transition:transform 120ms ease;
}
.pd-switch[aria-checked="true"] span{ transform:translateX(16px); }
.pd-switch:focus-visible{ outline:2px solid var(--dsw-alias-state-business-primary,#4a90e2); outline-offset:2px; }
.pd-note{ font-size:10.5px; color:var(--dsw-alias-label-tertiary,#8a9099); margin-top:6px; line-height:1.5; }
.pd-note.alert{ color:var(--dsw-alias-label-error,#e5484d); }

/* ---------------- scroll wheel time picker ---------------- */
.pd-picker{ position:relative; }
.pd-trigger{
  width:100%;
  display:flex;align-items:center;justify-content:space-between;gap:6px;
  height:34px; box-sizing:border-box;
  border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));
  border-radius:var(--dsw-radius-sm,8px);
  background:var(--dsw-alias-bg-layer-1,#fff);
  color:var(--dsw-alias-label-primary,#16181d);
  padding:0 9px; font-size:12.5px; font-family:inherit;
  font-variant-numeric:tabular-nums;
  cursor:pointer;text-align:left;
}
.pd-trigger:disabled{ opacity:.45; cursor:default; }
.pd-trigger:focus-visible{
  outline:2px solid var(--dsw-alias-state-business-primary,#4a90e2);
  outline-offset:1px;
}
.pd-trigger .clock{ color:var(--dsw-alias-label-tertiary,#8a9099); display:inline-flex; flex:0 0 auto; }
.pd-pop{
  /* Fixed, so the card cannot clip it and page scrolling cannot carry it away.
     The position comes from the trigger's own rect, computed on open. */
  position:fixed;
  z-index:2147483000;
  width:196px;
  padding:8px 8px 10px;
  box-sizing:border-box;
  border-radius:var(--dsw-radius-lg,14px);
  border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));
  background:var(--dsw-alias-bg-layer-2,#fff);
  box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(16,24,40,.2));
}
.pd-wheels{ display:flex; align-items:stretch; gap:4px; }
.pd-wheel-col{
  position:relative;
  flex:1 1 0;
  height:160px;
  /* The card root sets touch-action:none so the header can be dragged; the
     wheels must opt back in to vertical panning. */
  touch-action:pan-y;
  overflow-y:auto;
  overflow-x:hidden;
  scrollbar-width:none;
  -ms-overflow-style:none;
  overscroll-behavior:contain;
  outline:none;
}
.pd-wheel-col::-webkit-scrollbar{ width:0; height:0; }
.pd-wheel-col:focus-visible{ box-shadow:inset 0 0 0 2px var(--dsw-alias-state-business-primary,#4a90e2); border-radius:var(--dsw-radius-sm,8px); }
.pd-wheel-item{
  height:32px;
  display:flex;align-items:center;justify-content:center;
  font-size:13px;
  font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-tertiary,#8a9099);
  cursor:pointer;
  user-select:none;
}
.pd-wheel-item[data-active="true"]{
  color:var(--dsw-alias-label-primary,#16181d);
  font-weight:700;
}
/* Center band: the row the wheels are reading. */
.pd-wheel-band{
  position:absolute;
  left:0; right:0; top:50%;
  height:32px;
  transform:translateY(-50%);
  border-radius:var(--dsw-radius-sm,8px);
  background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));
  pointer-events:none;
}
.pd-wheel-colon{
  align-self:center;
  font-size:14px;font-weight:700;
  color:var(--dsw-alias-label-tertiary,#8a9099);
  flex:0 0 auto;
}
.pd-pop-foot{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  margin-top:8px;padding-top:8px;
  border-top:0.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));
  font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8a9099);
}
.pd-pop-foot b{ color:var(--dsw-alias-label-primary,#16181d); font-variant-numeric:tabular-nums; font-size:12px; }

.pd-panel-actions{ display:flex; gap:8px; margin-top:13px; }
.pd-panel-actions .pd-btn{ height:36px; font-size:13.5px; }
@media (prefers-reduced-motion: reduce){
  .pd-switch span, .pd-seg button{ transition:none; }
}
`;

		/** Inject the widget stylesheet once per document, tagged like the host does. */
		function installStyles() {
			if (typeof document === 'undefined') return function () {};
			if (document.querySelector('style[data-plugin-css=' + JSON.stringify(STYLE_TAG_ID) + ']') !== null) {
				return function () {};
			}
			const tag = document.createElement('style');
			tag.dataset.plugin = 'dsh-plugin-salary-dance';
			tag.dataset.pluginCss = STYLE_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return function () {
				if (tag.parentNode !== null) tag.parentNode.removeChild(tag);
			};
		}

		/* ------------------------------------------------------------------ *
		 * Icons
		 * ------------------------------------------------------------------ */

		const PATHS = {
			chevron: 'M4 8.5 L8 4.5 L12 8.5',
			close: 'M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5',
			arrow: 'M3 8 H12 M8.5 4 L12.5 8 L8.5 12',
			sun: 'M8 5.2 A2.8 2.8 0 1 1 8 10.8 A2.8 2.8 0 1 1 8 5.2 M8 1.5 V3 M8 13 V14.5 M1.5 8 H3 M13 8 H14.5 M3.4 3.4 L4.5 4.5 M11.5 11.5 L12.6 12.6 M12.6 3.4 L11.5 4.5 M4.5 11.5 L3.4 12.6',
						window: 'M2.5 3.5 H13.5 V12.5 H2.5 Z M2.5 6.5 H13.5',
						clock: 'M8 2.5 A5.5 5.5 0 1 1 7.99 2.5 M8 4.6 V8 L10.2 9.4',
			calendar: 'M2.5 4 H13.5 V13 H2.5 Z M2.5 6.8 H13.5 M5.5 2.5 V5 M10.5 2.5 V5',
			gear: 'M13.0107 7.79377C12.9505 7.89401 12.9205 7.94413 12.9205 7.99951C12.9205 8.0549 12.9505 8.10502 13.0106 8.20528L13.9849 9.83006C14.045 9.93029 14.0751 9.9804 14.0751 10.0358C14.0751 10.0911 14.045 10.1413 13.9849 10.2415L13.0037 11.8777C12.9468 11.9726 12.9184 12.0201 12.8725 12.0461C12.8267 12.072 12.7713 12.072 12.6607 12.072H10.6704C10.5598 12.072 10.5045 12.072 10.4586 12.098C10.4128 12.1239 10.3843 12.1714 10.3274 12.2662L9.33825 13.9142C9.28133 14.009 9.25287 14.0564 9.20703 14.0823C9.16118 14.1083 9.10588 14.1083 8.99529 14.1083H7.00486C6.89426 14.1083 6.83896 14.1083 6.79312 14.0823C6.74727 14.0564 6.71881 14.009 6.6619 13.9142L5.67273 12.2662C5.61581 12.1714 5.58735 12.1239 5.54151 12.098C5.49566 12.072 5.44036 12.072 5.32977 12.072H3.33945C3.2288 12.072 3.17347 12.072 3.12761 12.0461C3.08176 12.0201 3.0533 11.9726 2.9964 11.8777L2.0152 10.2415C1.9551 10.1413 1.92505 10.0911 1.92505 10.0358C1.92505 9.9804 1.9551 9.93029 2.0152 9.83006L2.98951 8.20528C3.04963 8.10502 3.07969 8.0549 3.07969 7.99951C3.07968 7.94413 3.04961 7.89401 2.98946 7.79377L2.01529 6.17011C1.95514 6.06987 1.92507 6.01975 1.92507 5.96437C1.92506 5.90899 1.95512 5.85886 2.01524 5.7586L2.9964 4.1224C3.0533 4.0275 3.08176 3.98005 3.12761 3.95408C3.17347 3.92811 3.2288 3.92811 3.33945 3.92811H5.32977C5.44036 3.92811 5.49566 3.92811 5.54151 3.90216C5.58735 3.87621 5.61581 3.82879 5.67273 3.73397L6.6619 2.08599C6.71881 1.99116 6.74727 1.94375 6.79312 1.9178C6.83896 1.89185 6.89426 1.89185 7.00486 1.89185H8.99529C9.10588 1.89185 9.16118 1.89185 9.20703 1.9178C9.25287 1.94375 9.28133 1.99116 9.33825 2.08599L10.3274 3.73397C10.3843 3.82879 10.4128 3.87621 10.4586 3.90216C10.5045 3.92811 10.5598 3.92811 10.6704 3.92811H12.6607C12.7713 3.92811 12.8267 3.92811 12.8725 3.95408C12.9184 3.98005 12.9468 4.0275 13.0037 4.1224L13.9849 5.7586C14.045 5.85886 14.0751 5.90899 14.0751 5.96437C14.0751 6.01975 14.045 6.06987 13.9849 6.17011L13.0107 7.79377Z M8 9.75012C8.9665 9.75012 9.75 8.96662 9.75 8.00012C9.75 7.03362 8.9665 6.25012 8 6.25012C7.0335 6.25012 6.25 7.03362 6.25 8.00012C6.25 8.96662 7.0335 9.75012 8 9.75012Z'
		};

		function Icon(props) {
			const size = props.size || 16;
			return h(
				'svg',
				{
					viewBox: '0 0 16 16',
					width: size,
					height: size,
					fill: 'none',
					stroke: 'currentColor',
					strokeWidth: props.strokeWidth || 1.4,
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					'aria-hidden': true,
					style: { display: 'block' }
				},
				(PATHS[props.name] || '').split(' M').map(function (segment, index) {
					return h('path', { key: index, d: (index === 0 ? '' : 'M') + segment });
				})
			);
		}

		/* ------------------------------------------------------------------ *
		 * Shared controls
		 * ------------------------------------------------------------------ */

		function Switch(props) {
			return h(
				'button',
				{
					type: 'button',
					className: 'pd-switch',
					role: 'switch',
					'aria-checked': props.checked ? 'true' : 'false',
					'aria-label': props.label,
					onClick: function () { props.onChange(!props.checked); }
				},
				h('span', null)
			);
		}

		function SwitchRow(props) {
			return h(
				'div',
				{ className: 'pd-switchrow' },
				h('span', { className: 'ic' }, h(Icon, { name: props.icon, size: 15 })),
				h('div', { className: 'tx' },
					h('div', { className: 'a' }, props.title),
					props.hint ? h('div', { className: 'b' }, props.hint) : null
				),
				h(Switch, { checked: props.checked, label: props.title, onChange: props.onChange })
			);
		}

		/** Numeric field that keeps a partial edit alive while the user types. */
		function NumberField(props) {
			const [draft, setDraft] = React.useState(String(props.value));
			const [editing, setEditing] = React.useState(false);
			React.useEffect(function () {
				if (!editing) setDraft(String(props.value));
			}, [props.value, editing]);
			return h(
				'div',
				{ className: 'pd-input' },
				h('input', {
					type: 'text',
					inputMode: 'decimal',
					value: draft,
					'aria-label': props.label,
					onFocus: function () { setEditing(true); },
					onChange: function (event) {
						const next = event.target.value;
						if (!/^[0-9]*\.?[0-9]*$/.test(next)) return;
						setDraft(next);
						const parsed = Number(next);
						if (next !== '' && Number.isFinite(parsed)) props.onChange(parsed);
					},
					onBlur: function () {
						setEditing(false);
						setDraft(String(props.value));
					}
				}),
				props.unit ? h('span', { className: 'unit' }, props.unit) : null
			);
		}

		function Segmented(props) {
			return h(
				'div',
				{ className: 'pd-seg', role: 'group', 'aria-label': props.label },
				props.options.map(function (option) {
					return h(
						'button',
						{
							key: option.value,
							type: 'button',
							'aria-pressed': props.value === option.value ? 'true' : 'false',
							onClick: function () { props.onChange(option.value); }
						},
						option.label
					);
				})
			);
		}

		/* ------------------------------------------------------------------ *
		 * Scroll wheel time picker
		 *
		 * Each column is a real scroll container: mouse wheel, trackpad, touch
		 * drag, click-to-pick and the arrow keys all move it, and the rows snap to
		 * the centre once the gesture stops. The value is published while the wheel
		 * moves, so the field reads correctly before the snap finishes.
		 * ------------------------------------------------------------------ */

		const ROW_H = 32;
		const HOURS = Array.from({ length: 24 }, function (_, index) { return index; });
		const MINUTES = Array.from({ length: 60 }, function (_, index) { return index; });
		const SNAP_DELAY_MS = 110;

		function WheelColumn(props) {
			const items = props.items;
			const scrollRef = React.useRef(null);
			const timerRef = React.useRef(0);
			const gestureRef = React.useRef(0);

			function indexOf(scrollTop) {
				return Math.min(items.length - 1, Math.max(0, Math.round(scrollTop / ROW_H)));
			}

			/** Glide the column so `index` sits under the centre band. */
			function scrollToIndex(index, smooth) {
				const node = scrollRef.current;
				if (node === null) return;
				gestureRef.current = 0;
				const top = index * ROW_H;
				if (Math.abs(node.scrollTop - top) < 1) return;
				if (smooth && typeof node.scrollTo === 'function') node.scrollTo({ top: top, behavior: 'smooth' });
				else node.scrollTop = top;
			}

			// Centre the value when the picker opens, or when it changes from
			// somewhere other than this wheel.
			React.useEffect(function () {
				const node = scrollRef.current;
				if (node === null) return;
				if (gestureRef.current > Date.now()) return; // mid-gesture: leave it alone
				scrollToIndex(props.index, false);
			}, [props.index]);

			React.useEffect(function () {
				return function () { window.clearTimeout(timerRef.current); };
			}, []);

			function onScroll() {
				const node = scrollRef.current;
				if (node === null) return;
				gestureRef.current = Date.now() + 1200;
				const index = indexOf(node.scrollTop);
				if (index !== props.index) props.onIndex(index);
				window.clearTimeout(timerRef.current);
				timerRef.current = window.setTimeout(function () {
					const settled = indexOf(node.scrollTop);
					scrollToIndex(settled, true);
					if (settled !== props.index) props.onIndex(settled);
				}, SNAP_DELAY_MS);
			}

			function onKeyDown(event) {
				const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
				const jump = event.key === 'PageUp' ? -5 : event.key === 'PageDown' ? 5 : 0;
				const delta = step !== 0 ? step : jump;
				if (delta === 0) return;
				event.preventDefault();
				const next = Math.min(items.length - 1, Math.max(0, props.index + delta));
				props.onIndex(next);
				scrollToIndex(next, true);
			}

			const pad = 'calc(50% - ' + ROW_H / 2 + 'px)';
			return h(
				'div',
				{
					className: 'pd-wheel-col',
					ref: scrollRef,
					role: 'listbox',
					tabIndex: 0,
					'aria-label': props.label,
					'aria-activedescendant': props.idPrefix + '-' + props.index,
					onScroll: onScroll,
					onKeyDown: onKeyDown
				},
				h('div', { style: { height: pad } }),
				items.map(function (value, index) {
					return h(
						'div',
						{
							key: value,
							id: props.idPrefix + '-' + index,
							className: 'pd-wheel-item',
							role: 'option',
							'aria-selected': index === props.index ? 'true' : 'false',
							'data-active': index === props.index ? 'true' : 'false',
							onClick: function () {
								props.onIndex(index);
								scrollToIndex(index, true);
							}
						},
						props.format(value)
					);
				}),
				h('div', { style: { height: pad } })
			);
		}

		/** Approximate popover height: wheels (160) + padding + hint row. */
		const POPOVER_HEIGHT = 196;

		/**
		 * Where a 196px popover should sit for a trigger at `rect`: centred on the
		 * trigger, kept inside the viewport horizontally, and flipped above the
		 * trigger when the space below cannot hold it.
		 */
		function placePopover(rect, width) {
			const margin = 8;
			const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
			const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
			const top = rect.top + rect.height + 6;
			const flip = top + POPOVER_HEIGHT > viewportHeight - margin;
			const left = Math.min(
				Math.max(rect.left + rect.width / 2 - width / 2, margin),
				Math.max(margin, viewportWidth - width - margin)
			);
			return {
				left: left,
				top: flip ? Math.max(margin, rect.top - POPOVER_HEIGHT - 6) : top,
				flip: flip
			};
		}

		/** `HH:mm` field backed by the two scroll wheels. */
		function TimePicker(props) {
			const [open, setOpen] = React.useState(false);
			const [draft, setDraft] = React.useState(props.value);
			const [placement, setPlacement] = React.useState(null);
			const rootRef = React.useRef(null);
			const popRef = React.useRef(null);
			const idPrefix = React.useRef('pdw' + Math.random().toString(36).slice(2, 8)).current;

			const total = toMinutes(draft, 0);
			const hours = Math.floor(total / 60);
			const minutes = total % 60;

			function pad(value) {
				return String(value).padStart(2, '0');
			}

			function commit(next) {
				setDraft(next);
				props.onChange(next);
			}

			/** Anchor the fixed popover to the trigger's current box. */
			function reposition() {
				const node = rootRef.current;
				if (node === null) return;
				const trigger = node.querySelector('.pd-trigger');
				if (trigger === null) return;
				setPlacement(placePopover(trigger.getBoundingClientRect(), 196));
			}

			// Opening re-reads the committed value, so a cancelled edit never lingers,
			// and measures where the popover should sit. Deliberately keyed on `open`
			// alone: keying it on the value would re-measure on every wheel tick and
			// fight the gesture.
			React.useEffect(function () {
				if (open) setDraft(props.value);
			}, [open]);

			React.useEffect(function () {
				if (!open) {
					setPlacement(null);
					return undefined;
				}
				reposition();
				function onResize() { reposition(); }
				window.addEventListener('resize', onResize);
				return function () { window.removeEventListener('resize', onResize); };
			}, [open]);

			React.useEffect(function () {
				if (!open) return undefined;
				function onDown(event) {
					const insideTrigger = rootRef.current !== null && rootRef.current.contains(event.target);
					const insidePopover = popRef.current !== null && popRef.current.contains(event.target);
					if (!insideTrigger && !insidePopover) setOpen(false);
				}
				function onKey(event) {
					if (event.key === 'Escape') setOpen(false);
				}
				// The wheels take focus, so key handling stays on the document rather
				// than on a wrapper the popover no longer lives inside.
				document.addEventListener('pointerdown', onDown, true);
				document.addEventListener('keydown', onKey);
				return function () {
					document.removeEventListener('pointerdown', onDown, true);
					document.removeEventListener('keydown', onKey);
				};
			}, [open]);

			return h(
				'div',
				{ className: 'pd-picker', ref: rootRef },
				h(
					'button',
					{
						type: 'button',
						className: 'pd-trigger',
						disabled: props.disabled === true,
						'aria-label': props.label,
						'aria-haspopup': 'dialog',
						'aria-expanded': open ? 'true' : 'false',
						onClick: function () { setOpen(!open); }
					},
					h('span', null, draft),
					h('span', { className: 'clock' }, h(Icon, { name: 'clock', size: 13 }))
				),
				open
					? h(
							'div',
							{
								className: 'pd-pop',
								ref: popRef,
								role: 'dialog',
								'aria-label': props.label,
								style: placement === null
									? { visibility: 'hidden', left: 0, top: 0 }
									: { left: placement.left + 'px', top: placement.top + 'px' }
							},
							h(
								'div',
								{ style: { position: 'relative' } },
								h('div', { className: 'pd-wheel-band' }),
								h(
									'div',
									{ className: 'pd-wheels' },
									h(WheelColumn, {
										items: HOURS,
										index: hours,
										label: props.hourLabel,
										idPrefix: idPrefix + '-h',
										format: pad,
										onIndex: function (index) { commit(pad(index) + ':' + pad(minutes)); }
									}),
									h('span', { className: 'pd-wheel-colon' }, ':'),
									h(WheelColumn, {
										items: MINUTES,
										index: minutes,
										label: props.minuteLabel,
										idPrefix: idPrefix + '-m',
										format: pad,
										onIndex: function (index) { commit(pad(hours) + ':' + pad(index)); }
									})
								)
							),
							h(
								'div',
								{ className: 'pd-pop-foot' },
								h('span', null, props.hint),
								h('b', null, draft)
							)
						)
					: null
			);
		}

		/* ------------------------------------------------------------------ *
		 * The widget
		 * ------------------------------------------------------------------ */

		function SalaryDanceWidget(props) {
			const t = props.t;
			const [config, setConfig] = React.useState(loadConfig);
			const [open, setOpen] = React.useState(false);
			const [step, setStep] = React.useState(1);
			const [now, setNow] = React.useState(function () { return new Date(); });
			const [tick, setTick] = React.useState(0);
			const [pos, setPos] = React.useState({ right: 20, top: 56 });
			const rootRef = React.useRef(null);
			const dragRef = React.useRef(null);
			const rafRef = React.useRef(null);
			// Latest per-frame price of this instant; `null` until the first frame, which
			// is how the renderer knows to fall back to the heartbeat's reading.
			const frameRef = React.useRef(null);
			// Read through a ref so the animation loop never captures a stale config.
			const configRef = React.useRef(config);
			configRef.current = config;

			// The calendar's answer for the current month. Declared before the effects
			// below, which keep the working-days row in step with it.
			const actual = monthWorkdays(now.getFullYear(), now.getMonth(), config.workDays);
			const actualCount = actual.count;

			// One one-second heartbeat advances the clock the card reads. It used to be
			// skipped in mini mode to keep an idle page quiet — but the amount is derived
			// from that clock, so skipping it froze the mini figure. It now runs in both
			// modes: one `setNow` a second is not what made the page busy.
			React.useEffect(function () {
				const id = window.setInterval(function () { setNow(new Date()); }, 1000);
				return function () { window.clearInterval(id); };
			}, [config.miniFloat, open]);

			React.useEffect(function () {
				saveConfig(config);
			}, [config]);

			// Keep the working-days row showing the calendar's answer until the user
			// takes it over. Keyed on `open` as well, so reopening the panel reflects a
			// month that has since rolled over.
			React.useEffect(function () {
				if (config.manualWorkdaysOverride === true) return;
				if (config.manualWorkdays === actualCount) return;
				update({ manualWorkdays: actualCount });
			}, [open, actualCount, config.manualWorkdaysOverride, config.manualWorkdays]);

			function update(patch) {
				setConfig(function (previous) { return Object.assign({}, previous, patch); });
			}

			/* -------- derived numbers -------- */

			const allowed = config.workDays.indexOf(isoWeekday(now.getDay())) >= 0;
			const shift = solveShift(config, now);
			const pay = computePay(config, now, actual, shift.hoursPerDay);
			// The projection's own daily rate, which is monthly-derived by definition.
			const basisConfig = Object.assign({}, config, { salaryMode: 'monthly' });
			const basisDaily = dailyRate(basisConfig, actual, shift.hoursPerDay);
			// The figure shown, priced at this render. `tick` is what schedules the
			// render; it is deliberately not part of the arithmetic, so a render that
			// arrives late still shows the amount true for its own instant. In hourly
			// mode the day's value follows the configured shift, so a short day pays
			// less rather than a full shift's worth.
			const liveEarned = earnedAt(config, new Date());
			// `earnedAt` already returns 0 off the configured week; hourly mode prices
			// the served hours directly, so it needs the same gate.
			const earnedNow = allowed && config.salaryMode === 'hourly'
				? pay.hourly * (shift.servedMin / 60)
				: liveEarned;
			const shownProjected = allowed ? pay.daily : earnedNow;
			// The true amount at this instant. The animation prices its own instant
			// through the same helper, so the two can never disagree.
			const earned = earnedAt(config, now);
			// Both the full card and the compact view read this one value, so they can
			// never disagree about what has been earned. Before the first animation frame
			// it falls back to the heartbeat's reading.
			const shownEarned = frameRef.current === null ? earned : frameRef.current;
			// A rest day serves nothing: the shift window is still solved (so the clock
			// times stay meaningful) but nothing is counted against it. Without this the
			// progress rail climbs through a Saturday as if the shift were running.
			const servedMin = allowed ? shift.servedMin : 0;
			const remainingMin = allowed ? shift.remainingMin : shift.workSpanMin;
			const progress = allowed ? shift.progress : 0;
			const served = formatDuration(servedMin);
			const remaining = formatDuration(remainingMin);

			// Countdown motion.
			//
			// `earnedAt(config, date)` keeps milliseconds, so the amount is already a
			// continuous function of the clock: nothing needs interpolating, it only
			// has to be *read* often and priced at render time. A one-frame counter
			// re-renders the card, and the figure is then derived from the live clock.
			//
			// Two rules keep that honest. The heartbeat (once a second) owns everything
			// month-shaped: the working-day count, the rates, the day-off status. And
			// the displayed figure is rounded *down* rather than to nearest, so the card
			// can never claim an amount that has not been earned yet.

			React.useEffect(function () {
				// Kept in mini mode too: this loop is what makes the figure move. It only
				// bumps a counter and re-renders, so the compact view stays cheap.
				const reduce = typeof window.matchMedia === 'function'
					&& window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				// Under reduced motion the second heartbeat is enough; otherwise the
				// counter advances once per frame, which is what makes the tail turn.
				if (reduce) return undefined;
				function frame() {
					// Priced from the live clock, not from the heartbeat's `earned`: that
					// keeps the figure independent of how often month-level state refreshes,
					// which is exactly the coupling that froze the compact view.
					frameRef.current = earnedAt(configRef.current, new Date());
					setTick(function (previous) { return previous + 1; });
					rafRef.current = window.requestAnimationFrame(frame);
				}
				rafRef.current = window.requestAnimationFrame(frame);
				return function () {
					if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
					rafRef.current = null;
				};
			}, [config.miniFloat, open]);

			// The display may lag the true amount while catching up, so the projection
			// stat uses the true figure.
			// Four decimals, like the rate: at a typical hourly rate the last digit
			// turns over every few milliseconds, so the line is visibly alive on every
			// animation frame rather than only when a cent lands.
			const money = formatMoney(Math.floor(earnedNow * 10000) / 10000, 4);
			const moneyParts = money.split('.');
			const hourlyText = formatMoney(pay.hourly, 4);

			/* -------- dragging -------- */

			function onPointerDown(event) {
				if (event.button !== 0) return;
				const node = rootRef.current;
				if (node === null) return;
				const rect = node.getBoundingClientRect();
				dragRef.current = {
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					originRight: window.innerWidth - rect.right,
					originTop: rect.top,
					width: rect.width,
					height: rect.height
				};
				if (typeof event.currentTarget.setPointerCapture === 'function') {
					event.currentTarget.setPointerCapture(event.pointerId);
				}
			}

			function onPointerMove(event) {
				const drag = dragRef.current;
				if (drag === null || drag.pointerId !== event.pointerId) return;
				const nextRight = drag.originRight - (event.clientX - drag.startX);
				const nextTop = drag.originTop + (event.clientY - drag.startY);
				setPos({
					right: Math.min(Math.max(nextRight, 4), Math.max(4, window.innerWidth - drag.width - 4)),
					top: Math.min(Math.max(nextTop, 28), Math.max(28, window.innerHeight - drag.height - 4))
				});
			}

			function onPointerUp(event) {
				const drag = dragRef.current;
				if (drag === null || drag.pointerId !== event.pointerId) return;
				dragRef.current = null;
				if (typeof event.currentTarget.releasePointerCapture === 'function') {
					try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (error) { /* already released */ }
				}
			}

			/* -------- chrome -------- */

			const rootProps = {
				className: 'pd-root',
				ref: rootRef,
				'data-raised': 'true',
				style: { right: pos.right + 'px', top: pos.top + 'px' }
			};

			// One place for the three card-level controls. The status wording
			// ("正在上班") used to sit here too, but the progress bar already says how
			// far into the shift the card is, and three icons plus that text do not fit
			// in 276px.
			function iconButton(name, label, onClick, active) {
				return h('button', {
					type: 'button',
					className: 'pd-iconbtn' + (active ? ' on' : ''),
					title: label,
					'aria-label': label,
					onPointerDown: function (event) { event.stopPropagation(); },
					onClick: function (event) { event.stopPropagation(); onClick(); }
				}, h(Icon, { name: name, size: 13 }));
			}

			const header = h(
				'div',
				{
					className: 'pd-head',
					onPointerDown: onPointerDown,
					onPointerMove: onPointerMove,
					onPointerUp: onPointerUp,
					onPointerCancel: onPointerUp
				},
				h('span', { className: 'pd-dot' }),
				h('span', { className: 'pd-title' }, '薪跳 SalaryDance'),
				h('span', { className: 'pd-head-actions' },
					(!open && config.miniFloat)
						? iconButton('window', t('tip.miniOff'), function () { update({ miniFloat: false }); }, true)
						: (!open ? iconButton('window', t('tip.miniOn'), function () { update({ miniFloat: true }); }, false) : null),
					open
						? iconButton('close', t('action.collapse'), function () { setOpen(false); setStep(1); }, false)
						: iconButton('gear', t('action.configure'), function () { setOpen(true); setStep(1); }, false)
				)
			);

			function spanConn() {
				return h('span', { className: 'pd-conn' });
			}

			function stepChip(index) {
				const labels = [t('step.salary'), t('step.time')];
				return h(
					'span',
					{ className: 'pd-step' + (step === index ? ' on' : '') },
					h('span', { className: 'n' }, String(index)),
					h('span', { className: 'l' }, labels[index - 1])
				);
			}

			function stat(label, value) {
				return h('div', { className: 'pd-stat' }, h('div', { className: 'k' }, label), h('div', { className: 'v' }, value));
			}

			function stepRail() {
				return h('div', { className: 'pd-steps' }, stepChip(1), spanConn(), stepChip(2));
			}

			function calendarNote() {
				if (pay.manual) return h('div', { className: 'pd-note' }, t('note.manualOn').replace('{n}', String(pay.workdays)));
				if (!pay.covered) {
					return h('div', { className: 'pd-note alert' }, t('note.noCalendar').replace('{year}', String(now.getFullYear())));
				}
				const names = Array.from(new Set(pay.holidayNames)).join(t('list.separator'));
				return h('div', { className: 'pd-note' },
					t('note.calendar')
						.replace('{month}', pay.monthLabel)
						.replace('{days}', String(pay.workdays))
						.replace('{hours}', pay.hoursPerDay.toFixed(2))
						.replace('{rate}', hourlyText),
					names === '' ? null : h('div', null, t('note.holidays').replace('{names}', names))
				);
			}

			function timePicker(field, value, disabled) {
				return h(TimePicker, {
					label: t(field),
					hourLabel: t(field + '.hour'),
					minuteLabel: t(field + '.minute'),
					hint: t('picker.hint'),
					value: value,
					disabled: disabled === true,
					onChange: function (next) {
						const patch = {};
						patch[
							field === 'field.start' ? 'startTime'
								: field === 'field.end' ? 'endTime'
									: field === 'field.lunchStart' ? 'lunchStart'
										: 'lunchEnd'
						] = next;
						update(patch);
					}
				});
			}

			function stepSalary() {
				return h(
					'div',
					null,
					stepRail(),
					h('div', { className: 'pd-group' },
						h('div', { className: 'pd-label' }, t('field.mode')),
						h(Segmented, {
							label: t('field.mode'),
							value: config.salaryMode,
							onChange: function (value) { update({ salaryMode: value }); },
							options: [
								{ value: 'monthly', label: t('mode.monthly') },
								{ value: 'daily', label: t('mode.daily') },
								{ value: 'hourly', label: t('mode.hourly') }
							]
						})
					),
					config.salaryMode === 'monthly'
						? h('div', { className: 'pd-group' },
								h('div', { className: 'pd-label' }, t('field.monthly')),
								h(NumberField, {
									label: t('field.monthly'),
									value: config.monthlySalary,
									unit: t('unit.yuan'),
									onChange: function (value) { update({ monthlySalary: value }); }
								}),
								h('div', { className: 'pd-note' }, t('note.monthly'))
							)
						: null,
					config.salaryMode === 'daily'
						? h('div', { className: 'pd-group' },
								h('div', { className: 'pd-label' }, t('field.daily')),
								h(NumberField, {
									label: t('field.daily'),
									value: config.dailySalary,
									unit: t('unit.perDay'),
									onChange: function (value) { update({ dailySalary: value }); }
								}),
								h('div', { className: 'pd-note' }, t('note.daily'))
							)
						: null,
					config.salaryMode === 'hourly'
						? h('div', { className: 'pd-group' },
								h('div', { className: 'pd-label' }, t('field.hourly')),
								h(NumberField, {
									label: t('field.hourly'),
									value: config.hourlySalary,
									unit: t('unit.perHour'),
									onChange: function (value) { update({ hourlySalary: value }); }
								}),
								h('div', { className: 'pd-note' },
									t('note.hourlyManual').replace('{rate}', hourlyText)
								)
							)
						: null,
					config.salaryMode !== 'daily'
						? h('div', { className: 'pd-group' },
								h('div', { className: 'pd-label' },
									t(config.manualWorkdaysOverride === true
										? 'field.manualWorkdays.edited'
										: 'field.manualWorkdays.label')
								),
								h('div', { className: 'pd-input' },
									h(NumberField, {
										label: t('field.manualWorkdays.label'),
										value: resolveManualWorkdays(config, actualCount),
										unit: t('unit.days'),
										onChange: function (value) {
											// Editing the row is what makes it an override; a cleared
											// field falls back to the calendar rather than to zero.
											update(value > 0
												? { manualWorkdays: value, manualWorkdaysOverride: true }
												: { manualWorkdays: 0, manualWorkdaysOverride: false });
										}
									}),
									config.manualWorkdaysOverride === true
										? h('button', {
												type: 'button',
												className: 'pd-reset',
												title: t('action.resetAuto'),
												'aria-label': t('action.resetAuto'),
												onClick: function () {
													update({ manualWorkdays: actualCount, manualWorkdaysOverride: false });
												}
											}, t('action.resetAuto'))
										: null
								),
								calendarNote()
							)
						: null
				);
			}			function monthGrid() {
				const calendar = monthCalendar(now.getFullYear(), now.getMonth(), config.workDays);
				const cells = [];
				for (let blank = 0; blank < calendar.blanks; blank += 1) {
					cells.push(h('span', { key: 'blank-' + blank, className: 'pd-cal-pad' }));
				}
				calendar.days.forEach(function (entry) {
					cells.push(h('span', {
						key: entry.day,
						className: 'pd-cal-day',
						'data-kind': entry.kind,
						title: entry.label === null ? undefined : entry.label,
						'aria-label': entry.day + ' ' + t('cal.' + entry.kind)
							+ (entry.label === null ? '' : ' ' + entry.label)
					}, String(entry.day)));
				});
				return h('div', null,
					h('div', { className: 'pd-cal-week' },
						DAY_LABELS.map(function (label, index) {
							return h('span', {
								key: label,
								className: 'pd-cal-wd',
								'data-rest': index >= 5 ? 'true' : undefined
							}, label);
						})
					),
					h('div', { className: 'pd-cal-grid' }, cells),
					h('div', { className: 'pd-cal-legend' },
						h('span', null, h('i', { 'data-kind': 'workday' }), t('cal.workday')),
						h('span', null, h('i', { 'data-kind': 'holiday' }), t('cal.holiday')),
						h('span', null, h('i', { 'data-kind': 'makeup' }), t('cal.makeup'))
					)
				);
			}

			function stepSchedule() {
				return h(
					'div',
					null,
					stepRail(),
					h('div', { className: 'pd-group' },
						h('div', { className: 'pd-label' },
							t('field.calendar')
								.replace('{month}', String(now.getMonth() + 1))
								.replace('{days}', String(actualCount))
						),
						monthGrid()
					),
					h('div', { className: 'pd-group pd-row' },
						h('div', null,
							h('div', { className: 'pd-label' }, t('field.start')),
							timePicker('field.start', config.startTime, false)
						),
						h('div', null,
							h('div', { className: 'pd-label' }, t('field.end')),
							timePicker('field.end', config.endTime, false)
						)
					),
					h('div', { className: 'pd-group' },
						h('div', { className: 'pd-label' }, t('field.lunch')),
						h('div', { className: 'pd-row' },
							h('div', null, timePicker('field.lunchStart', config.lunchStart, !config.lunchEnabled)),
							h('div', null, timePicker('field.lunchEnd', config.lunchEnd, !config.lunchEnabled))
						),
						h(SwitchRow, {
							icon: 'sun',
							title: t('field.lunchOn'),
							hint: t('hint.lunchOn'),
							checked: config.lunchEnabled,
							onChange: function (value) { update({ lunchEnabled: value }); }
						})
					),
					h('div', { className: 'pd-note' }, t('note.shift'))
				);
			}			const cardBody = open
				? h('div', null,
						// The step names live in the rail inside the panel; this row only
						// carries the way back out, so nothing is said twice.
						h('div', { className: 'pd-panel-head' },
							iconButton('close', t('action.collapse'), function () { setOpen(false); setStep(1); }, false)
						),
						h('div', { className: 'pd-panel' },
							step === 1 ? stepSalary() : null,
							step === 2 ? stepSchedule() : null,
							h('div', { className: 'pd-panel-actions' },
								step > 1
									? h('button', {
											type: 'button',
											className: 'pd-btn ghost',
											'aria-label': t('action.back'),
											onClick: function () { setStep(step - 1); }
										}, h(Icon, { name: 'chevron', size: 13 }))
									: null,
								step < 2
									? h('button', {
											type: 'button',
											className: 'pd-btn',
											onClick: function () { setStep(step + 1); }
										}, t('action.next'), h(Icon, { name: 'arrow', size: 13 }))
									: h('button', {
											type: 'button',
											className: 'pd-btn',
											onClick: function () { setOpen(false); setStep(1); }
										}, t('action.done'), h(Icon, { name: 'arrow', size: 13 }))
							)
						)
					)
				: h('div', { className: 'pd-body' },
						h('div', { className: 'pd-caption' },
							h('span', null, t('caption.today')),
							h('span', { className: 'pd-caprate' }, '¥' + hourlyText + '/' + t('unit.hour'))
						),
						h('div', { className: 'pd-amount', 'aria-live': 'off' },
							h('span', { className: 'sym' }, '¥'),
							h('span', { className: 'int' }, groupMoney(moneyParts[0])),
							h('span', { className: 'frac' }, '.' + moneyParts[1])
						),
						h('div', { className: 'pd-stats' },
							stat(t('stat.worked'), served.hours + ' h ' + served.minutes + ' m'),
							stat(t('stat.remaining'), remaining.hours + ' h ' + remaining.minutes + ' m'),
							stat(t('stat.projected'), '¥' + formatMoney(shownProjected))
						),
						h('div', {
							className: 'pd-bar',
							role: 'progressbar',
							'aria-valuemin': 0,
							'aria-valuemax': 100,
							'aria-valuenow': Math.round(progress * 100),
							'aria-label': t('stat.progress')
						}, h('span', { className: 'knob', style: { left: (progress * 100).toFixed(2) + '%' } })),
						// The projection is worth trusting only if it says what it is
						// projecting over, so the footer names the month and its actual
						// working-day count rather than only an amount. The settings
						// affordance is a compact icon on the same row, which is all it
						// needs: the three step names already say what settings holds.
						h('div', { className: 'pd-foot-row' },
							h('div', { className: 'pd-rate pd-foot' },
								h('span', null, t('foot.monthTotal')),
								h('span', { className: 'b' }, '¥' + formatMoney(pay.monthTotal))
							),
							h('button', {
								type: 'button',
								className: 'pd-gear',
								title: t('action.configure'),
								'aria-label': t('action.configure'),
								onClick: function () { setOpen(true); setStep(1); }
							},
								h(Icon, { name: 'gear', size: 13, strokeWidth: 1.3 }),
								h(Icon, { name: 'chevron', size: 11, strokeWidth: 1.5 })
							)
						),
						h('div', { className: 'pd-foot-meta' },
							h(Icon, { name: 'calendar', size: 11 }),
							h('span', { className: 'lead' },
								t('foot.basisDate')
									.replace('{year}', String(now.getFullYear()))
									.replace('{month}', String(now.getMonth() + 1))
							),
							h('span', null, t('foot.basisDays')
								.replace('{days}', String(pay.workdays))
								.replace('{unit}', t('unit.days'))
							),
							h('span', null, t('foot.basisDaily')
								.replace('{amount}', formatMoney(basisDaily))
								.replace('{unit}', t('unit.yuan'))
							)
						)
					);

			return h('div', rootProps, h('div', { className: 'pd-card' }, header, cardBody));
		}

		/* ------------------------------------------------------------------ *
		 * Dictionaries and plugin body
		 * ------------------------------------------------------------------ */

		const DICTIONARIES = {
			zh: {
				'caption.today': '今日入账',
				'stat.worked': '已工作',
				'stat.remaining': '距离下班',
				'stat.projected': '今日预计',
				'stat.rate': '时薪',
				'stat.progress': '今日工作进度',
				'unit.hour': '时',
				'unit.days': '天',
				'unit.yuan': '元',
				'unit.perDay': '元 / 天',
				'unit.perHour': '元 / 时',
				'list.separator': '、',
				'action.configure': '设置',
				'action.next': '下一步',
				'action.back': '上一步',
				'action.done': '完成配置，开始使用',
				'action.collapse': '收起',
				'tip.miniOn': '切到精简模式',
				'tip.miniOff': '退出精简模式',
				'foot.monthTotal': '本月预计',
				'foot.basisDate': '{year}年{month}月',
				'foot.basisDays': '实际工作日 {days} {unit}',
				'foot.basisDaily': '日薪 {amount} {unit}',
				'step.salary': '薪资模式',
				'step.time': '工作时间',
				'field.mode': '选择薪资模式',
				'mode.monthly': '月薪',
				'mode.daily': '日薪',
				'mode.hourly': '时薪',
				'field.monthly': '月薪金额',
				'field.daily': '日薪金额',
				'field.hourly': '时薪金额',
				'field.manualWorkdays.label': '本月实际工作日',
				'field.manualWorkdays.edited': '本月实际工作日（已改为自定）',
				'action.resetAuto': '恢复自动',
				'field.calendar': '{month} 月工作日历 · 共 {days} 天',
				'cal.workday': '工作日',
				'cal.holiday': '法定节假日',
				'cal.makeup': '调休上班',
				'cal.rest': '休息日',
				'field.start': '上班时间',
				'field.end': '下班时间',
				'field.lunch': '午休时间（可选）',
				'field.lunchStart': '午休开始',
				'field.lunchEnd': '午休结束',
				'field.lunchOn': '扣除午休',
				'field.hour': '小时',
				'field.minute': '分钟',
				'field.start.hour': '上班小时',
				'field.start.minute': '上班分钟',
				'field.end.hour': '下班小时',
				'field.end.minute': '下班分钟',
				'field.lunchStart.hour': '午休开始小时',
				'field.lunchStart.minute': '午休开始分钟',
				'field.lunchEnd.hour': '午休结束小时',
				'field.lunchEnd.minute': '午休结束分钟',
				'hint.lunchOn': '午休时段不计入工作时长',
				'picker.hint': '滚动选择',
				'note.monthly': '按法定节假日后当月实际工作日摊算。',
				'note.daily': '每个工作日固定计价。',
				'note.hourlyManual': '时薪 = 月薪 ÷ 当月实际工作日 ÷ 每日工作时长；当前为 ¥{rate}/时。',
				'note.calendar': '{month}：实际工作日 {days} 天，每日有效工时 {hours} 小时，折合时薪 ¥{rate}。',
				'note.manualOn': '已手动指定本月 {n} 个工作日，暂不使用法定日历。',
				'note.noCalendar': '{year} 年的法定节假日安排尚未内置，暂按周一至周五估算。',
				'note.holidays': '本月节假日：{names}',
				'note.shift': '跨夜班次同样支持：下班时间早于上班时间即视为次日下班。',
				'note.prefs': '以上偏好保存在本机浏览器中，不会上传。',
			},
			en: {
				'caption.today': "Today's earnings",
				'stat.worked': 'Worked',
				'stat.remaining': 'Until off-work',
				'stat.projected': "Today's estimate",
				'stat.rate': 'Rate',
				'stat.progress': "Today's work progress",
				'unit.hour': 'h',
				'unit.days': 'days',
				'unit.yuan': 'CNY',
				'unit.perDay': 'CNY / day',
				'unit.perHour': 'CNY / h',
				'list.separator': ', ',
				'action.configure': 'Configure',
				'action.next': 'Next',
				'action.back': 'Back',
				'action.done': 'Finish and start',
				'action.collapse': 'Collapse',
				'tip.miniOn': 'Switch to the compact view',
				'tip.miniOff': 'Leave the compact view',
				'foot.monthTotal': 'Month estimate',
				'foot.basisDate': '{month}/{year}',
				'foot.basisDays': '{days} working {unit}',
				'foot.basisDaily': '{amount} {unit}/day',
				'step.salary': 'Pay mode',
				'step.time': 'Work hours',
				'field.mode': 'Pay mode',
				'mode.monthly': 'Monthly',
				'mode.daily': 'Daily',
				'mode.hourly': 'Hourly',
				'field.monthly': 'Monthly salary',
				'field.daily': 'Daily rate',
				'field.hourly': 'Hourly rate',
				'field.manualWorkdays.label': 'Working days this month',
				'field.manualWorkdays.edited': 'Working days this month (set by hand)',
				'action.resetAuto': 'Use calendar',
				'field.calendar': '{month} calendar · {days} working days',
				'cal.workday': 'Working day',
				'cal.holiday': 'Public holiday',
				'cal.makeup': 'Makeup workday',
				'cal.rest': 'Rest day',
				'field.start': 'Start',
				'field.end': 'End',
				'field.lunch': 'Lunch break (optional)',
				'field.lunchStart': 'Break start',
				'field.lunchEnd': 'Break end',
				'field.lunchOn': 'Deduct lunch break',
				'field.hour': 'Hour',
				'field.minute': 'Minute',
				'field.start.hour': 'Start hour',
				'field.start.minute': 'Start minute',
				'field.end.hour': 'End hour',
				'field.end.minute': 'End minute',
				'field.lunchStart.hour': 'Break start hour',
				'field.lunchStart.minute': 'Break start minute',
				'field.lunchEnd.hour': 'Break end hour',
				'field.lunchEnd.minute': 'Break end minute',
				'hint.lunchOn': 'The break does not count as worked time',
				'picker.hint': 'scroll to pick',
				'note.monthly': 'Spread over the month\u2019s actual working days after public holidays.',
				'note.daily': 'A fixed rate for every working day.',
				'note.hourlyManual': 'Hourly = monthly \u00f7 working days \u00f7 daily hours; now \u00a5{rate}/h.',
				'note.calendar': '{month}: {days} working days, {hours} paid hours a day, \u00a5{rate} an hour.',
				'note.manualOn': 'Manually set to {n} working days; the holiday calendar is not used.',
				'note.noCalendar': 'No built-in holiday schedule for {year}; Monday to Friday is assumed.',
				'note.holidays': 'Holidays this month: {names}',
				'note.shift': 'Overnight shifts work too: an end earlier than the start means the next day.',
				'note.prefs': 'These preferences stay in this browser and are never uploaded.',
			}
		};

		/** Register the widget and its dictionaries; everything is an owned effect. */
		function apply(ctx) {
			ctx.effect(installStyles, 'salarydance: styles');

			if (ctx.locale !== undefined && typeof ctx.locale.register === 'function') {
				ctx.effect(function () {
					return ctx.locale.register(NS, DICTIONARIES);
				}, 'salarydance: dictionaries');
			}

			ctx.slots.inject('shell.overlay', function () {
				return ctx.slots.register(
					{
						name: 'shell.overlay',
						id: ROW_ID,
						order: 5,
						locale: NS,
						inject: function () { return { frame: 'salarydance' }; }
					},
					SalaryDanceWidget
				);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.SalaryDanceWidget = SalaryDanceWidget;
		/** Pure helpers and data exported for the headless regression tests. */
		exports.__internal = {
			CSS: CSS,
			ROW_ID: ROW_ID,
			PACKAGE_NAME: PACKAGE_NAME,
			STORAGE_KEY: STORAGE_KEY,
			ICON_PATHS: PATHS,
			DICTIONARIES: DICTIONARIES,
			HOLIDAYS: HOLIDAYS,
			MAKEUP_WORKDAYS: MAKEUP_WORKDAYS,
			CALENDAR_YEARS: CALENDAR_YEARS,
			monthWorkdays: monthWorkdays,
			monthCalendar: monthCalendar,
			earnedAt: earnedAt,
			placePopover: placePopover,
			resolveManualWorkdays: resolveManualWorkdays,
			manualWorkdaysOf: manualWorkdaysOf,
			POPOVER_HEIGHT: POPOVER_HEIGHT,
			dailyRate: dailyRate,
			solveShift: solveShift,
			computePay: computePay,
			formatMoney: formatMoney,
			loadConfig: loadConfig,
			toMinutes: toMinutes,
			DEFAULT_CONFIG: DEFAULT_CONFIG
		};
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
