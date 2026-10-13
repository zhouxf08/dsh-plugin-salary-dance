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
		const STYLE_TAG_ID = 'dsh-plugin-salary-dance/widget.css';
		const STORAGE_KEY = PACKAGE_NAME + '/config.v1';

		/* ------------------------------------------------------------------ *
		 * Defaults and configuration
		 * ------------------------------------------------------------------ */

		const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

		const DEFAULT_CONFIG = {
			salaryMode: 'monthly', // 'monthly' | 'daily' | 'hourly'
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
			theme: 'light', // 'light' | 'dark' | 'system'
			alwaysOnTop: true,
			miniFloat: false,
			autoLaunch: false
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
			if (SALARY_MODES.indexOf(merged.salaryMode) < 0) merged.salaryMode = DEFAULT_CONFIG.salaryMode;
			if (THEMES.indexOf(merged.theme) < 0) merged.theme = DEFAULT_CONFIG.theme;
			if (!Array.isArray(merged.workDays)) merged.workDays = DEFAULT_CONFIG.workDays.slice();
			merged.workDays = merged.workDays
				.filter(function (day) { return Number.isInteger(day) && day >= 1 && day <= 7; })
				.sort(function (a, b) { return a - b; });
			['monthlySalary', 'dailySalary', 'hourlySalary', 'workDaysPerMonth'].forEach(function (key) {
				const value = Number(merged[key]);
				merged[key] = Number.isFinite(value) && value >= 0 ? value : DEFAULT_CONFIG[key];
			});
			['startTime', 'endTime', 'lunchStart', 'lunchEnd'].forEach(function (key) {
				if (!isClockString(merged[key])) merged[key] = DEFAULT_CONFIG[key];
			});
			['lunchEnabled', 'alwaysOnTop', 'miniFloat', 'autoLaunch'].forEach(function (key) {
				merged[key] = merged[key] === true;
			});
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

		/** Minutes after midnight for a date, with fractional seconds kept. */
		function minutesOfDay(date) {
			return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
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
				breakMin: breakMin,
				servedMin: servedRaw,
				remainingMin: Math.max(0, workSpan - servedRaw),
				progress: workSpan > 0 ? Math.min(1, Math.max(0, servedRaw / workSpan)) : 0,
				before: resolvedNow < startMin,
				after: resolvedNow >= startMin + span,
				overnight: overnight
			};
		}

		/** Count the configured work days in a month, ignoring public holidays. */
		function workDaysInMonth(year, month, workDays) {
			const total = new Date(year, month + 1, 0).getDate();
			let count = 0;
			for (let day = 1; day <= total; day += 1) {
				const weekday = new Date(year, month, day).getDay();
				if (workDays.indexOf(weekday === 0 ? 7 : weekday) >= 0) count += 1;
			}
			return count;
		}

		/**
		 * Derive today's numbers from the configuration.
		 * `daily` is the pay for one full configured work day.
		 * @param dailyHours - paid hours in one full shift, used by hourly mode.
		 */
		function computePay(config, date, dailyHours) {
			const mode = config.salaryMode;
			const year = date.getFullYear();
			const month = date.getMonth();
			const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
			const workDaysThisMonth = workDaysInMonth(year, month, config.workDays);

			let daily = 0;
			if (mode === 'monthly') {
				const divisor = workDaysThisMonth > 0 ? workDaysThisMonth : config.workDaysPerMonth;
				daily = divisor > 0 ? config.monthlySalary / divisor : 0;
			} else if (mode === 'daily') {
				daily = config.dailySalary;
			} else {
				daily = config.hourlySalary * Math.max(0, dailyHours || 0);
			}
			return { daily: daily, monthLabel: monthNames[month], workDaysThisMonth: workDaysThisMonth };
		}

		/** Format a currency amount with two decimals and no symbol. */
		function formatMoney(value) {
			const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
			return safe.toFixed(2);
		}

		/** Format a duration in minutes as parts, so the card can style each unit. */
		function formatDuration(minutes) {
			const safe = Math.max(0, Math.round(minutes || 0));
			const hours = Math.floor(safe / 60);
			const mins = safe % 60;
			return { hours: hours, minutes: mins, text: hours + ' h ' + mins + ' m' };
		}

		/** Group a money string with thousands separators, keeping both decimals. */
		function groupMoney(text) {
			const parts = String(text).split('.');
			parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
			return parts.join('.');
		}

		/* ------------------------------------------------------------------ *
		 * Styles
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
  width:288px;
  box-sizing:border-box;
  border-radius:var(--dsw-radius-lg,14px);
  border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));
  background:var(--dsw-alias-bg-layer-2,#fff);
  box-shadow:var(--dsw-shadow-lv2,0 8px 28px rgba(16,24,40,.14));
  overflow:hidden;
  transition:box-shadow 140ms ease, background 140ms ease;
}
.pd-root[data-theme="dark"] .pd-card{
  background:var(--dsw-alias-bg-layer-2,#1b1c20);
  border-color:var(--dsw-alias-border-l3,rgba(255,255,255,.14));
}
.pd-root[data-theme="dark"]{
  color:var(--dsw-alias-label-primary,#f2f3f5);
}
.pd-head{
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
  box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary,#f68b1f) 22%, transparent);
  flex:0 0 auto;
}
.pd-title{
  font-size:13px;
  font-weight:600;
  letter-spacing:.01em;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.pd-status{
  margin-left:auto;
  font-size:11px;
  color:var(--dsw-alias-label-tertiary,#8a9099);
  white-space:nowrap;
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
.pd-body{ padding:0 14px 12px; }
.pd-caption{
  font-size:11px;
  color:var(--dsw-alias-label-tertiary,#8a9099);
  text-align:center;
  letter-spacing:.02em;
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
.pd-root[data-theme="dark"] .pd-amount{ color:var(--dsw-alias-label-primary,#f2f3f5); }
.pd-amount .sym{ font-size:19px; font-weight:600; opacity:.82; }
.pd-amount .int{ font-size:31px; font-weight:700; letter-spacing:-.02em; line-height:1.05; }
.pd-amount .frac{ font-size:19px; font-weight:600; opacity:.82; }
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
.pd-actions{ display:flex; gap:8px; margin-top:12px; }
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
.pd-btn.ghost{
  flex:0 0 auto;
  width:34px;
  background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));
  color:var(--dsw-alias-label-secondary,#4a505a);
}
.pd-btn.ghost:hover{ background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.09)); }
.pd-foot{
  font-size:10.5px;
  color:var(--dsw-alias-label-tertiary,#8a9099);
  text-align:center;
  margin-top:8px;
}
.pd-mini{
  display:flex;align-items:center;gap:6px;
  padding:6px 12px 8px;
  cursor:pointer;
  user-select:none;
}
.pd-mini .v{ font-size:15px;font-weight:700;font-variant-numeric:tabular-nums; }
.pd-mini .sym{ font-size:11px;font-weight:600;opacity:.8; }
.pd-mini .cap{ font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8a9099); }
.pd-panel{ padding:0 14px 14px; }
.pd-panel-head{
  display:flex;align-items:center;gap:8px;
  padding:9px 14px;
  border-bottom:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));
}
.pd-panel-head .b{
  font-size:13px;font-weight:700;
  border:0;background:transparent;color:inherit;padding:0;cursor:pointer;font-family:inherit;
}
.pd-panel-head .b.off{ color:var(--dsw-alias-label-tertiary,#8a9099); font-weight:500; }
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
.pd-root[data-theme="dark"] .pd-step.on .l{ color:var(--dsw-alias-label-primary,#f2f3f5); }
.pd-conn{ flex:1 1 auto; height:1px; background:var(--dsw-alias-border-l2,rgba(0,0,0,.1)); }
.pd-group{ margin-top:11px; }
.pd-label{ font-size:11.5px; color:var(--dsw-alias-label-secondary,#4a505a); margin-bottom:6px; }
.pd-seg{
  display:flex;
  border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));
  border-radius:var(--dsw-radius-md,10px);
  overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.02));
}
.pd-seg button{
  flex:1 1 0; appearance:none; border:0; background:transparent; font-family:inherit;
  font-size:12px; height:30px; cursor:pointer; color:var(--dsw-alias-label-secondary,#4a505a);
  padding:0 4px;
}
.pd-seg button + button{ border-left:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08)); }
.pd-seg button[aria-pressed="true"]{
  background:var(--dsw-alias-button-primary-fill,#f68b1f);
  color:var(--dsw-alias-label-primary-foreground,#fff);
  font-weight:600;
}
.pd-input{
  display:flex;align-items:center;gap:6px;
}
.pd-input input{
  flex:1 1 auto; min-width:0;
  height:34px; box-sizing:border-box;
  border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));
  border-radius:var(--dsw-radius-sm,8px);
  background:var(--dsw-alias-bg-layer-1,#fff);
  color:var(--dsw-alias-label-primary,#16181d);
  padding:0 9px; font-size:12.5px; font-family:inherit;
  font-variant-numeric:tabular-nums;
}
.pd-root[data-theme="dark"] .pd-input input{ background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04)); color:var(--dsw-alias-label-primary,#f2f3f5); }
.pd-input input:focus-visible{
  outline:2px solid var(--dsw-alias-brand-primary,#f68b1f);
  outline-offset:1px;
}
.pd-input .unit{ font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8a9099); flex:0 0 auto; }
.pd-row{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.pd-days{ display:flex; gap:5px; }
.pd-days button{
  flex:1 1 0; appearance:none; font-family:inherit; cursor:pointer;
  height:28px; border-radius:var(--dsw-radius-sm,8px);
  border:0.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));
  background:transparent; color:var(--dsw-alias-label-secondary,#4a505a);
  font-size:11.5px; padding:0;
}
.pd-days button[aria-pressed="true"]{
  background:var(--dsw-alias-button-primary-fill,#f68b1f);
  border-color:transparent;
  color:var(--dsw-alias-label-primary-foreground,#fff);
  font-weight:600;
}
.pd-note{ font-size:10.5px; color:var(--dsw-alias-label-tertiary,#8a9099); margin-top:6px; line-height:1.45; }
.pd-switchrow{
  display:flex; align-items:center; gap:10px;
  padding:9px 0;
  border-bottom:0.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));
}
.pd-switchrow:last-child{ border-bottom:0; }
.pd-switchrow .ic{
  width:16px; height:16px; flex:0 0 auto;
  color:var(--dsw-alias-label-secondary,#4a505a);
  display:inline-flex; align-items:center; justify-content:center;
}
.pd-switchrow .tx{ flex:1 1 auto; min-width:0; }
.pd-switchrow .tx .a{ font-size:12.5px; }
.pd-switchrow .tx .b{ font-size:10.5px; color:var(--dsw-alias-label-tertiary,#8a9099); margin-top:1px; }
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
  background:#fff;
  box-shadow:0 1px 2px rgba(0,0,0,.25);
  transition:transform 120ms ease;
}
.pd-switch[aria-checked="true"] span{ transform:translateX(16px); }
.pd-switch:focus-visible{ outline:2px solid var(--dsw-alias-brand-primary,#f68b1f); outline-offset:2px; }
.pd-seal{
  display:flex; align-items:center; gap:9px;
  margin-top:11px; padding:9px 10px;
  border-radius:var(--dsw-radius-md,10px);
  background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.02));
  border:0.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));
}
.pd-seal .tx .a{ font-size:11.5px; font-weight:600; }
.pd-seal .tx .b{ font-size:10.5px; color:var(--dsw-alias-label-tertiary,#8a9099); margin-top:1px; }
.pd-panel-actions{ display:flex; gap:8px; margin-top:13px; }
.pd-panel-actions .pd-btn{ height:36px; font-size:13.5px; }
@media (prefers-reduced-motion: reduce){
  .pd-card, .pd-switch span{ transition:none; }
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
		 * Small view helpers
		 * ------------------------------------------------------------------ */

		function Icon(props) {
			const paths = {
				chevron: 'M4 8.5 L8 4.5 L12 8.5',
				close: 'M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5',
				arrow: 'M3 8 H12 M8.5 4 L12.5 8 L8.5 12',
				shield: 'M8 2 L13 4 V8 C13 11 10.8 13.2 8 14 C5.2 13.2 3 11 3 8 V4 Z',
				check: 'M3.5 8.5 L6.5 11.5 L12.5 4.5',
				sun: 'M8 5.2 A2.8 2.8 0 1 1 8 10.8 A2.8 2.8 0 1 1 8 5.2 M8 1.5 V3 M8 13 V14.5 M1.5 8 H3 M13 8 H14.5 M3.4 3.4 L4.5 4.5 M11.5 11.5 L12.6 12.6 M12.6 3.4 L11.5 4.5 M4.5 11.5 L3.4 12.6',
				pin: 'M6 2 H10 M8 2 V9 M4.5 9 H11.5 L8 14 Z',
				window: 'M2.5 3.5 H13.5 V12.5 H2.5 Z M2.5 6.5 H13.5',
				power: 'M8 2.5 V7.5 M4.4 4.6 A4.6 4.6 0 1 0 11.6 4.6'
			};
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
				(paths[props.name] || '').split(' M').map(function (segment, index) {
					return h('path', { key: index, d: (index === 0 ? '' : 'M') + segment });
				})
			);
		}

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
				h('div', { className: 'tx' }, h('div', { className: 'a' }, props.title), props.hint ? h('div', { className: 'b' }, props.hint) : null),
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

		/** Time field that commits on every valid `HH:mm` value. */
		function TimeField(props) {
			return h('input', {
				type: 'time',
				step: 60,
				value: props.value,
				disabled: props.disabled === true,
				'aria-label': props.label,
				onChange: function (event) {
					const next = event.target.value;
					if (isClockString(next)) props.onChange(next);
				}
			});
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
		 * The widget
		 * ------------------------------------------------------------------ */

		function SalaryDanceWidget(props) {
			const t = props.t;
			const [config, setConfig] = React.useState(loadConfig);
			const [open, setOpen] = React.useState(false);
			const [step, setStep] = React.useState(1);
			const [now, setNow] = React.useState(function () { return new Date(); });
			const [pos, setPos] = React.useState({ right: 20, top: 56 });
			const rootRef = React.useRef(null);
			const dragRef = React.useRef(null);

			// One timer drives the whole card; it stops while the card is collapsed
			// into mini mode to keep an idle page quiet.
			React.useEffect(function () {
				if (config.miniFloat && !open) return undefined;
				const id = window.setInterval(function () { setNow(new Date()); }, 1000);
				return function () { window.clearInterval(id); };
			}, [config.miniFloat, open]);

			React.useEffect(function () {
				saveConfig(config);
			}, [config]);

			function update(patch) {
				setConfig(function (previous) { return Object.assign({}, previous, patch); });
			}

			function toggleDay(day) {
				const has = config.workDays.indexOf(day) >= 0;
				const next = has
					? config.workDays.filter(function (item) { return item !== day; })
					: config.workDays.concat([day]).sort(function (a, b) { return a - b; });
				if (next.length === 0) return;
				update({ workDays: next });
			}

			/* Dragging: the header moves the card, bounded to the viewport. */
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

			const allowed = config.workDays.indexOf(now.getDay() === 0 ? 7 : now.getDay()) >= 0;
			const shift = solveShift(config, now);
			const pay = computePay(config, now, shift.workSpanMin / 60);
			// Today already paid, from real served work minutes.
			const earned = shift.workSpanMin > 0 ? pay.daily * (shift.servedMin / shift.workSpanMin) : 0;
			// Whole-day projection: a configured work day projects the full day;
			// an off day only adds what was actually served.
			const projected = allowed ? pay.daily : earned;
			const monthTotal = pay.daily * pay.workDaysThisMonth;
			const served = formatDuration(shift.servedMin);
			const remaining = formatDuration(shift.remainingMin);
			const money = formatMoney(earned);
			const moneyParts = money.split('.');


			const rootProps = {
				className: 'pd-root',
				ref: rootRef,
				'data-raised': config.alwaysOnTop ? 'true' : undefined,
				style: { right: pos.right + 'px', top: pos.top + 'px' }
			};

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
				!open ? h('span', { className: 'pd-status' }, allowed ? (shift.after ? t('status.done') : shift.before ? t('status.before') : t('status.working')) : t('status.off')) : null,
				open
					? h('button', {
							type: 'button',
							className: 'pd-iconbtn',
							'aria-label': t('action.collapse'),
							onPointerDown: function (event) { event.stopPropagation(); },
							onClick: function (event) { event.stopPropagation(); setOpen(false); setStep(1); }
						}, h(Icon, { name: 'close', size: 12 }))
					: null
			);

			if (config.miniFloat && !open) {
				return h(
					'div',
					rootProps,
					h(
						'div',
						{ className: 'pd-card' },
						header,
						h(
							'div',
							{ className: 'pd-mini', onClick: function () { setOpen(true); }, role: 'button', tabIndex: 0,
								onKeyDown: function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); } } },
							h('span', { className: 'sym' }, '¥'),
							h('span', { className: 'v' }, groupMoney(money)),
							h('span', { className: 'cap' }, t('mini.today'))
						)
					)
				);
			}

			const cardBody = open
				? h(
						'div',
						null,
						h(
							'div',
							{ className: 'pd-panel-head' },
							stepTab(1),
							span4(),
							stepTab(2),
							span4(),
							stepTab(3)
						),
						h(
							'div',
							{ className: 'pd-panel' },
							step === 1 ? stepSalary() : null,
							step === 2 ? stepSchedule() : null,
							step === 3 ? stepPrefs() : null,
							h(
								'div',
								{ className: 'pd-panel-actions' },
								step > 1
									? h('button', { type: 'button', className: 'pd-btn ghost', 'aria-label': t('action.back'), onClick: function () { setStep(step - 1); } }, h(Icon, { name: 'chevron', size: 13 }))
									: null,
								step < 3
									? h('button', { type: 'button', className: 'pd-btn', onClick: function () { setStep(step + 1); } }, t('action.next'), h(Icon, { name: 'arrow', size: 13 }))
									: h('button', { type: 'button', className: 'pd-btn', onClick: function () { setOpen(false); setStep(1); } }, t('action.done'), h(Icon, { name: 'arrow', size: 13 }))
							),
							h(
								'div',
								{ className: 'pd-seal' },
								h('span', { className: 'ic', style: { color: 'var(--dsw-alias-brand-primary,#f68b1f)' } }, h(Icon, { name: 'shield', size: 17 })),
								h('div', { className: 'tx' }, h('div', { className: 'a' }, t('privacy.title')), h('div', { className: 'b' }, t('privacy.body')))
							)
						)
					)
				: h(
						'div',
						{ className: 'pd-body' },
						h('div', { className: 'pd-caption' }, t('caption.today')),
						h(
							'div',
							{ className: 'pd-amount', 'aria-live': 'off' },
							h('span', { className: 'sym' }, '¥'),
							h('span', { className: 'int' }, groupMoney(moneyParts[0])),
							h('span', { className: 'frac' }, '.' + moneyParts[1])
						),
						h(
							'div',
							{ className: 'pd-stats' },
							stat(t('stat.worked'), served.hours + ' h ' + served.minutes + ' m'),
							stat(t('stat.remaining'), remaining.hours + ' h ' + remaining.minutes + ' m'),
							stat(t('stat.projected'), '¥' + formatMoney(projected))
						),
						h('div', { className: 'pd-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(shift.progress * 100), 'aria-label': t('stat.progress') },
							h('span', { className: 'knob', style: { left: (shift.progress * 100).toFixed(2) + '%' } })
						),
						h(
							'div',
							{ className: 'pd-actions' },
							h('button', { type: 'button', className: 'pd-btn', onClick: function () { setOpen(true); setStep(1); } }, t('action.configure'), h(Icon, { name: 'arrow', size: 13 }))
						),
						h('div', { className: 'pd-foot' }, t('foot.month').replace('{month}', pay.monthLabel).replace('{total}', groupMoney(formatMoney(monthTotal))))
					);

			return h('div', rootProps, h('div', { className: 'pd-card' }, header, cardBody));

			/* Inline step bodies: declared inside the component so they close over state. */

			function span4() {
				return h('span', { className: 'pd-conn' });
			}

			function stepChip(index) {
				const labels = [t('step.salary'), t('step.time'), t('step.prefs')];
				return h('span', { className: 'pd-step' + (step === index ? ' on' : '') },
					h('span', { className: 'n' }, String(index)),
					h('span', { className: 'l' }, labels[index - 1])
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
			}